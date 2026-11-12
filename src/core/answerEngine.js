const { performance } = require("node:perf_hooks");
const gameState = require("./gameState");
const config = require("../../config/game.config");

function submitAnswer(playerId, selectedAnswer) {
  const player = gameState.players.get(playerId);

  if (!player) {
    return { success: false, code: "PLAYER_NOT_FOUND", message: "Không tìm thấy người chơi." };
  }

  if (player.status !== "ACTIVE") {
    return { success: false, code: "NOT_ACTIVE", message: "Bạn chưa tham gia vòng chơi này." };
  }

  if (gameState.status !== "PLAYING" || gameState.roundStatus !== "OPEN") {
    return { success: false, code: "ROUND_CLOSED", message: "Vòng thi chưa mở hoặc đã kết thúc." };
  }

  if (!config.answerOptions.includes(selectedAnswer)) {
    return { success: false, code: "INVALID_ANSWER", message: "Đáp án không hợp lệ." };
  }

  if (gameState.answers.has(playerId)) {
    return { success: false, code: "ALREADY_ANSWERED", message: "Bạn đã gửi đáp án cho câu này." };
  }

  // Capture server receive time as soon as the handler starts.
  const receivedAt = Date.now();
  const receivedMono = performance.now();

  if (
    gameState.endsMono === null ||
    receivedMono > gameState.endsMono ||
    receivedAt > gameState.endsAt
  ) {
    return { success: false, code: "TIME_EXPIRED", message: "Đã hết thời gian trả lời." };
  }

  // Mỗi người chơi có thứ tự câu hỏi và thứ tự đáp án riêng.
  const step = player.plan?.[gameState.currentRound - 1];
  const question = step ? gameState.questions[step.qIndex] : null;
  if (!question) {
    return { success: false, code: "QUESTION_NOT_FOUND", message: "Không tìm thấy câu hỏi." };
  }

  const responseTimeMs = Math.max(0, Math.round(receivedMono - gameState.startedMono));
  const arrivalSequence = ++gameState.arrivalSequence;
  // Chữ cái người chơi bấm (theo thứ tự đã xáo) -> khoá gốc của phương án.
  const originalKey = step.optionOrder[config.answerOptions.indexOf(selectedAnswer)];
  const isCorrect = originalKey === question.correctAnswer;

  const record = {
    playerId,
    round: gameState.currentRound,
    selectedAnswer: originalKey,   // khoá gốc, dùng để thống kê theo câu
    selectedDisplay: selectedAnswer, // chữ cái người chơi nhìn thấy
    isCorrect,
    receivedAt,
    responseTimeMs,
    arrivalSequence
  };

  gameState.answers.set(playerId, record);
  player.answerHistory.push(record);

  return {
    success: true,
    code: "ANSWER_RECEIVED",
    message: "Máy chủ đã ghi nhận câu trả lời.",
    round: gameState.currentRound,
    responseTimeMs,
    receivedAt
  };
}

module.exports = { submitAnswer };
