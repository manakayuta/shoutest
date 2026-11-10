/**
 * ========================================================
 * 数学 復習小テスト アプリケーションロジック (app.js)
 * マーク式（穴埋めスロット）＋ 選択式 ハイブリッド対応版
 * ========================================================
 */

// ==========================================
// 1. 設定項目
// ==========================================
const GAS_WEB_APP_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

// デモモード用モックデータ
const DEMO_QUESTIONS_LIST = [
  { questionId: "demo-001", round: "第1回", title: "2次関数の頂点", type: "4択", isPassed: true },
  { questionId: "demo-002", round: "第2回", title: "判別式と解の個数", type: "2択", isPassed: false },
  { questionId: "demo-003", round: "第3回", title: "三角比・円周率（穴埋め）", type: "マーク式", isPassed: false }
];

const DEMO_QUESTION_DETAIL = {
  "demo-001": {
    questionId: "demo-001",
    round: "第1回",
    questionTitle: "第1回 2次関数の頂点",
    type: "4択",
    imageUrl: "",
    choices: ["( 3 ,  4 )", "( -3 ,  4 )", "( 3 , -4 )", "( -3 , -4 )"],
    correctAnswer: "( 3 ,  4 )"
  },
  "demo-002": {
    questionId: "demo-002",
    round: "第2回",
    questionTitle: "第2回 判別式と解の個数",
    type: "2択",
    imageUrl: "",
    choices: ["実数解は2個", "実数解なし"],
    correctAnswer: "実数解は2個"
  },
  "demo-003": {
    questionId: "demo-003",
    round: "第3回",
    questionTitle: "第3回 三角比の基本",
    type: "マーク式",
    imageUrl: "",
    choices: ["ア", "イ"], // スロットのラベル
    correctAnswer: "1, π"
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
const questionInstructionEl = document.getElementById("questionInstruction");
const questionImageEl = document.getElementById("questionImage");
const imageLoaderEl = document.getElementById("imageLoader");

// A. 選択式用
const choicesContainerEl = document.getElementById("choicesContainer");

// B. マーク式用
const markContainerEl = document.getElementById("markContainer");
const markSlotsWrapperEl = document.getElementById("markSlotsWrapper");
const markKeypadEl = document.getElementById("markKeypad");
const markSubmitBtnEl = document.getElementById("markSubmitBtn");

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
let activeSlotIndex = 0;
let markSlotsData = []; // [{ label: "ア", value: "" }, ...]

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

async function fetchQuestionList() {
  loadingMessageEl.textContent = "小テスト一覧を読み込んでいます...";
  switchScreen("loading");

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

    if (!response.ok) throw new Error(`サーバーエラー: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    renderQuestionList(data.questions || []);
  } catch (error) {
    console.error("一覧取得エラー:", error);
    errorMessageEl.textContent = `小テスト一覧の取得に失敗しました: ${error.message}`;
    switchScreen("error");
  }
}

async function fetchQuestion(questionId = null) {
  loadingMessageEl.textContent = "問題を読み込んでいます...";
  switchScreen("loading");

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

    if (!response.ok) throw new Error(`サーバーエラー: ${response.status}`);
    const data = await response.json();
    if (data.error) throw new Error(data.error);

    currentQuestion = data;
    renderQuestion(data);
  } catch (error) {
    console.error("問題取得エラー:", error);
    errorMessageEl.textContent = `問題の読み込みに失敗しました: ${error.message}`;
    switchScreen("error");
  }
}

async function submitAnswer(answerText) {
  submittingOverlayEl.classList.remove("hidden");
  const buttons = document.querySelectorAll(".choice-btn, .keypad-btn, .mark-submit-btn");
  buttons.forEach(btn => btn.disabled = true);

  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "") {
    await new Promise((resolve) => setTimeout(resolve, 600));
    const normalize = (str) => String(str)
      .replace(/^['’]/, "")
      .replace(/[\s,、\-_ー−]/g, "")
      .replace(/パイ/g, "PI")
      .toUpperCase()
      .replace(/PI/g, "Π");
    const cleanStudent = normalize(answerText);
    const cleanCorrect = normalize(currentQuestion.correctAnswer);
    const isCorrect = (cleanStudent === cleanCorrect);
    renderResult({
      isCorrect: isCorrect,
      correctAnswer: currentQuestion.correctAnswer
    });
    return;
  }

  try {
    const payload = {
      action: "submitAnswer",
      questionId: currentQuestion.questionId,
      answer: answerText
    };

    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      redirect: "follow",
      body: JSON.stringify(payload)
    });

    if (!response.ok) throw new Error(`送信エラー: ${response.status}`);
    const result = await response.json();
    if (result.error) throw new Error(result.error);

    renderResult(result);
  } catch (error) {
    console.error("解答送信エラー:", error);
    alert(`解答の送信中にエラーが発生しました。\nもう一度お試しください: ${error.message}`);
    submittingOverlayEl.classList.add("hidden");
    buttons.forEach(btn => btn.disabled = false);
    updateMarkSubmitBtnState();
  }
}

// ==========================================
// 5. 画面描画処理
// ==========================================

function renderQuestionList(questions) {
  quizListContainerEl.innerHTML = "";

  if (!questions || questions.length === 0) {
    quizListContainerEl.innerHTML = `
      <div style="text-align: center; padding: 40px 20px; color: #64748b;">
        <p style="font-size: 1.1rem; font-weight: 600;">現在、公開中の小テストはありません。</p>
      </div>
    `;
    switchScreen("list");
    return;
  }

  questions.forEach((q) => {
    const card = document.createElement("div");
    card.className = q.isPassed ? "quiz-card passed" : "quiz-card";

    const statusBadgeHtml = q.isPassed
      ? `<span class="status-badge passed-badge">合格済み 🎉</span>`
      : `<span class="status-badge unpassed-badge">未挑戦</span>`;

    const actionText = q.isPassed
      ? `<span>合格済み ✅</span><span>➔</span>`
      : `<span>挑戦する</span><span>➔</span>`;

    card.innerHTML = `
      <div class="quiz-card-info">
        <span class="round-badge">${escapeHtml(q.round || "小テスト")}</span>
        ${statusBadgeHtml}
        <span class="quiz-card-title">${escapeHtml(q.title || "")}</span>
        <span class="quiz-card-type">${escapeHtml(q.type || "")}</span>
      </div>
      <div class="quiz-card-action">
        ${actionText}
      </div>
    `;
    card.addEventListener("click", () => fetchQuestion(q.questionId));
    quizListContainerEl.appendChild(card);
  });

  switchScreen("list");
}

function renderQuestion(questionData) {
  currentQuestion = questionData;
  questionNumberEl.textContent = questionData.questionTitle || questionData.round || "小テスト";

  // 画像の描画
  if (!questionData.imageUrl || questionData.imageUrl.trim() === "") {
    imageLoaderEl.style.display = "flex";
    imageLoaderEl.innerHTML = `<span style="color:#64748b; font-size:1rem; font-weight:500;">📝 （問題画像は未設定です）</span>`;
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
      imageLoaderEl.innerHTML = `<span style="color:#ef4444;">画像の読み込みに失敗しました</span>`;
    };
    questionImageEl.src = questionData.imageUrl;
  }

  // 形式の判定（マーク式 vs 選択式）
  const typeStr = String(questionData.type || "");
  const isMarkType = typeStr.includes("マーク") || typeStr.includes("穴埋め");

  if (isMarkType) {
    // 【マーク式の場合】
    choicesContainerEl.classList.add("hidden");
    markContainerEl.classList.remove("hidden");
    questionInstructionEl.textContent = "マーク枠をタップして、数字または符号を入力してください";
    setupMarkUI(questionData.choices);
  } else {
    // 【選択式の場合（2〜6択）】
    markContainerEl.classList.add("hidden");
    choicesContainerEl.classList.remove("hidden");
    questionInstructionEl.textContent = "正しい選択肢を1つ選んでください";
    setupChoiceButtons(questionData.choices);
  }

  submittingOverlayEl.classList.add("hidden");
  switchScreen("question");
}

// 選択式ボタンの生成
function setupChoiceButtons(choices) {
  choicesContainerEl.innerHTML = "";
  const choiceLabels = ["A", "B", "C", "D", "E", "F"];

  choices.forEach((choiceText, index) => {
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

    btn.addEventListener("click", () => {
      btn.classList.add("selected");
      submitAnswer(choiceText);
    });

    choicesContainerEl.appendChild(btn);
  });
}

// マーク式UIの初期化
function setupMarkUI(slotLabels) {
  markSlotsWrapperEl.innerHTML = "";
  const defaultLabels = ["ア", "イ", "ウ", "エ", "オ", "カ"];
  const labels = (slotLabels && slotLabels.length > 0) ? slotLabels : ["ア", "イ"];

  markSlotsData = labels.map((label, idx) => ({
    label: label || defaultLabels[idx] || `枠${idx+1}`,
    value: ""
  }));

  activeSlotIndex = 0;
  renderMarkSlots();
  updateMarkSubmitBtnState();
}

// マーク式スロット枠の再描画
function renderMarkSlots() {
  markSlotsWrapperEl.innerHTML = "";
  markSlotsData.forEach((slot, index) => {
    const slotEl = document.createElement("div");
    slotEl.className = "mark-slot" + (index === activeSlotIndex ? " active" : "");

    slotEl.innerHTML = `
      <span class="mark-slot-label">${escapeHtml(slot.label)}</span>
      <span class="mark-slot-value">${slot.value !== "" ? escapeHtml(slot.value) : "　"}</span>
    `;

    slotEl.addEventListener("click", () => {
      activeSlotIndex = index;
      renderMarkSlots();
    });

    markSlotsWrapperEl.appendChild(slotEl);
  });
}

// マーク式入力処理（テンキーまたはキーボード）
function inputMarkKey(key) {
  if (markSlotsData.length === 0) return;

  if (key === "backspace") {
    // 戻る（消去）
    if (markSlotsData[activeSlotIndex].value !== "") {
      markSlotsData[activeSlotIndex].value = "";
    } else if (activeSlotIndex > 0) {
      activeSlotIndex--;
      markSlotsData[activeSlotIndex].value = "";
    }
  } else {
    // 数字またはマイナス
    markSlotsData[activeSlotIndex].value = key;
    // 次のスロットがあれば自動フォーカス移動
    if (activeSlotIndex < markSlotsData.length - 1) {
      activeSlotIndex++;
    }
  }

  renderMarkSlots();
  updateMarkSubmitBtnState();
}

// 送信ボタンの活性化判定
function updateMarkSubmitBtnState() {
  // すべてのスロットに値が入っているか判定
  const allFilled = markSlotsData.length > 0 && markSlotsData.every(s => s.value !== "");
  markSubmitBtnEl.disabled = !allFilled;
}

// テンキーパレットのイベント
markKeypadEl.querySelectorAll(".keypad-btn").forEach(btn => {
  btn.addEventListener("click", (e) => {
    e.preventDefault();
    const key = btn.getAttribute("data-key");
    inputMarkKey(key);
  });
});

// PC物理キーボード入力対応
window.addEventListener("keydown", (e) => {
  // 出題画面が表示されていて、マーク式コンテナが有効なときのみ
  if (!screens.question.classList.contains("active") || markContainerEl.classList.contains("hidden")) {
    return;
  }

  const key = e.key;
  if (/^[0-9]$/.test(key)) {
    inputMarkKey(key);
  } else if (key === "-" || key === "−") {
    inputMarkKey("-");
  } else if (key.toLowerCase() === "e") {
    inputMarkKey("e");
  } else if (key.toLowerCase() === "p" || key === "π" || key === "Π") {
    inputMarkKey("π");
  } else if (key === "Backspace" || key === "Delete") {
    inputMarkKey("backspace");
  } else if (key === "Enter" && !markSubmitBtnEl.disabled) {
    submitMarkAnswer();
  }
});

// マーク式送信処理
function submitMarkAnswer() {
  const answerString = markSlotsData.map(s => s.value).join(", ");
  submitAnswer(answerString);
}

markSubmitBtnEl.addEventListener("click", submitMarkAnswer);

// 結果描画
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
    resultMessageEl.textContent = "間違えたところは絶好の学びのチャンス！解説を確認しましょう。";
    resultCardEl.classList.add("shake");
    fireRippleEffect();
  }
}

function escapeHtml(str) {
  return String(str).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

// 物理演算・パーティクル
const canvas = document.getElementById("effectCanvas");
const ctx = canvas.getContext("2d");
let particles = [];
let animationFrameId = null;

function resizeCanvas() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
window.addEventListener("resize", resizeCanvas);
resizeCanvas();

class Particle {
  constructor(x, y, color, type = "confetti") {
    this.x = x; this.y = y; this.color = color; this.type = type;
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 12 + 6);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - (type === "confetti" ? 6 : 2);
    this.gravity = 0.28; this.friction = 0.985;
    this.size = Math.random() * 8 + 6;
    this.rotation = Math.random() * 360;
    this.rotationSpeed = (Math.random() - 0.5) * 12;
    this.opacity = 1; this.fadeSpeed = Math.random() * 0.008 + 0.006;
  }
  update() {
    this.vx *= this.friction; this.vy *= this.friction; this.vy += this.gravity;
    this.x += this.vx; this.y += this.vy;
    this.rotation += this.rotationSpeed; this.opacity -= this.fadeSpeed;
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
      context.beginPath(); context.arc(0, 0, this.size / 2, 0, Math.PI * 2); context.fill();
    }
    context.restore();
  }
}

function runParticleLoop() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.update(); p.draw(ctx);
    if (p.opacity <= 0 || p.y > canvas.height + 50) particles.splice(i, 1);
  }
  if (particles.length > 0) animationFrameId = requestAnimationFrame(runParticleLoop);
  else { cancelAnimationFrame(animationFrameId); animationFrameId = null; }
}

function fireConfettiExplosion() {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  const centerX = window.innerWidth / 2; const centerY = window.innerHeight / 2 - 50;
  for (let i = 0; i < 120; i++) particles.push(new Particle(centerX, centerY, colors[Math.floor(Math.random() * colors.length)], "confetti"));
  if (!animationFrameId) runParticleLoop();
}

function fireRippleEffect() {
  const colors = ["#60a5fa", "#93c5fd", "#cbd5e1"];
  const centerX = window.innerWidth / 2; const centerY = window.innerHeight / 2;
  for (let i = 0; i < 40; i++) particles.push(new Particle(centerX, centerY, colors[Math.floor(Math.random() * colors.length)], "circle"));
  if (!animationFrameId) runParticleLoop();
}

backToListFromQuestionBtnEl.addEventListener("click", fetchQuestionList);
backToListFromResultBtnEl.addEventListener("click", fetchQuestionList);
retryBtnEl.addEventListener("click", () => {
  if (currentQuestion) fetchQuestion(currentQuestion.questionId);
  else fetchQuestionList();
});
reloadBtnEl.addEventListener("click", fetchQuestionList);

window.addEventListener("DOMContentLoaded", () => {
  const urlParams = new URLSearchParams(window.location.search);
  const directQuestionId = urlParams.get("q");
  if (directQuestionId) fetchQuestion(directQuestionId);
  else fetchQuestionList();
});
