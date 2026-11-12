module.exports = Object.freeze({
  totalRounds: 10,
  durationMs: 20_000,
  pointsPerCorrect: 10,
  pointsPerWrong: 0,
  // true: cùng điểm thì ai có tổng thời gian trả lời đúng ít hơn xếp trên.
  // false: cùng điểm thì đồng hạng.
  tieBreakByTime: true,
  maxPlayers: 300,
  leaderboardSize: 10,
  answerOptions: ["A", "B", "C", "D"],
  minPlayerNameLength: 2,
  maxPlayerNameLength: 40,
  maxClassLength: 30
});
