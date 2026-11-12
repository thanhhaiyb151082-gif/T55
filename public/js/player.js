(() => {
  const socket = io();
  const $ = id => document.getElementById(id);

  // Nhạc đếm ngược: mặc định TẮT trên điện thoại người chơi (cả lớp cùng bật sẽ rất ồn).
  // Học sinh dùng tai nghe có thể bật bằng nút ở góc; lựa chọn được nhớ lại. Đổi defaultOn thành true nếu muốn bật sẵn.
  if (window.QuizMusic) {
    QuizMusic.init({ storageKey: "quizMusicPlayer", defaultOn: false });
    QuizMusic.bindToggle($("musicToggle"));
  } else {
    $("musicToggle").classList.add("hidden");
  }
  const music = {
    play: (ms, total) => window.QuizMusic && QuizMusic.play(ms, total),
    stop: () => window.QuizMusic && QuizMusic.stop()
  };
  const STORAGE_KEY = "quizSurvivalPlayer";

  let credentials = (() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || "null"); }
    catch { return null; }
  })();

  let me = null;
  let lastState = null;
  let currentQuestion = null;
  let canAnswer = false;
  let answered = false;
  let timerFrame = null;
  let deadlinePerf = null;
  let roundDuration = 20000;
  let renderedRound = 0;     // vòng đang hiển thị câu hỏi (tránh vẽ lại khi kết nối lại)
  let totalRounds = 10;
  let pointsPerCorrect = 10;

  let publicResult = null;   // đáp án + giải thích + top bảng xếp hạng của câu gần nhất
  let finished = false;
  let personal = { score: 0, rank: null, totalPlayers: null, lastResult: null };

  function formatClock(ms) {
    const total = Math.ceil(ms / 1000);
    const minutes = Math.floor(total / 60);
    return `${String(minutes).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
  }

  function applyConfig(state) {
    if (Number.isInteger(state?.totalRounds)) totalRounds = state.totalRounds;
    if (state?.pointsPerCorrect) pointsPerCorrect = state.pointsPerCorrect;
    if (state?.durationMs) {
      roundDuration = state.durationMs;
      $("subheading").textContent =
        `${totalRounds} câu hỏi · ${Math.round(state.durationMs / 1000)} giây mỗi câu · Đúng +${pointsPerCorrect} điểm`;
    }
  }

  // Tải trước ảnh của các câu hỏi để ảnh hiện ngay khi câu hỏi mở (không làm mất thời gian của người chơi).
  function preloadImages() {
    fetch("/api/images")
      .then(res => res.json())
      .then(data => (data.images || []).forEach(src => { const img = new Image(); img.src = src; }))
      .catch(() => {});
  }

  function show(id, visible) { $(id).classList.toggle("hidden", !visible); }
  function setMessage(id, text) { $(id).textContent = text || ""; }
  function connection(text) { $("connectionState").textContent = text; }
  function isFinished() { return finished || lastState?.status === "FINISHED"; }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function updateScore() {
    $("scoreLabel").textContent = `${personal.score} điểm`;
    $("rankLabel").textContent = personal.rank ? `Hạng ${personal.rank}/${personal.totalPlayers}` : "";
  }

  function resetPersonal() {
    personal = { score: 0, rank: null, totalPlayers: null, lastResult: null };
    publicResult = null;
    finished = false;
    updateScore();
  }

  // ----- Kết nối và vào phòng -----

  socket.on("connect", () => {
    connection("Đã kết nối");
    if (credentials?.playerId && credentials?.reconnectToken) {
      socket.emit("player:join", {
        playerId: credentials.playerId,
        reconnectToken: credentials.reconnectToken
      }, handleJoin);
    }
  });

  socket.on("disconnect", () => connection("Mất kết nối – đang thử kết nối lại..."));
  socket.on("connect_error", () => connection("Không thể kết nối máy chủ"));

  $("joinForm").addEventListener("submit", event => {
    event.preventDefault();
    if (!socket.connected) return setMessage("joinMessage", "Chưa kết nối được máy chủ.");
    socket.emit("player:join", {
      name: $("playerName").value,
      className: $("className").value
    }, handleJoin);
  });

  function handleJoin(response) {
    if (!response?.success) {
      // Mã kết nối cũ không còn hợp lệ (ví dụ máy chủ vừa khởi động lại): xóa để đăng ký mới được.
      if (response?.code === "JOIN_FAILED" && credentials) {
        credentials = null;
        try { localStorage.removeItem(STORAGE_KEY); } catch { /* bỏ qua */ }
      }
      setMessage("joinMessage", response?.message || "Không thể tham gia.");
      return;
    }

    me = response.player;
    credentials = { playerId: me.id, reconnectToken: response.reconnectToken };
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(credentials)); } catch { /* bỏ qua */ }

    $("displayName").textContent = me.name;
    preloadImages();
    show("joinPanel", false);
    show("gamePanel", true);
    setMessage("answerMessage", "");
    // Máy chủ sẽ gửi ngay game:state và player:sync sau khi vào phòng.
  }

  // ----- Câu hỏi -----

  function disableOptions() {
    document.querySelectorAll(".option-button").forEach(button => { button.disabled = true; });
  }

  function renderQuestion(question, round, endsAt, serverNow) {
    currentQuestion = question;
    answered = false;
    canAnswer = Boolean(me);
    roundDuration = question.durationMs || 20000;
    renderedRound = round;

    $("roundLabel").textContent = `Câu ${round} / ${totalRounds}`;
    $("questionText").textContent = question.question;
    const image = $("questionImage");
    if (question.image) {
      image.src = question.image;
      image.classList.remove("hidden");
    } else {
      image.removeAttribute("src");
      image.classList.add("hidden");
    }
    $("options").replaceChildren();

    for (const [key, value] of Object.entries(question.options)) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "option-button";
      button.dataset.key = key;
      const badge = document.createElement("b");
      badge.textContent = key;
      const span = document.createElement("span");
      span.textContent = value;
      button.append(badge, span);
      button.disabled = !canAnswer;
      button.addEventListener("click", () => chooseAnswer(key));
      $("options").appendChild(button);
    }

    show("waitingBox", false);
    show("resultBox", false);
    show("finalBox", false);
    show("questionBox", true);
    show("timerWrap", true);
    setMessage("answerMessage", `Chọn một đáp án. Mỗi câu đúng được +${pointsPerCorrect} điểm, bạn chỉ được gửi một lần.`);

    const remaining = Math.max(0, endsAt - serverNow);
    deadlinePerf = performance.now() + remaining;
    startVisualTimer();
    music.play(remaining, roundDuration);
  }

  function startVisualTimer() {
    if (timerFrame) cancelAnimationFrame(timerFrame);
    const tick = () => {
      const remaining = Math.max(0, deadlinePerf - performance.now());
      $("timer").textContent = formatClock(remaining);
      $("timerBar").style.width = `${Math.max(0, remaining / roundDuration) * 100}%`;
      if (remaining > 0) timerFrame = requestAnimationFrame(tick);
      else {
        music.stop();
        disableOptions();
        setMessage("answerMessage", answered
          ? "Hết giờ! Đang chấm điểm..."
          : "Đã hết thời gian. Đang chấm điểm...");
      }
    };
    tick();
  }

  function markSelected(key) {
    answered = true;
    canAnswer = false;
    document.querySelectorAll(".option-button").forEach(button => {
      button.disabled = true;
      button.classList.toggle("selected", button.dataset.key === key);
    });
  }

  function chooseAnswer(key) {
    if (!canAnswer || answered || !currentQuestion) return;
    markSelected(key);

    socket.emit("answer:submit", { answer: key }, response => {
      if (!response?.success) {
        setMessage("answerMessage", response?.message || "Không gửi được đáp án.");
        if (["TIME_EXPIRED", "ROUND_CLOSED", "ALREADY_ANSWERED"].includes(response?.code)) return;
        // Lỗi tạm thời: cho phép chọn lại.
        answered = false;
        canAnswer = true;
        document.querySelectorAll(".option-button").forEach(button => {
          button.disabled = false;
          button.classList.remove("selected");
        });
        return;
      }
      setMessage("answerMessage", "Đã ghi nhận đáp án của bạn. Đáp án và giải thích sẽ hiện khi hết giờ.");
    });
  }

  // ----- Kết quả sau mỗi câu -----

  function leaderboardList(list, limit) {
    const ol = el("ol", "leaderboard");
    list.slice(0, limit).forEach(item => {
      const li = el("li", "lb-row" + (me && item.playerId === me.id ? " me" : ""));
      const medal = ({ 1: "🥇", 2: "🥈", 3: "🥉" })[item.rank] || String(item.rank);
      li.appendChild(el("span", "lb-rank", medal));
      const who = el("span", "lb-name", item.name);
      if (item.className) who.appendChild(el("small", "muted", ` · ${item.className}`));
      li.appendChild(who);
      li.appendChild(el("strong", "lb-score", `${item.score} đ`));
      ol.appendChild(li);
    });
    return ol;
  }

  function renderResult() {
    const box = $("resultBox");
    box.replaceChildren();
    const r = publicResult;
    if (!r) return;

    const mine = personal.lastResult && personal.lastResult.round === r.round ? personal.lastResult : null;

    let verdictClass = "pending";
    let verdictText = "Đang tính điểm...";
    if (mine) {
      if (!mine.selectedAnswer) { verdictClass = "none"; verdictText = `Bạn chưa trả lời câu ${r.round} · +0 điểm`; }
      else if (mine.isCorrect) { verdictClass = "correct"; verdictText = `Chính xác! +${mine.points} điểm`; }
      else { verdictClass = "wrong"; verdictText = `Chưa đúng · +${mine.points} điểm`; }
    }
    box.appendChild(el("div", `verdict ${verdictClass}`, verdictText));

    const rankText = personal.rank ? ` · Hạng ${personal.rank}/${personal.totalPlayers}` : "";
    box.appendChild(el("p", "result-score", `Tổng điểm: ${personal.score}${rankText}`));
    box.appendChild(el("p", "result-meta", `Câu hỏi này: ${r.totalCorrect}/${r.totalParticipants} bạn đã làm đã trả lời đúng.`));

    box.appendChild(el("h3", "result-question", r.question.question));

    const list = el("div", "explain-list");
    for (const [key, text] of Object.entries(r.question.options)) {
      const isCorrect = key === r.correctAnswer;
      const picked = mine && mine.selectedAnswer === key;
      const item = el("div", "explain-item" + (isCorrect ? " correct" : picked ? " picked-wrong" : ""));

      const head = el("div", "explain-head");
      head.appendChild(el("b", "", key));
      head.appendChild(el("span", "explain-option", text));
      if (isCorrect) head.appendChild(el("span", "badge ok", "Đáp án đúng"));
      if (picked) head.appendChild(el("span", "badge you", "Bạn đã chọn"));
      item.appendChild(head);

      item.appendChild(el("p", "explain-text", r.explanations?.[key] || ""));
      const count = r.optionCounts?.[key];
      if (Number.isInteger(count)) item.appendChild(el("p", "explain-count", `${count} bạn chọn đáp án này`));
      list.appendChild(item);
    }
    box.appendChild(list);

    if (!isFinished()) {
      box.appendChild(el("h3", "result-question", "Bảng xếp hạng (Top 5)"));
      box.appendChild(leaderboardList(r.leaderboard || [], 5));
      box.appendChild(el("p", "result-meta", "Chờ giáo viên chuyển sang câu tiếp theo..."));
    }
  }

  function renderFinal() {
    const box = $("finalBox");
    box.replaceChildren();
    if (!publicResult) return;

    box.appendChild(el("h2", "", "🏆 Kết thúc trò chơi"));
    const rankText = personal.rank ? ` · Hạng ${personal.rank}/${personal.totalPlayers}` : "";
    box.appendChild(el("p", "final-score", `Bạn đạt ${personal.score} điểm${rankText}`));
    box.appendChild(el("h3", "result-question", "Bảng xếp hạng chung cuộc"));
    box.appendChild(leaderboardList(publicResult.leaderboard || [], 10));
    show("finalBox", true);
  }

  function refreshResultViews() {
    if (!publicResult) return;
    renderResult();
    if (isFinished()) renderFinal(); else show("finalBox", false);
  }

  function showResultView() {
    if (!publicResult) return;
    music.stop();
    if (timerFrame) cancelAnimationFrame(timerFrame);
    disableOptions();
    show("questionBox", false);
    show("waitingBox", false);
    show("timerWrap", false);
    show("resultBox", true);
    $("roundLabel").textContent = `Câu ${publicResult.round} / ${totalRounds}`;
    refreshResultViews();
  }

  // ----- Sự kiện từ máy chủ -----

  function applyState(state) {
    lastState = state;
    applyConfig(state);
    if (!me) return;

    $("playerCount").textContent = `${state.playerCount} người đã vào phòng`;

    if (state.status === "WAITING" && state.currentRound === 0) {
      // Phòng chờ hoặc vừa đặt lại: xoá điểm và kết quả cũ.
      if (timerFrame) cancelAnimationFrame(timerFrame);
      music.stop();
      currentQuestion = null;
      renderedRound = 0;
      resetPersonal();
      $("roundLabel").textContent = "Chưa bắt đầu";
      show("questionBox", false);
      show("timerWrap", false);
      show("resultBox", false);
      show("finalBox", false);
      show("waitingBox", true);
      return;
    }
    // Câu hỏi và kết quả riêng của người chơi được khôi phục qua sự kiện player:sync.
  }

  socket.on("game:state", applyState);

  socket.on("round:started", payload => {
    applyConfig(payload);
    if (!me) return;
    finished = false;
    renderQuestion(payload.question, payload.round, payload.endsAt, payload.serverNow);
  });

  // Hết giờ: máy chủ gửi riêng cho từng người câu hỏi của họ, đáp án đúng, giải thích, điểm và hạng.
  socket.on("player:result", result => {
    personal.lastResult = result;
    personal.score = result.score;
    personal.rank = result.rank;
    personal.totalPlayers = result.totalPlayers;
    publicResult = result;
    updateScore();
    if (!me) return;
    showResultView();
  });

  socket.on("player:sync", sync => {
    if (!sync) return;
    personal = {
      score: sync.score,
      rank: sync.rank,
      totalPlayers: sync.totalPlayers,
      lastResult: sync.lastResult
    };
    updateScore();

    if (sync.roundStatus === "OPEN" && sync.question && sync.endsAt) {
      // Vào lại / tải lại trang giữa lúc đang có câu hỏi mở: dựng lại đúng câu hỏi (đúng thứ tự đáp án) của người này.
      if (renderedRound !== sync.round) {
        renderQuestion(sync.question, sync.round, sync.endsAt, sync.serverNow);
      }
      // Đã trả lời câu đang mở trước khi tải lại trang: khoá lại và đánh dấu đáp án đã chọn.
      if (sync.currentAnswer && currentQuestion) {
        markSelected(sync.currentAnswer);
        setMessage("answerMessage", "Đã ghi nhận đáp án của bạn. Đáp án và giải thích sẽ hiện khi hết giờ.");
      }
      return;
    }

    // Vào lại sau khi vòng đã đóng: hiển thị lại đáp án và giải thích của câu vừa làm.
    if (sync.roundStatus === "CLOSED" && sync.lastResult && sync.lastResult.round === sync.round) {
      publicResult = sync.lastResult;
      showResultView();
      return;
    }
    refreshResultViews();
  });

  socket.on("game:finished", () => {
    finished = true;
    if (!me) return;
    refreshResultViews();
  });
})();
