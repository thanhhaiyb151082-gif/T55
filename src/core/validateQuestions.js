const fs = require("node:fs");
const path = require("node:path");

// Kiểm tra data/questions.json và config khi khởi động để lỗi hiện ngay trong log, không đợi tới lúc thi.
function validateQuestions(questions, config) {
  if (!Array.isArray(questions)) throw new Error("questions.json phải là một mảng các câu hỏi.");

  const errors = [];
  const keys = config.answerOptions;

  if (questions.length !== config.totalRounds) {
    errors.push(`Số câu hỏi (${questions.length}) phải bằng totalRounds (${config.totalRounds}) trong config/game.config.js.`);
  }
  if (!Number.isFinite(config.pointsPerCorrect) || config.pointsPerCorrect <= 0) {
    errors.push("pointsPerCorrect trong config/game.config.js phải là số dương.");
  }

  questions.forEach((q, index) => {
    const label = `Câu ${index + 1}`;
    if (!q || typeof q.question !== "string" || !q.question.trim()) {
      errors.push(`${label}: thiếu nội dung câu hỏi.`);
      return;
    }
    for (const key of keys) {
      if (typeof q.options?.[key] !== "string" || !q.options[key].trim()) {
        errors.push(`${label}: thiếu đáp án ${key}.`);
      }
      if (typeof q.explanations?.[key] !== "string" || !q.explanations[key].trim()) {
        errors.push(`${label}: thiếu giải thích cho đáp án ${key} (trường "explanations").`);
      }
    }
    if (!keys.includes(q.correctAnswer)) {
      errors.push(`${label}: correctAnswer phải là một trong ${keys.join(", ")}.`);
    }
    if (q.image != null) {
      if (typeof q.image !== "string" || !q.image.startsWith("/images/") || q.image.includes("..")) {
        errors.push(`${label}: image phải có dạng "/images/ten-file.png".`);
      } else if (!fs.existsSync(path.join(__dirname, "..", "..", "public", q.image))) {
        errors.push(`${label}: không tìm thấy file ảnh public${q.image}.`);
      }
    }
  });

  if (errors.length) {
    throw new Error("data/questions.json không hợp lệ:\n- " + errors.join("\n- "));
  }
}

module.exports = { validateQuestions };
