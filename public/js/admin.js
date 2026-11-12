(() => {
  const socket = io();
  const $ = id => document.getElementById(id);
  let authenticated = false;
  let lastState = null;
  let timerInterval = null;

  // Nhạc đếm ngược phát từ máy giáo viên (thường nối loa/máy chiếu): mặc định BẬT.
  if (window.QuizMusic) {
    QuizMusic.init({ storageKey: "quizMusicAdmin", defaultOn: true });
    QuizMusic.bindToggle($("musicToggle"));
  }
  let musicRound = null;

  const OPTION_KEYS = ["A", "B", "C", "D"];

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function setMessage(text, isError = false) {
    $("actionMessage").textContent = text || "";
    $("actionMessage").style.color = isError ? "#ff9aa3" : "#42d6d0";
  }
  function connection(text) { $("connectionState").textContent = text; }

  const TOKEN_KEY = "quizSurvivalAdminToken";

  function getToken() {
    try { return sessionStorage.getItem(TOKEN_KEY); } catch { return null; }
  }
  function saveToken(token) {
    try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* bỏ qua */ }
  }
  function clearToken() {
    try { sessionStorage.removeItem(TOKEN_KEY); } catch { /* bỏ qua */ }
  }

  function showLogin(message) {
    authenticated = false;
    $("dashboard").classList.add("hidden");
    $("loginPanel").classList.remove("hidden");
    $("loginMessage").textContent = message || "";
  }

  function showDashboard() {
    authenticated = true;
    $("loginMessage").textContent = "";
    $("loginPanel").classList.add("hidden");
    $("dashboard").classList.remove("hidden");
  }

  // Xác thực socket bằng token do /api/admin/login cấp.
  function authenticateSocket(token, silent) {
    socket.emit("admin:auth", { token }, response => {
      if (!response?.success) {
        clearToken();
        showLogin(silent ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : (response?.message || "Xác thực thất bại."));
        return;
      }
      showDashboard();
      setMessage("Đã đăng nhập quản trị.");
    });
  }

  socket.on("connect", () => {
    connection("Đã kết nối máy chủ");
    const token = getToken();
    if (token) authenticateSocket(token, true);
  });
  socket.on("disconnect", () => {
    connection("Mất kết nối – đang thử kết nối lại...");
    authenticated = false;
  });
  socket.on("connect_error", () => connection("Không thể kết nối máy chủ"));

  $("showPassword").addEventListener("change", event => {
    $("adminPassword").type = event.target.checked ? "text" : "password";
  });

  $("adminLoginForm").addEventListener("submit", async event => {
    event.preventDefault();
    const password = $("adminPassword").value.trim();
    if (!password) {
      $("loginMessage").textContent = "Vui lòng nhập mật khẩu.";
      return;
    }

    const button = $("loginButton");
    button.disabled = true;
    $("loginMessage").textContent = "Đang đăng nhập...";

    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
        cache: "no-store"
      });
      let data = null;
      try { data = await res.json(); } catch { /* phản hồi không phải JSON */ }

      if (!res.ok || !data?.success) {
        $("loginMessage").textContent = data?.message || `Đăng nhập thất bại (mã lỗi ${res.status}).`;
        return;
      }

      saveToken(data.token);
      $("adminPassword").value = "";
      $("adminPassword").type = "password";
      $("showPassword").checked = false;

      if (!socket.connected) {
        $("loginMessage").textContent = "Đã đăng nhập, đang chờ kết nối máy chủ...";
        return; // sự kiện "connect" sẽ tự xác thực bằng token
      }
      authenticateSocket(data.token, false);
    } catch {
      $("loginMessage").textContent = "Không kết nối được máy chủ. Kiểm tra mạng rồi thử lại.";
    } finally {
      button.disabled = false;
    }
  });

  $("logoutButton").addEventListener("click", () => {
    const token = getToken();
    clearToken();
    if (token) {
      fetch("/api/admin/logout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token })
      }).catch(() => {});
    }
    showLogin("Đã đăng xuất.");
    socket.disconnect().connect(); // tạo socket mới, bỏ quyền admin cũ
  });

  function action(eventName, confirmText) {
    if (confirmText && !window.confirm(confirmText)) return;
    socket.emit(eventName, {}, response => {
      if (!response?.success) {
        if (response?.code === "INVALID_TOKEN") {
          clearToken();
          return showLogin("Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.");
        }
        return setMessage(response?.message || "Thao tác thất bại.", true);
      }
      setMessage("Đã thực hiện thao tác.");
    });
  }

  $("startButton").addEventListener("click", () => action("admin:start", "Bắt đầu câu 1?"));
  $("nextButton").addEventListener("click", () => action("admin:next-round", "Mở câu tiếp theo?"));
  $("resetButton").addEventListener("click", () => action("admin:reset", "Đặt lại trò chơi? Toàn bộ điểm và kết quả hiện tại sẽ bị xóa."));
  $("exportButton").addEventListener("click", exportCsv);

  socket.on("admin:state", state => {
    if (!authenticated) return;
    lastState = state;
    renderState(state);
  });

  // Cập nhật nhẹ số người đã trả lời, không cần gửi lại toàn bộ trạng thái.
  socket.on("admin:answer-count", payload => {
    if (!authenticated || !lastState || payload.round !== lastState.currentRound) return;
    lastState.answeredCount = payload.answeredCount;
    $("answeredCount").textContent = `${payload.answeredCount} / ${lastState.players.length}`;
  });

  const STATUS_TEXT = { WAITING: "Đang chờ", PLAYING: "Đang chơi", FINISHED: "Kết thúc" };

  function renderState(state) {
    const total = state.players.length;
    $("gameStatus").textContent = STATUS_TEXT[state.status] || state.status;
    $("roundNumber").textContent = `${state.currentRound} / ${state.totalRounds}`;
    $("playerCountStat").textContent = total;
    $("onlineCount").textContent = state.onlineCount;
    $("answeredCount").textContent = state.roundStatus === "WAITING" ? "—" : `${state.answeredCount} / ${total}`;
    $("playerTotal").textContent = `${total} người`;

    $("startButton").disabled = !(state.status === "WAITING" && state.currentRound === 0 && total > 0);
    $("nextButton").disabled = !(state.status === "PLAYING" && state.roundStatus === "CLOSED" && state.currentRound < state.totalRounds);
    $("nextButton").textContent = state.currentRound < state.totalRounds
      ? `Chuyển sang câu ${state.currentRound + 1}`
      : "Chuyển câu tiếp theo";
    $("resetButton").disabled = false;
    $("exportButton").disabled = state.questionStats.length === 0;

    if (state.roundStatus === "OPEN") {
      $("controlTitle").textContent = `Đang diễn ra câu ${state.currentRound}`;
      $("controlHint").textContent = `Máy chủ sẽ tự động khóa câu hỏi và chấm điểm khi hết ${Math.round(state.durationMs / 1000)} giây.`;
    } else if (state.status === "FINISHED") {
      $("controlTitle").textContent = "Trò chơi đã kết thúc";
      $("controlHint").textContent = "Xuất CSV để lưu kết quả, hoặc đặt lại để tổ chức lượt chơi mới.";
    } else if (state.currentRound > 0) {
      $("controlTitle").textContent = `Đã chấm điểm câu ${state.currentRound}`;
      $("controlHint").textContent = "Mọi người đã xem đáp án và giải thích câu của mình. Xem bảng xếp hạng rồi chuyển sang câu tiếp theo.";
    } else {
      $("controlTitle").textContent = "Sẵn sàng bắt đầu";
      $("controlHint").textContent = "Người chơi có thể đăng ký trước khi bắt đầu câu 1.";
    }

    renderQuestion(state);
    renderResult(state.latestRound);
    renderLeaderboard(state);
    renderSummaries(state.questionStats);
    renderPodium(state);
    updateTimer(state);
  }

  function renderQuestion(state) {
    const q = state.currentQuestion;
    $("questionPanel").classList.toggle("hidden", !q);
    if (!q) return;
    $("questionEyebrow").textContent = `CÂU ${state.currentRound} / ${state.totalRounds}`;
    $("adminQuestionText").textContent = q.question;
    const box = $("adminOptions");
    box.replaceChildren();
    for (const [key, text] of Object.entries(q.options)) {
      const row = el("div", "q-option" + (q.correctAnswer === key ? " correct" : ""));
      row.appendChild(el("b", "", key));
      row.appendChild(el("span", "", text));
      if (q.correctAnswer === key) row.appendChild(el("span", "badge ok", "Đáp án đúng"));
      box.appendChild(row);
    }
  }

  function renderResult(result) {
    const container = $("roundResult");
    container.replaceChildren();
    if (!result) {
      container.textContent = "Chưa có kết quả.";
      return;
    }
    const pct = result.totalParticipants ? Math.round((result.totalCorrect / result.totalParticipants) * 100) : 0;
    container.appendChild(el("p", "result-meta",
      `Vòng ${result.round}/${result.totalRounds}: ${result.totalParticipants} người chơi · ${result.totalSubmitted} đã trả lời · ${result.totalCorrect} trả lời đúng (${pct}%).`));
    container.appendChild(el("p", "result-meta",
      "Mỗi người chơi nhận câu hỏi theo thứ tự riêng và đáp án được xáo riêng, nên trong cùng một vòng mỗi người làm một câu khác nhau. Xem tỉ lệ đúng và phân bố lựa chọn của từng câu ở bảng \"Thống kê theo từng câu\" bên dưới (đáp án A–D theo thứ tự gốc trong questions.json)."));
  }

  function formatSeconds(ms) {
    return `${(ms / 1000).toFixed(2)} s`;
  }

  function renderLeaderboard(state) {
    const tbody = $("playersTable");
    tbody.replaceChildren();
    if (!state.players.length) {
      const row = document.createElement("tr");
      const cell = el("td", "muted", "Chưa có người chơi.");
      cell.colSpan = 7;
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }

    const players = [...state.players].sort((a, b) =>
      (b.score - a.score) ||
      ((a.rank ?? 1e9) - (b.rank ?? 1e9)) ||
      a.name.localeCompare(b.name, "vi"));

    players.forEach(player => {
      const tr = document.createElement("tr");
      const ranked = state.leaderboard.length > 0 && player.rank;
      [
        ranked ? String(player.rank) : "—",
        player.name,
        player.className || "—",
        String(player.score),
        String(player.correctCount),
        player.correctCount ? formatSeconds(player.totalCorrectTimeMs) : "—"
      ].forEach((value, index) => {
        const td = el("td", index === 3 ? "score-cell" : "", value);
        tr.appendChild(td);
      });

      const conn = document.createElement("td");
      conn.appendChild(el("span", `tag ${player.online ? "active" : "spectator"}`, player.online ? "Trực tuyến" : "Mất kết nối"));
      tr.appendChild(conn);
      tbody.appendChild(tr);
    });
  }

  function renderSummaries(summaries) {
    const tbody = $("summaryTable");
    tbody.replaceChildren();
    if (!summaries.length) {
      const row = document.createElement("tr");
      const cell = el("td", "muted", "Chưa có câu nào được chấm.");
      cell.colSpan = 8;
      row.appendChild(cell);
      tbody.appendChild(row);
      return;
    }
    summaries.forEach(item => {
      const tr = document.createElement("tr");
      const pct = item.totalParticipants ? Math.round((item.totalCorrect / item.totalParticipants) * 100) : 0;
      [
        `Câu ${item.questionId}`,
        item.correctAnswer,
        `${pct}% (${item.totalCorrect}/${item.totalParticipants})`,
        ...OPTION_KEYS.map(key => String(item.optionCounts[key] ?? 0)),
        String(item.optionCounts.none ?? 0)
      ].forEach(value => tr.appendChild(el("td", "", value)));
      tbody.appendChild(tr);
    });
  }

  function renderPodium(state) {
    const show = state.status === "FINISHED" && state.leaderboard.length > 0;
    $("podiumPanel").classList.toggle("hidden", !show);
    if (!show) return;
    const box = $("podiumList");
    box.replaceChildren();
    const medals = { 1: "🥇", 2: "🥈", 3: "🥉" };
    state.leaderboard.filter(item => item.rank <= 3).forEach(item => {
      const row = el("div", "podium-row");
      row.appendChild(el("span", "podium-medal", medals[item.rank]));
      const who = el("span", "podium-name", item.name);
      if (item.className) who.appendChild(el("small", "muted", ` · ${item.className}`));
      row.appendChild(who);
      row.appendChild(el("strong", "podium-score", `${item.score} điểm`));
      box.appendChild(row);
    });
  }

  function updateTimer(state) {
    if (timerInterval) clearInterval(timerInterval);
    if (state.roundStatus !== "OPEN" || !state.endsAt) {
      $("adminTimer").textContent = "—";
      if (window.QuizMusic) QuizMusic.stop();
      musicRound = null;
      return;
    }
    // Mỗi vòng chỉ khởi động nhạc một lần (trạng thái được phát lại khi có người vào/ra phòng).
    if (window.QuizMusic && musicRound !== state.currentRound) {
      musicRound = state.currentRound;
      QuizMusic.play(Math.max(0, state.endsAt - state.serverNow), state.durationMs);
    }
    const offset = state.serverNow - Date.now();
    const update = () => {
      const remaining = Math.max(0, state.endsAt - (Date.now() + offset));
      $("adminTimer").textContent = `${(remaining / 1000).toFixed(1)}s`;
    };
    update();
    timerInterval = setInterval(update, 100);
  }

  // ----- Xuất CSV (mở được bằng Excel, giữ nguyên tiếng Việt) -----

  function csvCell(value) {
    let text = value === null || value === undefined ? "" : String(value);
    // Tránh công thức Excel chạy từ tên người chơi (=, +, -, @).
    if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }

  function exportCsv() {
    if (!lastState || !lastState.questionStats.length) return;
    const total = lastState.totalRounds;
    const header = ["Hạng", "Họ và tên", "Lớp/đơn vị", "Tổng điểm", "Số câu đúng", "Tổng thời gian câu đúng (giây)"];
    for (let i = 1; i <= total; i++) header.push(`Câu hỏi ${i}`);

    const players = [...lastState.players].sort((a, b) =>
      (b.score - a.score) || ((a.rank ?? 1e9) - (b.rank ?? 1e9)) || a.name.localeCompare(b.name, "vi"));

    const rows = players.map(p => [
      p.rank ?? "",
      p.name,
      p.className,
      p.score,
      p.correctCount,
      (p.totalCorrectTimeMs / 1000).toFixed(2),
      ...Array.from({ length: total }, (_, i) => p.roundPoints?.[i] ?? "")
    ]);

    const csv = "﻿" + [header, ...rows].map(r => r.map(csvCell).join(",")).join("\r\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = `ket-qua-hoa-hoc-challenge-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setMessage("Đã xuất file CSV.");
  }
})();
