const questions = require("../../data/questions.json");
const config = require("../../config/game.config");
const { validateQuestions } = require("./validateQuestions");

validateQuestions(questions, config);

const gameState = {
  status: "WAITING",          // WAITING | PLAYING | FINISHED
  roundStatus: "WAITING",     // WAITING | OPEN | CLOSED
  currentRound: 0,
  totalRounds: config.totalRounds,
  durationMs: config.durationMs,
  pointsPerCorrect: config.pointsPerCorrect,
  questions,

  // Map<playerId, player>. Người chơi có: score, correctCount, totalCorrectTimeMs, roundPoints[], lastResult
  players: new Map(),

  // Map<playerId, answerRecord> của vòng đang mở
  answers: new Map(),

  // Thống kê tích luỹ theo từng câu hỏi (chỉ số trong questions.json), dùng cho trang quản trị.
  questionStats: [],

  roundResults: [],           // kết quả công khai của từng câu đã chấm
  leaderboard: [],            // bảng xếp hạng đầy đủ, cập nhật sau mỗi câu
  startedAt: null,
  endsAt: null,
  startedMono: null,
  endsMono: null,
  timerId: null,
  arrivalSequence: 0
};

module.exports = gameState;
