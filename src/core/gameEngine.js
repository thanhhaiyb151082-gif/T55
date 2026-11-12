const gameState = require("./gameState");
const config = require("../../config/game.config");
const {
  clearRoundTimer,
  setRoundClock,
  scheduleRoundEnd
} = require("./timerEngine");
const { scoreRound, resetScores } = require("./rankingEngine");
const { buildPlan } = require("./shuffle");
const { questionFor } = require("./playerView");

let ioRef = null;
let stateTimer = null;

function setIO(io) {
  ioRef = io;
}

function allPlayers() {
  return [...gameState.players.values()];
}

function getPublicSnapshot() {
  return {
    status: gameState.status,
    roundStatus: gameState.roundStatus,
    currentRound: gameState.currentRound,
    totalRounds: gameState.totalRounds,
    durationMs: gameState.durationMs,
    pointsPerCorrect: gameState.pointsPerCorrect,
    startedAt: gameState.startedAt,
    endsAt: gameState.endsAt,
    serverNow: Date.now(),
    // Câu hỏi không có trong trạng thái chung: mỗi người chơi nhận câu hỏi riêng (đã xáo) qua socket riêng.
    playerCount: gameState.players.size
  };
}

// Thống kê tích luỹ theo từng câu hỏi (theo số thứ tự trong questions.json), chỉ các câu đã có người làm.
function questionStats() {
  return gameState.questions
    .map((q, i) => {
      const st = gameState.questionStats[i];
      return st && st.total > 0
        ? {
            questionId: q.id,
            correctAnswer: q.correctAnswer,
            totalParticipants: st.total,
            totalCorrect: st.correct,
            optionCounts: st.counts
          }
        : null;
    })
    .filter(Boolean);
}

function getAdminSnapshot() {
  const rankById = new Map(gameState.leaderboard.map(item => [item.playerId, item.rank]));

  return {
    ...getPublicSnapshot(),
    answeredCount: gameState.answers.size,
    onlineCount: allPlayers().filter(p => p.socketId).length,
    players: allPlayers().map(p => ({
      id: p.id,
      name: p.name,
      className: p.className,
      status: p.status,
      online: Boolean(p.socketId),
      score: p.score,
      correctCount: p.correctCount,
      totalCorrectTimeMs: p.totalCorrectTimeMs,
      roundPoints: p.pointsByQuestion,   // điểm theo số thứ tự câu trong questions.json
      rank: rankById.get(p.id) ?? null
    })),
    leaderboard: gameState.leaderboard,
    questionStats: questionStats(),
    latestRound: gameState.roundResults.at(-1) || null
  };
}

// Dữ liệu riêng của từng người chơi: điểm, hạng, kết quả câu gần nhất, đáp án đã chọn ở câu đang mở.
function getPlayerSync(playerId) {
  const player = gameState.players.get(playerId);
  if (!player) return null;
  const entry = gameState.leaderboard.find(item => item.playerId === playerId);
  const open = gameState.roundStatus === "OPEN";
  return {
    round: gameState.currentRound,
    roundStatus: gameState.roundStatus,
    endsAt: gameState.endsAt,
    serverNow: Date.now(),
    // Câu hỏi riêng của người chơi ở vòng đang mở (nếu có).
    question: open && player.plan ? questionFor(player, gameState.currentRound) : null,
    score: player.score,
    correctCount: player.correctCount,
    rank: entry ? entry.rank : null,
    totalPlayers: gameState.leaderboard.length || gameState.players.size,
    lastResult: player.lastResult,
    currentAnswer: open
      ? (gameState.answers.get(playerId)?.selectedDisplay ?? null)
      : null
  };
}

function emitState() {
  if (!ioRef) return;
  ioRef.emit("game:state", getPublicSnapshot());
  ioRef.to("admins").emit("admin:state", getAdminSnapshot());
}

// Gộp nhiều thay đổi liên tiếp (vào phòng, mất kết nối) thành một lần phát để không quá tải.
function scheduleEmitState() {
  if (stateTimer) return;
  stateTimer = setTimeout(() => {
    stateTimer = null;
    emitState();
  }, 300);
  stateTimer.unref?.();
}

function startRound(roundNumber) {
  if (!ioRef) throw new Error("Socket.IO chưa được khởi tạo.");
  if (gameState.status === "FINISHED") throw new Error("Trò chơi đã kết thúc.");
  if (gameState.roundStatus === "OPEN") throw new Error("Vòng hiện tại vẫn đang diễn ra.");
  if (!Number.isInteger(roundNumber) || roundNumber < 1 || roundNumber > config.totalRounds) {
    throw new Error("Số vòng không hợp lệ.");
  }
  if (roundNumber !== gameState.currentRound + 1) {
    throw new Error("Chỉ được mở câu kế tiếp theo đúng thứ tự.");
  }
  if (!allPlayers().some(p => p.status === "ACTIVE")) {
    throw new Error("Không có người chơi nào đang tham gia.");
  }

  gameState.status = "PLAYING";
  gameState.currentRound = roundNumber;
  gameState.roundStatus = "OPEN";
  gameState.answers.clear();
  gameState.arrivalSequence = 0;

  setRoundClock();

  // Mỗi người chơi nhận câu hỏi riêng của mình (thứ tự câu và thứ tự đáp án đã được xáo).
  for (const player of allPlayers()) {
    if (!player.socketId || player.status !== "ACTIVE") continue;
    ioRef.to(player.socketId).emit("round:started", {
      round: roundNumber,
      totalRounds: gameState.totalRounds,
      question: questionFor(player, roundNumber),
      startedAt: gameState.startedAt,
      endsAt: gameState.endsAt,
      serverNow: Date.now(),
      durationMs: gameState.durationMs,
      pointsPerCorrect: gameState.pointsPerCorrect
    });
  }

  scheduleRoundEnd(endRound);
  emitState();

  return { round: roundNumber, endsAt: gameState.endsAt };
}

function endRound() {
  if (gameState.roundStatus !== "OPEN") return null;

  // Đóng trước, rồi mới chấm: đáp án đến muộn hoặc gửi trùng không thể chen vào.
  gameState.roundStatus = "CLOSED";
  clearRoundTimer();

  const result = scoreRound();
  gameState.roundResults.push(result);

  const finished = result.round === config.totalRounds;
  if (finished) gameState.status = "FINISHED";

  // Kết quả riêng từng người: câu hỏi của họ, đáp án đúng, giải thích, điểm, hạng, top bảng xếp hạng.
  for (const player of allPlayers()) {
    if (player.socketId && player.lastResult) {
      ioRef.to(player.socketId).emit("player:result", player.lastResult);
    }
  }

  if (finished) {
    ioRef.emit("game:finished", {
      totalPlayers: result.totalPlayers,
      leaderboard: result.leaderboard,
      message: "Trò chơi đã kết thúc. Cảm ơn các bạn đã tham gia!"
    });
  }

  emitState();
  return result;
}

function startGame() {
  if (gameState.status !== "WAITING" || gameState.currentRound !== 0) {
    throw new Error("Trò chơi đã được bắt đầu hoặc đã kết thúc. Hãy đặt lại trước.");
  }
  const players = allPlayers();
  if (players.length === 0) throw new Error("Chưa có người chơi đăng ký.");

  resetScores();
  players.forEach(player => {
    player.status = "ACTIVE";
    player.plan = buildPlan(gameState.questions.length, config.answerOptions);
  });

  return startRound(1);
}

function nextRound() {
  if (gameState.status !== "PLAYING" || gameState.roundStatus !== "CLOSED") {
    throw new Error("Câu hiện tại chưa kết thúc.");
  }
  if (gameState.currentRound >= config.totalRounds) {
    throw new Error("Đã hoàn thành câu cuối.");
  }
  return startRound(gameState.currentRound + 1);
}

function resetGame() {
  clearRoundTimer();
  gameState.status = "WAITING";
  gameState.roundStatus = "WAITING";
  gameState.currentRound = 0;
  gameState.startedAt = null;
  gameState.endsAt = null;
  gameState.startedMono = null;
  gameState.endsMono = null;
  gameState.answers.clear();
  gameState.roundResults = [];
  gameState.arrivalSequence = 0;

  resetScores();
  for (const player of gameState.players.values()) player.status = "WAITING";

  emitState();
}

function registerPlayer({ id, name, className, reconnectToken, socketId }) {
  if (gameState.status !== "WAITING" || gameState.currentRound !== 0) {
    throw new Error("Phòng chơi đã khóa đăng ký người mới.");
  }
  if (gameState.players.size >= config.maxPlayers) {
    throw new Error(`Phòng chơi đã đủ ${config.maxPlayers} người.`);
  }
  const player = {
    id,
    name,
    className,
    reconnectToken,
    socketId,
    status: "WAITING",
    joinedAt: Date.now(),
    score: 0,
    correctCount: 0,
    totalCorrectTimeMs: 0,
    roundPoints: new Array(gameState.totalRounds).fill(null),
    pointsByQuestion: new Array(gameState.totalRounds).fill(null),
    plan: null,
    lastResult: null,
    answerHistory: []
  };
  gameState.players.set(id, player);
  scheduleEmitState();
  return player;
}

function resumePlayer({ id, reconnectToken, socketId }) {
  const player = gameState.players.get(id);
  if (!player || player.reconnectToken !== reconnectToken) {
    throw new Error("Thông tin kết nối lại không hợp lệ.");
  }
  player.socketId = socketId;
  scheduleEmitState();
  return player;
}

function detachSocket(socketId) {
  let changed = false;
  for (const player of gameState.players.values()) {
    if (player.socketId === socketId) {
      player.socketId = null;
      changed = true;
    }
  }
  if (changed) scheduleEmitState();
}

module.exports = {
  setIO,
  getPublicSnapshot,
  getAdminSnapshot,
  getPlayerSync,
  emitState,
  startGame,
  startRound,
  endRound,
  nextRound,
  resetGame,
  registerPlayer,
  resumePlayer,
  detachSocket
};
