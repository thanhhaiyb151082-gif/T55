const gameState = require("./gameState");
const config = require("../../config/game.config");

function stepOf(player, round) {
  return player.plan?.[round - 1] || null;
}

// Câu hỏi của người chơi ở vòng `round`, đã xáo thứ tự đáp án. Không chứa đáp án đúng.
function questionFor(player, round) {
  const step = stepOf(player, round);
  if (!step) return null;
  const q = gameState.questions[step.qIndex];
  const options = {};
  step.optionOrder.forEach((originalKey, i) => {
    options[config.answerOptions[i]] = q.options[originalKey];
  });
  return {
    id: q.id,
    question: q.question,
    image: q.image || null,
    options,
    durationMs: gameState.durationMs
  };
}

module.exports = { stepOf, questionFor };
