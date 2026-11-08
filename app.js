/**
 * ========================================================
 * 数学 復習小テスト アプリケーションロジック (app.js)
 * ========================================================
 */

// ==========================================
// 1. 設定項目
// ==========================================
// GASのWebアプリをデプロイしたら、ここに発行されたURLを貼り付けてください。
// 空文字 "" の状態では自動的に【デモモード】として動作し、動作テストが可能です。
const GAS_WEB_APP_URL = "";

// デモモード用モックデータ（高校数学の代表的な基本問題）
// 綺麗な数式SVG画像をインライン生成して使用します
const DEMO_QUESTION = {
  questionId: "math-demo-001",
  questionTitle: "問題 1",
  // SVG形式の綺麗な数式画像（外部画像URLがなくても確実に表示されます）
  imageUrl: `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="600" height="240" viewBox="0 0 600 240">
    <rect width="100%" height="100%" fill="%23ffffff" rx="12"/>
    <rect x="2" y="2" width="596" height="236" fill="none" stroke="%23e2e8f0" stroke-width="2" rx="10"/>
    <text x="30" y="55" font-family="-apple-system, sans-serif" font-size="20" font-weight="bold" fill="%231e293b">【2次関数の頂点】</text>
    <text x="30" y="105" font-family="-apple-system, sans-serif" font-size="22" fill="%23334155">次の2次関数のグラフの頂点の座標を求めよ。</text>
    <rect x="50" y="130" width="500" height="75" fill="%23f8fafc" stroke="%23cbd5e1" stroke-width="1.5" rx="8"/>
    <text x="300" y="178" font-family="Cambria Math, Times New Roman, serif" font-size="34" font-weight="bold" font-style="italic" fill="%231d4ed8" text-anchor="middle">y = 2(x - 3)² + 4</text>
  </svg>`,
  choices: [
    "( 3 ,  4 )",
    "( -3 ,  4 )",
    "( 3 , -4 )",
    "( -3 , -4 )"
  ],
  correctAnswer: "( 3 ,  4 )"
};

// ==========================================
// 2. DOM要素の取得
// ==========================================
const screens = {
  loading: document.getElementById("loadingScreen"),
  question: document.getElementById("questionScreen"),
  result: document.getElementById("resultScreen"),
  error: document.getElementById("errorScreen")
};

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

// アプリ内部の状態管理
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
 * 1. 問題データの取得（GETリクエスト）
 */
async function fetchQuestion() {
  switchScreen("loading");

  // GASのURLが未設定の場合はデモモードで動作
  if (!GAS_WEB_APP_URL || GAS_WEB_APP_URL.trim() === "") {
    console.log("【デモモード】モック問題データを読み込みます。");
    demoNoticeEl.classList.remove("hidden");
    // 少し待機時間を設けてローディング演出を確認できるようにする
    await new Promise((resolve) => setTimeout(resolve, 800));
    currentQuestion = DEMO_QUESTION;
    renderQuestion(currentQuestion);
    return;
  }

  // GASへ実際にリクエスト
  demoNoticeEl.classList.add("hidden");
  try {
    const response = await fetch(`${GAS_WEB_APP_URL}?action=getQuestion`, {
      method: "GET",
      headers: {
        "Accept": "application/json"
      }
    });

    if (!response.ok) {
      throw new Error(`サーバーエラー (ステータス: ${response.status})`);
    }

    const data = await response.json();
    currentQuestion = data;
    renderQuestion(data);
  } catch (error) {
    console.error("問題取得エラー:", error);
    errorMessageEl.textContent = `通信エラーが発生しました: ${error.message}`;
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
    console.log("【デモモード】解答を判定します:", selectedChoice);
    await new Promise((resolve) => setTimeout(resolve, 600));

    const isCorrect = (selectedChoice === DEMO_QUESTION.correctAnswer);
    renderResult({
      isCorrect: isCorrect,
      correctAnswer: DEMO_QUESTION.correctAnswer
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

    // Google Apps ScriptのWebアプリPOSTはCORSプリフライトを避けるため
    // Content-Typeを text/plain にするか、リダイレクト追従を行います
    const response = await fetch(GAS_WEB_APP_URL, {
      method: "POST",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(payload)
    });

    if (!response.ok) {
      throw new Error(`送信エラー (ステータス: ${response.status})`);
    }

    const result = await response.json();
    renderResult(result);
  } catch (error) {
    console.error("解答送信エラー:", error);
    alert(`解答の送信中にエラーが発生しました。\nもう一度お試しください: ${error.message}`);
    // ボタンを再度有効化
    submittingOverlayEl.classList.add("hidden");
    buttons.forEach(btn => btn.disabled = false);
  }
}

// ==========================================
// 5. 画面描画処理
// ==========================================

/**
 * 出題画面の描画
 */
function renderQuestion(questionData) {
  // 問題番号
  questionNumberEl.textContent = questionData.questionTitle || `問題 (${questionData.questionId || 1})`;

  // 画像のロード待機処理
  imageLoaderEl.style.display = "flex";
  questionImageEl.style.opacity = "0";

  questionImageEl.onload = () => {
    imageLoaderEl.style.display = "none";
    questionImageEl.style.opacity = "1";
  };
  questionImageEl.onerror = () => {
    imageLoaderEl.innerHTML = `<span style="color:#ef4444;">画像の読み込みに失敗しました</span>`;
  };
  questionImageEl.src = questionData.imageUrl;

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

    // クリック時に即座送信（確認ダイアログなし）
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
 * 結果画面の描画と演出の起動
 */
function renderResult(result) {
  submittingOverlayEl.classList.add("hidden");
  switchScreen("result");

  const isCorrect = result.isCorrect;
  correctAnswerTextEl.textContent = result.correctAnswer || "";

  // 以前のアニメーションクラスをリセット
  resultCardEl.classList.remove("shake");

  if (isCorrect) {
    // 【正解の場合】
    resultIconEl.textContent = "🎉";
    resultTitleEl.textContent = "正解！お見事！";
    resultTitleEl.className = "result-title correct";
    resultMessageEl.textContent = "バッチリ理解できています！本日の授業もこの調子でいきましょう！";

    // 物理演算風の紙吹雪エフェクトを盛大に発射！
    fireConfettiExplosion();
  } else {
    // 【不正解の場合】
    resultIconEl.textContent = "💪";
    resultTitleEl.textContent = "惜しい！不正解…";
    resultTitleEl.className = "result-title incorrect";
    resultMessageEl.textContent = "間違えたところは絶好の学びのチャンス！授業内の解説をしっかり確認しましょう。";

    // シェイク（揺れ）と励ましパーティクル
    resultCardEl.classList.add("shake");
    fireRippleEffect();
  }
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

// パーティクルクラス（重力・空気抵抗・回転の物理計算）
class Particle {
  constructor(x, y, color, type = "confetti") {
    this.x = x;
    this.y = y;
    this.color = color;
    this.type = type;

    // 速度と方向（四方八方に爆発的に散る）
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 12 + 6);
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed - (type === "confetti" ? 6 : 2); // 初速で上にも跳ねる

    this.gravity = 0.28;       // 重力
    this.friction = 0.985;     // 空気抵抗

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
      // 四角い紙吹雪
      context.fillRect(-this.size / 2, -this.size / 4, this.size, this.size / 2);
    } else {
      // まるい星・しずく
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

// 正解時の紙吹雪大爆発
function fireConfettiExplosion() {
  const colors = ["#3b82f6", "#10b981", "#f59e0b", "#ef4444", "#8b5cf6", "#ec4899", "#06b6d4"];
  const centerX = window.innerWidth / 2;
  const centerY = window.innerHeight / 2 - 50;

  // 120個の紙吹雪を生成
  for (let i = 0; i < 120; i++) {
    const color = colors[Math.floor(Math.random() * colors.length)];
    particles.push(new Particle(centerX, centerY, color, "confetti"));
  }

  if (!animationFrameId) {
    runParticleLoop();
  }
}

// 不正解時のエフェクト（青・水色の星がポンと弾ける）
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
retryBtnEl.addEventListener("click", () => {
  fetchQuestion();
});

reloadBtnEl.addEventListener("click", () => {
  fetchQuestion();
});

// アプリ開始
window.addEventListener("DOMContentLoaded", () => {
  fetchQuestion();
});
