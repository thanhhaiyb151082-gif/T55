const gameState = require("./gameState");
const config = require("../../config/game.config");

function compareRank(a, b) {
  if (b.score !== a.score) return b.score - a.score;
  if (config.tieBreakByTime && a.totalCorrectTimeMs !== b.totalCorrectTimeMs) {
    return a.totalCorrectTimeMs - b.totalCorrectTimeMs;
  }
  const byName = a.name.localeCompare(b.name, "vi");
  if (byName !== 0) return byName;
  return a.id.localeCompare(b.id);
}

// Bảng xếp hạng đầy đủ. Cùng điểm (và cùng thời gian nếu bật tieBreakByTime) thì đồng hạng.
function buildLeaderboard() {
  const sorted = [...gameState.players.values()].sort(compareRank);
  let lastKey = null;
  let lastRank = 0;
  return sorted.map((player, index) => {
    const key = config.tieBreakByTime
      ? `${player.score}|${player.totalCorrectTimeMs}`
      : `${player.score}`;
    const rank = key === lastKey ? lastRank : index + 1;
    lastKey = key;
    lastRank = rank;
    return {
      rank,
      playerId: player.id,
      name: player.name,
      className: player.className,
      score: player.score,
      correctCount: player.correctCount,
      totalCorrectTimeMs: player.totalCorrectTimeMs
    };
  });
}

function emptyStats() {
  const counts = { none: 0 };
  for (const key of config.answerOptions) counts[key] = 0;
  return { counts, total: 0, correct: 0 };
}

function resetScores() {
  for (const player of gameState.players.values()) {
    player.score = 0;
    player.correctCount = 0;
    player.totalCorrectTimeMs = 0;
    player.roundPoints = new Array(gameState.totalRounds).fill(null);       // theo thứ tự người chơi làm
    player.pointsByQuestion = new Array(gameState.totalRounds).fill(null);  // theo số thứ tự câu trong questions.json
    player.lastResult = null;
    player.answerHistory = [];
    player.plan = null;
  }
  gameState.leaderboard = [];
  gameState.questionStats = gameState.questions.map(emptyStats);
}

// Chấm điểm vòng vừa đóng. Mỗi người chơi làm một câu khác nhau trong cùng một vòng nên kết quả
// chi tiết (câu hỏi, đáp án đúng, giải thích, thống kê) được dựng riêng cho từng người.
function scoreRound() {
  const round = gameState.currentRound;
  const keys = config.answerOptions;
  const participants = [...gameState.players.values()].filter(p => p.status === "ACTIVE");

  let totalSubmitted = 0;
  let totalCorrect = 0;
  const outcomes = new Map();

  for (const player of participants) {
    const step = player.plan[round - 1];
    const stats = gameState.questionStats[step.qIndex];
    const answer = gameState.answers.get(player.id) || null;
    let points = 0;

    stats.total += 1;
    if (answer) {
      totalSubmitted += 1;
      stats.counts[answer.selectedAnswer] += 1;
      if (answer.isCorrect) {
        points = config.pointsPerCorrect;
        totalCorrect += 1;
        stats.correct += 1;
        player.correctCount += 1;
        player.totalCorrectTimeMs += answer.responseTimeMs;
      } else {
        points = config.pointsPerWrong;
      }
    } else {
      stats.counts.none += 1;
    }

    player.score += points;
    player.roundPoints[round - 1] = points;
    player.pointsByQuestion[step.qIndex] = points;
    outcomes.set(player.id, { answer, points });
  }

  const leaderboard = buildLeaderboard();
  gameState.leaderboard = leaderboard;
  const top = leaderboard.slice(0, config.leaderboardSize);
  const rankById = new Map(leaderboard.map(item => [item.playerId, item.rank]));

  for (const player of participants) {
    const { answer, points } = outcomes.get(player.id);
    const step = player.plan[round - 1];
    const q = gameState.questions[step.qIndex];
    const stats = gameState.questionStats[step.qIndex];

    // Dịch từ khoá gốc sang chữ cái mà người chơi này nhìn thấy.
    const options = {};
    const explanations = {};
    const optionCounts = { none: stats.counts.none };
    let correctAnswer = null;
    step.optionOrder.forEach((originalKey, i) => {
      const letter = keys[i];
      options[letter] = q.options[originalKey];
      explanations[letter] = q.explanations[originalKey];
      optionCounts[letter] = stats.counts[originalKey];
      if (originalKey === q.correctAnswer) correctAnswer = letter;
    });

    player.lastResult = {
      round,
      totalRounds: gameState.totalRounds,
      question: { id: q.id, question: q.question, image: q.image || null, options },
      correctAnswer,
      explanations,
      optionCounts,
      pointsPerCorrect: config.pointsPerCorrect,
      // Thống kê của riêng câu hỏi này, tính trên những người đã làm xong câu đó đến thời điểm hiện tại.
      totalParticipants: stats.total,
      totalCorrect: stats.correct,
      selectedAnswer: answer ? keys[step.optionOrder.indexOf(answer.selectedAnswer)] : null,
      isCorrect: Boolean(answer && answer.isCorrect),
      points,
      responseTimeMs: answer ? answer.responseTimeMs : null,
      score: player.score,
      correctCount: player.correctCount,
      rank: rankById.get(player.id) ?? null,
      totalPlayers: leaderboard.length,
      leaderboard: top
    };
  }

  // Tóm tắt cấp vòng (không chứa đáp án) cho trang quản trị.
  return {
    round,
    totalRounds: gameState.totalRounds,
    totalParticipants: participants.length,
    totalSubmitted,
    totalCorrect,
    totalPlayers: leaderboard.length,
    leaderboard: top,
    completedAt: Date.now()
  };
}

module.exports = { buildLeaderboard, resetScores, scoreRound };
