const crypto = require("node:crypto");

const SESSION_TTL_MS = 8 * 60 * 60 * 1000; // 8 giờ
const MIN_PASSWORD_LENGTH = 8;

// token -> thời điểm hết hạn. Lưu trong RAM (khởi động lại server thì phải đăng nhập lại).
const sessions = new Map();

/**
 * Đọc ADMIN_PASSWORD tại thời điểm gọi (không cache) từ process.env.
 * Trên Render, biến này do Dashboard cấp; file .env chỉ dùng khi chạy trên máy tính.
 * Loại bỏ khoảng trắng/xuống dòng thừa và cặp dấu nháy bao quanh thường gặp khi dán giá trị.
 */
function getAdminPassword() {
  let value = process.env.ADMIN_PASSWORD;
  if (typeof value !== "string") return null;
  value = value.trim();
  if (value.length >= 2) {
    const first = value[0];
    const last = value[value.length - 1];
    if ((first === '"' && last === '"') || (first === "'" && last === "'")) {
      value = value.slice(1, -1).trim();
    }
  }
  return value.length ? value : null;
}

function describeConfig() {
  const password = getAdminPassword();
  return {
    configured: Boolean(password),
    lengthOk: Boolean(password) && password.length >= MIN_PASSWORD_LENGTH
  };
}

function hash(value) {
  return crypto.createHash("sha256").update(String(value)).digest();
}

// So sánh hằng thời gian, không lộ độ dài mật khẩu.
function verifyPassword(input) {
  const expected = getAdminPassword();
  if (!expected) return { ok: false, reason: "NOT_CONFIGURED" };
  const candidate = String(input ?? "").trim();
  const match = crypto.timingSafeEqual(hash(candidate), hash(expected));
  return match ? { ok: true } : { ok: false, reason: "WRONG_PASSWORD" };
}

function pruneSessions() {
  const now = Date.now();
  for (const [token, expiresAt] of sessions) {
    if (expiresAt <= now) sessions.delete(token);
  }
}

function createSession() {
  pruneSessions();
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, expiresAt);
  return { token, expiresAt };
}

function isValidSession(token) {
  if (typeof token !== "string" || token.length !== 64) return false;
  const expiresAt = sessions.get(token);
  if (!expiresAt) return false;
  if (expiresAt <= Date.now()) {
    sessions.delete(token);
    return false;
  }
  return true;
}

function destroySession(token) {
  sessions.delete(token);
}

module.exports = {
  getAdminPassword,
  describeConfig,
  verifyPassword,
  createSession,
  isValidSession,
  destroySession,
  MIN_PASSWORD_LENGTH
};
