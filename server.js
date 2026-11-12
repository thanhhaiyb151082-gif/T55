require("dotenv").config();

const http = require("node:http");
const path = require("node:path");
const express = require("express");
const helmet = require("helmet");
const { Server } = require("socket.io");
const { rateLimit } = require("express-rate-limit");

const registerSocketHandlers = require("./src/socket");
const gameState = require("./src/core/gameState");
const adminAuth = require("./src/core/adminAuth");

const app = express();
const httpServer = http.createServer(app);

// Render/Railway đặt ứng dụng sau reverse proxy: cần để lấy đúng IP người dùng
// (giới hạn số lần đăng nhập theo IP) và nhận biết kết nối HTTPS.
app.set("trust proxy", 1);

const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

app.disable("x-powered-by");
app.use(helmet({
  // Socket.IO and same-origin static assets are used by this app.
  // The app does not use inline scripts; CSP can be tightened further if desired.
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://cdn.socket.io"],
      styleSrc: ["'self'"],
      imgSrc: ["'self'", "data:"],
      connectSrc: ["'self'", "ws:", "wss:"],
      fontSrc: ["'self'", "data:"],
      objectSrc: ["'none'"],
      frameAncestors: ["'none'"],
      // Chỉ ép nâng cấp HTTPS khi chạy thật (Render đã có HTTPS). Khi thử trên máy hoặc mạng LAN
      // qua http://localhost hay http://192.168.x.x, chỉ thị này khiến trình duyệt (nhất là Safari)
      // không tải được CSS/JS nên trang bị trắng hoặc mất giao diện.
      upgradeInsecureRequests: process.env.NODE_ENV === "production" ? [] : null
    }
  }
}));

app.use(express.json({ limit: "20kb" }));

const httpLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: "draft-7",
  legacyHeaders: false
});
app.use("/api", httpLimiter);

// Chống dò mật khẩu: tối đa 10 lần thử / 15 phút / IP.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  skipSuccessfulRequests: true, // chỉ đếm lần nhập sai
  standardHeaders: "draft-7",
  legacyHeaders: false,
  message: { success: false, code: "TOO_MANY_ATTEMPTS", message: "Thử đăng nhập quá nhiều lần. Vui lòng đợi 15 phút." }
});

app.post("/api/admin/login", loginLimiter, (req, res) => {
  res.set("Cache-Control", "no-store");
  const result = adminAuth.verifyPassword(req.body?.password);

  if (!result.ok && result.reason === "NOT_CONFIGURED") {
    return res.status(503).json({
      success: false,
      code: "NOT_CONFIGURED",
      message: "Máy chủ chưa có biến ADMIN_PASSWORD. Hãy thêm biến này trong Render > Environment rồi deploy lại."
    });
  }
  if (!result.ok) {
    return res.status(401).json({
      success: false,
      code: "WRONG_PASSWORD",
      message: "Mật khẩu quản trị không chính xác."
    });
  }

  const session = adminAuth.createSession();
  return res.status(200).json({ success: true, token: session.token, expiresAt: session.expiresAt });
});

app.post("/api/admin/logout", (req, res) => {
  adminAuth.destroySession(String(req.body?.token || ""));
  res.status(200).json({ success: true });
});

// Chỉ trả về đường dẫn ảnh (không lộ nội dung câu hỏi hay đáp án) để trình duyệt tải trước.
app.get("/api/images", (_req, res) => {
  const images = [...new Set(gameState.questions.map(q => q.image).filter(Boolean))];
  res.set("Cache-Control", "public, max-age=60");
  res.json({ images });
});

app.get("/health", (_req, res) => {
  res.status(200).json({
    ok: true,
    service: "quiz-survival",
    gameStatus: gameState.status,
    round: gameState.currentRound,
    // Chỉ cho biết có/không, không lộ giá trị mật khẩu.
    adminPasswordConfigured: adminAuth.describeConfig().configured
  });
});

app.use(express.static(path.join(__dirname, "public"), {
  extensions: ["html"],
  maxAge: process.env.NODE_ENV === "production" ? "1h" : 0
}));

app.get("/", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

app.get("/admin", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "admin.html"));
});

const io = new Server(httpServer, {
  transports: ["websocket", "polling"],
  cors: {
    origin: true,
    credentials: false
  },
  pingInterval: 25000,
  pingTimeout: 20000,
  maxHttpBufferSize: 1e5
});

registerSocketHandlers(io);

httpServer.listen(PORT, HOST, () => {
  console.log(`Quiz Survival is listening on http://${HOST}:${PORT}`);
  console.log(`Player page: http://localhost:${PORT}/`);
  console.log(`Admin page:  http://localhost:${PORT}/admin`);

  const cfg = adminAuth.describeConfig();
  if (!cfg.configured) {
    console.warn("[CẢNH BÁO] Chưa có ADMIN_PASSWORD – không thể đăng nhập trang quản trị.");
  } else if (!cfg.lengthOk) {
    console.warn(`[CẢNH BÁO] ADMIN_PASSWORD ngắn hơn ${adminAuth.MIN_PASSWORD_LENGTH} ký tự, nên đặt mật khẩu dài hơn.`);
  } else {
    console.log("ADMIN_PASSWORD: đã được cấu hình.");
  }
});

function gracefulShutdown(signal) {
  console.log(`${signal} received. Closing server...`);
  io.close(() => {
    httpServer.close(() => process.exit(0));
  });
  setTimeout(() => process.exit(1), 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));
