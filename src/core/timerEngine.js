const { performance } = require("node:perf_hooks");
const gameState = require("./gameState");

function clearRoundTimer() {
  if (gameState.timerId) {
    clearTimeout(gameState.timerId);
    gameState.timerId = null;
  }
}

function setRoundClock() {
  clearRoundTimer();

  const monoNow = performance.now();
  const wallNow = Date.now();

  gameState.startedAt = wallNow;
  gameState.endsAt = wallNow + gameState.durationMs;
  gameState.startedMono = monoNow;
  gameState.endsMono = monoNow + gameState.durationMs;
}

function scheduleRoundEnd(callback) {
  clearRoundTimer();

  const remaining = Math.max(0, gameState.endsMono - performance.now());
  gameState.timerId = setTimeout(() => {
    gameState.timerId = null;
    callback();
  }, remaining);
}

function getRemainingMs() {
  if (gameState.roundStatus !== "OPEN" || gameState.endsMono === null) return 0;
  return Math.max(0, gameState.endsMono - performance.now());
}

module.exports = {
  clearRoundTimer,
  setRoundClock,
  scheduleRoundEnd,
  getRemainingMs
};
