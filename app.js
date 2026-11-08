/**
 * ========================================================
 * 数学 復習小テスト アプリケーションロジック (app.js)
 * ========================================================
 */

// ==========================================
// 1. 設定項目
// ==========================================
const GAS_WEB_APP_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

// デモモード用モックデータ
const DEMO_QUESTIONS_LIST = [
  { questionId: "demo-001", round: "第1回", title: "2次関数の頂点", type: "4択" },
  { questionId: "demo-002", round: "第2回", title: "判別式とグラフの共有点", type: "4択" }
];

const DEMO_QUESTION_DETAIL = {
  "demo-001": {
    questionId: "demo-001",
    round: "第1回",
    questionTitle: "第1回 2次関数の頂点",
    type: "4択",
    imageUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240">
      <rect width="100%" height="100%" fill="%23ffffff" rx="12"/>
      <rect x="2" y="2" width="596" height="236" fill="none" stroke="%23e2e8f0" stroke-width="2" rx="10"/>
      <text x="30" y="55" font-family="-apple-system, sans-serif" font-size="20" font-weight="bold" fill="%231e293b">【2次関数の頂点】</text>
      <text x="30" y="105" font-family="-apple-system, sans-serif" font-size="22" fill="%23334155">次の2次関数のグラフの頂点の座標を求めよ。</text>
      <rect x="50" y="130" width="500" height="75" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="1.5" rx="8"/>
      <text x="300" y="178" font-family="Cambria Math, Times New Roman, serif" font-size="34" font-weight="bold" font-style="italic" fill="%231d4ed8" text-anchor="middle">y = 2(x - 3)² + 4</text>
    </svg>`,
    choices: ["( 3 ,  4 )", "( -3 ,  4 )", "( 3 , -4 )", "( -3 , -4 )"],
    correctAnswer: "( 3 ,  4 )"
  },
  "demo-002": {
    questionId: "demo-002",
    round: "第2回",
    questionTitle: "第2回 判別式とグラフの共有点",
    type: "4択",
    imageUrl: "",
    choices: ["D > 0", "D = 0", "D < 0", "判定不能"],
    correctAnswer: "D > 0"
  }
};

// ==========================================
// 2. DOM要素の取得
// ==========================================
const screens = {
  list: document.getElementById("listScreen"),
  loading: document.getElementById("loadingScreen"),
  question: document.getElementById("questionScreen"),
  result: document.getElementById("resultScreen"),
  error: document.getElementById("errorScreen")
};

const loadingMessageEl = document.getElementById("loadingMessage");
const quizListContainerEl = document.getElementById("quizListContainer");

const backToListFromQuestionBtnEl = document.getElementById("backToListFromQuestionBtn");
const backToListFromResultBtnEl = document.getElementById("backToListFromResultBtn");

const questionNumberEl = document.getElementById("questionNumber");
const questionImageEl = document.getElementById("questionImage");
const imageLoaderEl = document.getElementById("imageLoader");
const choicesContainerEl = document.getElementById("choicesContainer");
const submittingOverlayEl = document.getElementById("submittingOverlay");

const resultCardEl = document.getElementById("resultCard");
const resultIconEl = document.getElementById("resultIcon");
const resultTitleEl = document.getElementById("resultTitle");
const resultMessageEl = document.getElementById("resultMessage");
const correctAnswerTextEl = document.getElementById("correctAnswerText");
const retryBtnEl = document.getElementById("retryBtn");
const reloadBtnEl = document.getElementById("reloadBtn");
const errorMessageEl = document.getElementById("errorMessage");
const demoNoticeEl = document.getElementById("demoNotice");

// アプリ内部の状態
let currentQuestion = null;

// ==========================================
// 3. 画面切り替えユーティリティ
// ==========================================
function switchScreen(targetScreenName) {
  Object.keys(screens).forEach((name) => {
    if (name === targetScreenName) {
      screens[name].classList.add("active");
    } else {
      screens[name].classList.remove("active");
    }
  });
}

// ==========================================
// 4. API通信処理 (GAS / Mock)
// ==========================================

/**
 * 0. 小テスト一覧の取得
 */
async function fetchQuestionList() {
  loadingMessageEl.textContent = "小テスト一覧を読み込んでいます...";
  switchScreen("loading");

  // デモモード判定
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "") {
    demoNoticeEl.classList.remove("hidden");
    await new Promise((resolve) => setTimeout(resolve, 500));
    renderQuestionList(DEMO_QUESTIONS_LIST);
    return;
  }

  demoNoticeEl.classList.add("hidden");
  try {
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getQuestionList`, {
      method: "GET",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`サーバーエラー (ステータス: ${response.status})`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    renderQuestionList(data.questions || []);
  } catch (error) {
    console.error("一覧取得エラー:", error);
    errorMessageEl.textContent = `小テスト一覧の取得に失敗しました: ${error.message}`;
    switchScreen("error");
  }
}

/**
 * 1. 特定の問題データの取得（GETリクエスト）
 */
async function fetchQuestion(questionId = null) {
  loadingMessageEl.textContent = "問題を読み込んでいます...";
  switchScreen("loading");

  // デモモード判定
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "") {
    demoNoticeEl.classList.remove("hidden");
    await new Promise((resolve) => setTimeout(resolve, 600));
    currentQuestion = DEMO_QUESTION_DETAIL[questionId] || DEMO_QUESTION_DETAIL["demo-001"];
    renderQuestion(currentQuestion);
    return;
  }

  demoNoticeEl.classList.add("hidden");
  try {
    const query = questionId ? `&questionId=${encodeURIComponent(questionId)}` : "";
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getQuestion${query}`, {
      method: "GET",
      redirect: "follow"
    });

    if (!response.ok) {
      throw new Error(`サーバーエラー (ステータス: ${response.status})`);
    }

    const data = await response.json();
    if (data.error) {
      throw new Error(data.error);
    }

    currentQuestion = data;
    renderQuestion(data);
  } catch (error) {
    console.error("問題取得エラー:", error);
    errorMessageEl.textContent = `問題の読み込みに失敗しました: ${error.message}`;
    switchScreen("error");
  }
}

/**
 * 2. 解答の送信（POSTリクエスト）
 */
async function submitAnswer(selectedChoice) {
  // 二重送信防止：オーバーレイ表示 & ボタン無効化
  submittingOverlayEl.classList.remove("hidden");
  const buttons = choicesContainerEl.querySelectorAll("button");
  buttons.forEach(btn => btn.disabled = true);

  // デモモード判定
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "") {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const isCorrect = (selectedChoice === currentQuestion.correctAnswer);
    renderResult({
      isCorrect: isCorrect,
      correctAnswer: currentQuestion.correctAnswer
    });
    return;
  }

  // GASへPOSTリクエスト
  try {
    const payload = {
      action: "submitAnswer",
      questionId: currentQuestion.questionId,
      answer: selectedChoice
    };

    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      redirect: "follow",
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`送信エラー (ステータス: ${response.status})`);
    }

    const result = await response.json();
    if (result.error) {
      throw new Error(result.error);
    }

    renderResult(result);
  } catch (error) {
    console.error("解答送信エラー:", error);
    alert(`解答の送信中にエラーが発生しました。\nもう一度お試しください: ${error.message}`);
    submittingOverlayEl.classList.add("hidden");
    buttons.forEach(btn => btn.disabled = false);
  }
}

// ==========================================
// 5. 画面描画処理
// ==========================================

/**
 * 小テスト一覧画面の描画
 */
function renderQuestionList(questions) {
  quizListContainerEl.innerHTML = "";

  if (!questions || questions.length === 0) {
    quizListContainerEl.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #64748b;">
        <p style="font-size: 1.1rem; font-weight: 600;">現在、公開中の小テストはありません。</p>
        <p style="font-size: 0.9rem; margin-top: 8px;">先生がスプレッドシートで「公開」に設定するのをお待ちください。</p>
      </div>
    `;
    switchScreen("list");
    return;
  }

  questions.forEach((q) => {
    const card = document.createElement("div");
    card.className = "quiz-card";

    card.innerHTML = `
      <div class="quiz-card-info">
        <span class="round-badge">${escapeHtml(q.round || "小テスト")}</span>
        <span class="quiz-card-title">${escapeHtml(q.title || "無題のテスト")}</span>
        <span class="quiz-card-type">${escapeHtml(q.type || "4択")}</span>
      </div>
      <div class="quiz-card-action">
        <span>挑戦する</span>
        <span>➔</span>
      </div>
    `;

    card.addEventListener("click", () => {
      fetchQuestion(q.questionId);
    });

    quizListContainerEl.appendChild(card);
  });

  switchScreen("list");
}

/**
 * 出題画面の描画
 */
function renderQuestion(questionData) {
  // 問題タイトル・回数
  questionNumberEl.textContent = questionData.questionTitle || questionData.round || "小テスト";

  // 画像の表示処理
  if (!questionData.imageUrl || questionData.imageUrl.trim() === "") {
    // 画像URLが設定されていない場合
    imageLoaderEl.style.display = "flex";
    imageLoaderEl.innerHTML = `<span style="color:#64748b; font-size:1rem; font-weight:500;">📝 （問題画像は未設定です。プリント等を確認するか、先生の指示に従ってください）</span>`;
    questionImageEl.style.display = "none";
  } else {
    questionImageEl.style.display = "block";
    imageLoaderEl.style.display = "flex";
    imageLoaderEl.innerHTML = `<div class="spinner-small"></div><span>画像を読み込み中...</span>`;
    questionImageEl.style.opacity = "0";

    questionImageEl.onload = () => {
      imageLoaderEl.style.display = "none";
      questionImageEl.style.opacity = "1";
    };
    questionImageEl.onerror = () => {
      imageLoaderEl.innerHTML = `<span style="color:#ef4444;">画像の読み込みに失敗しました（Googleドライブの共有設定を確認してください）</span>`;
    };
    questionImageEl.src = questionData.imageUrl;
  }

  // 選択肢ボタンの動的生成
  choicesContainerEl.innerHTML = "";
  const choiceLabels = ["A", "B", "C", "D"];

  questionData.choices.forEach((choiceText, index) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice-btn";

    const labelSpan = document.createElement("span");
    labelSpan.className = "choice-index";
    labelSpan.textContent = choiceLabels[index] || (index + 1);

    const textSpan = document.createElement("span");
    textSpan.className = "choice-text";
    textSpan.textContent = choiceText;

    btn.appendChild(labelSpan);
    btn.appendChild(textSpan);

    // クリック時に即座送信
    btn.addEventListener("click", () => {
      btn.classList.add("selected");
      submitAnswer(choiceText);
    });

    choicesContainerEl.appendChild(btn);
  });

  submittingOverlayEl.classList.add("hidden");
  switchScreen("question");
}

/**
 * 結果画面の描画と演出
 */
function renderResult(result) {
  submittingOverlayEl.classList.add("hidden");
  switchScreen("result");

  const isCorrect = result.isCorrect;
  correctAnswerTextEl.textContent = result.correctAnswer || "";

  resultCardEl.classList.remove("shake");

  if (isCorrect) {
    resultIconEl.textContent = "🎉";
    resultTitleEl.textContent = "正解！お見事！";
    resultTitleEl.className = "result-title correct";
    resultMessageEl.textContent = "バッチリ理解できています！本日の授業もこの調子でいきましょう！";
    fireConfettiExplosion();
  } else {
    resultIconEl.textContent = "💪";
    resultTitleEl.textContent = "惜しい！不正解…";
    resultTitleEl.className = "result-title incorrect";
    resultMessageEl.textContent = "間違えたところは絶好の学びのチャンス！授業内の解説をしっかり確認しましょう。";
    resultCardEl.classList.add("shake");
    fireRippleEffect();
  }
}

// XSS防止用エスケープ
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

// ==========================================
// 6. 物理演算風パーティクル・紙吹雪演出 (Canvas)
// ==========================================
const canvas = document.getElementById("effectCanvas");
const ctx = canvas.getContext("2d");

let particles = [];
let animationFrameId = null;

function resizeCanvas() {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
}
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, color, type = "confetti") {
    this.x = x;
    this.y = y;
    this.color = color;
    this.type = type;

    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 12 + 6);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - (type === "confetti" ? 6 : 2);

    this.gravity = 0.28;
    this.friction = 0.985;

    this.size = Math.random() * 8 + 6;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 12;

    this.opacity = 1;
    this.fadeSpeed = Math.random() * 0.008 + 0.006;
  }

  update() {
    this.vx *= this.friction;
    this.vy *= this.friction;
    this.vy += this.gravity;

    this.x += this.vx;
    this.y += this.vy;

    this.rotation += this.rotationSpeed;
    this.opacity -= this.fadeSpeed;
  }

  draw(context) {
    if (this.opacity <= 0) return;

    context.save();
    context.globalAlpha = Math.max(this.opacity, 0);
    context.translate(this.x, this.y);
    context.rotate((this.rotation * Math.PI) / 180);

    context.fillStyle = this.color;
    if (this.type === "confetti") {
      context.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
    } else {
      context.beginPath();
      context.arc(0, 0, this.size / 2, 0, Math.PI * 2);
      context.fill();
    }

    context.restore();
  }
}

function runParticleLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update();
    p.draw(ctx);

    if (p.opacity <= 0 || p.y > canvas.height + 50) {
      particles.splice(i, 1);
    }
  }

  if (particles.length > 0) {
    animationFrameId = requestAnimationFrame(runParticleLoop);
  } else {
    cancelAnimationFrame(animationFrameId);
    animationFrameId = null;
  }
}

function fireConfettiExplosion() {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2 - 50;

  for (let i = 0; i < 120; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push(new Particle(centerX, centerY, color, "confetti"));
  }

  if (!animationFrameId) {
    runParticleLoop();
  }
}

function fireRippleEffect() {
  const colors = ["#60a5fa", "#93c5fd", "#cbd5e1"];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2;

  for (let i = 0; i < 40; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push(new Particle(centerX, centerY, color, "circle"));
  }

  if (!animationFrameId) {
    runParticleLoop();
  }
}

// ==========================================
// 7. イベントリスナー登録 & 初期起動
// ==========================================
backToListFromQuestionBtnEl.addEventListener("click", () => {
  fetchQuestionList();
});

backToListFromResultBtnEl.addEventListener("click", () => {
  fetchQuestionList();
});

retryBtnEl.addEventListener("click", () => {
  if (currentQuestion) {
    fetchQuestion(currentQuestion.questionId);
  } else {
    fetchQuestionList();
  }
});

reloadBtnEl.addEventListener("click", () => {
  fetchQuestionList();
});

// アプリ開始：URLパラメータに ?q=xxx があればその問題を直撃、なければ一覧を表示
window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const directQuestionId = urlParams.get("q");

  if (directQuestionId) {
    fetchQuestion(directQuestionId);
  } else {
    fetchQuestionList();
  }
});
