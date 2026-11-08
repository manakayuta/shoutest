/**
 * ========================================================
 * 数学小テスト 問題作成スタジオ ロジック v3.0 (creator.js)
 * GAS (HtmlService Strict CSP iframe) / ローカル両対応・完全版
 * ※ GASのCSP仕様により、HTML側インラインイベント属性 (onclick等) は使わず
 *    すべて addEventListener でイベントを登録する
 * ========================================================
 */

const STORAGE_KEY_API = "quick_quiz_gemini_api_key";
const STORAGE_KEY_FOLDER = "quick_quiz_drive_folder_url";
const DEFAULT_GAS_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

let currentImageBase64 = null;
let currentGeneratedData = null;
let isAppInitialized = false;
let dragDepth = 0;
let lastHandledPasteEvent = null;

function el(id) {
  return document.getElementById(id);
}

// 安全なストレージ操作ラッパー（GAS iframeやサードパーティCookie制限下での例外を防止）
const safeStorage = {
  get(key) {
    try {
      return window.localStorage ? window.localStorage.getItem(key) : null;
    } catch (e) {
      return null;
    }
  },
  set(key, val) {
    try {
      if (window.localStorage) window.localStorage.setItem(key, val);
    } catch (e) {}
  },
  remove(key) {
    try {
      if (window.localStorage) window.localStorage.removeItem(key);
    } catch (e) {}
  }
};

function setVersionBadge(text, stateClass) {
  const badge = el("versionBadge");
  if (!badge) return;
  badge.textContent = text;
  badge.classList.remove("badge-ready", "badge-error");
  if (stateClass) badge.classList.add(stateClass);
}

function setPasteStatus(msg, isWarn) {
  const statusEl = el("pasteStatusMsg");
  if (!statusEl) return;
  if (!msg) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    statusEl.classList.remove("warn");
    return;
  }
  statusEl.textContent = msg;
  statusEl.classList.remove("hidden");
  if (isWarn) {
    statusEl.classList.add("warn");
  } else {
    statusEl.classList.remove("warn");
  }
}

function focusPasteBox(statusMsg, isWarn) {
  const box = el("pasteCatcherBox");
  if (!box) return;
  box.innerHTML = "";
  box.classList.add("paste-ready");
  box.setAttribute("data-placeholder", "⌨️ このまま Ctrl + V を押してください！（右クリック→貼り付けも可）");
  try {
    box.focus();
    const sel = window.getSelection();
    if (sel) {
      const range = document.createRange();
      range.selectNodeContents(box);
      range.collapse(true);
      sel.removeAllRanges();
      sel.addRange(range);
    }
  } catch (e) {}
  if (statusMsg !== undefined) {
    setPasteStatus(statusMsg, Boolean(isWarn));
  }
}

function resetPasteBoxState() {
  const box = el("pasteCatcherBox");
  if (box) {
    box.innerHTML = "";
    box.classList.remove("paste-ready");
    box.setAttribute("data-placeholder", "💡 ここをクリックして Ctrl + V（または右クリック→貼り付け）");
  }
  setPasteStatus("", false);
}

// ==========================================
// 1. 初期ロード & イベント登録（完全CSP準拠）
// ==========================================
function initSettings() {
  const apiKeyInput = el("apiKeyInput");
  const apiSavedNotice = el("apiSavedNotice");
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const folderSavedNotice = el("folderSavedNotice");
  const studentAppLink = el("studentAppLink");

  // GAS環境内の場合は「生徒用テスト画面を開く」リンクをWebアプリTOPに向ける
  if (studentAppLink && typeof google !== "undefined" && google.script) {
    studentAppLink.href = DEFAULT_GAS_URL;
  }

  const savedApiKey = safeStorage.get(STORAGE_KEY_API);
  if (savedApiKey && apiKeyInput && !apiKeyInput.value) {
    apiKeyInput.value = savedApiKey;
  }
  if (apiSavedNotice) {
    apiSavedNotice.style.display = (apiKeyInput && apiKeyInput.value.trim()) ? "inline-block" : "none";
  }

  const savedFolderUrl = safeStorage.get(STORAGE_KEY_FOLDER);
  if (savedFolderUrl && driveFolderUrlInput && !driveFolderUrlInput.value) {
    driveFolderUrlInput.value = savedFolderUrl;
  }
  if (folderSavedNotice) {
    folderSavedNotice.style.display = (driveFolderUrlInput && driveFolderUrlInput.value.trim()) ? "inline-block" : "none";
  }

  checkReadyToGenerate();
}

function initCreatorApp() {
  try {
    initSettings();

    if (isAppInitialized) return;

    const fileInput = el("fileInput");
    const dropZone = el("dropZone");
    const clipPasteBtn = el("clipPasteBtn");
    const pasteCatcherBox = el("pasteCatcherBox");
    const clearImgBtn = el("clearImgBtn");
    const apiKeyInput = el("apiKeyInput");
    const toggleApiVisibilityBtn = el("toggleApiVisibilityBtn");
    const driveFolderUrlInput = el("driveFolderUrlInput");
    const generateBtn = el("generateBtn");
    const exportBtn = el("exportBtn");
    const manualCopyBtn = el("manualCopyBtn");

    if (!fileInput || !dropZone || !pasteCatcherBox) {
      // DOM構築前なら後続イベントで再実行
      return;
    }

    isAppInitialized = true;

    // 1) APIキー・フォルダURL入力設定
    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", handleApiKeyInput);
      apiKeyInput.addEventListener("change", handleApiKeyInput);
    }
    if (toggleApiVisibilityBtn) {
      toggleApiVisibilityBtn.addEventListener("click", handleToggleApiVis);
    }
    if (driveFolderUrlInput) {
      driveFolderUrlInput.addEventListener("input", handleFolderUrlInput);
      driveFolderUrlInput.addEventListener("change", handleFolderUrlInput);
    }

    // 2) ファイル選択 input
    fileInput.addEventListener("change", function () {
      if (fileInput.files && fileInput.files[0]) {
        handleImageFile(fileInput.files[0], fileInput);
      }
    });

    // 3) 「📋 スクショを貼り付け」ボタン
    if (clipPasteBtn) {
      clipPasteBtn.addEventListener("click", handlePasteButtonClick);
    }

    // 4) contenteditable ペースト受信ボックス
    pasteCatcherBox.addEventListener("click", function (e) {
      e.stopPropagation();
      focusPasteBox("⌨️ ここにカーソルが合いました！そのまま Ctrl + V（または右クリック→貼り付け）してください", false);
    });
    pasteCatcherBox.addEventListener("focus", function () {
      pasteCatcherBox.classList.add("paste-ready");
    });
    pasteCatcherBox.addEventListener("blur", function () {
      pasteCatcherBox.classList.remove("paste-ready");
    });
    pasteCatcherBox.addEventListener("paste", function (e) {
      handlePasteEvent(e);
      setTimeout(handlePasteBoxDomFallback, 60);
    });
    pasteCatcherBox.addEventListener("input", function () {
      handlePasteBoxDomFallback();
    });

    // 5) 画面全体の Ctrl + V もキャッチ
    document.addEventListener("paste", handlePasteEvent);
    window.addEventListener("paste", handlePasteEvent);

    // 6) ドラッグ＆ドロップ（ページ遷移抑止 + ドロップゾーン処理）
    ["dragover", "drop"].forEach((evt) => {
      window.addEventListener(evt, (e) => {
        e.preventDefault();
      }, false);
      document.addEventListener(evt, (e) => {
        e.preventDefault();
      }, false);
    });

    dropZone.addEventListener("dragenter", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragDepth++;
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragover", function (e) {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer) {
        try { e.dataTransfer.dropEffect = "copy"; } catch (err) {}
      }
      dropZone.classList.add("drag-over");
    });

    dropZone.addEventListener("dragleave", function (e) {
      e.preventDefault();
      e.stopPropagation();
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        dropZone.classList.remove("drag-over");
      }
    });

    dropZone.addEventListener("drop", handleDropFile);

    // 7) 画像削除・AI生成・エクスポート・手動コピー
    if (clearImgBtn) {
      clearImgBtn.addEventListener("click", handleClearImage);
    }
    if (generateBtn) {
      generateBtn.addEventListener("click", handleGenerateClick);
    }
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExportClick);
    }
    if (manualCopyBtn) {
      manualCopyBtn.addEventListener("click", handleManualCopyClick);
    }

    setVersionBadge("教員用ツール v3.0 (🟢 動作準備OK)", "badge-ready");
  } catch (err) {
    console.error("Creator init error:", err);
    setVersionBadge("教員用ツール v3.0 (🔴 起動エラー: " + err.message + ")", "badge-error");
  }
}

window.addEventListener("error", function (e) {
  if (!isAppInitialized) {
    setVersionBadge("教員用ツール v3.0 (🔴 エラー: " + (e.message || "不明") + ")", "badge-error");
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCreatorApp);
} else {
  initCreatorApp();
}
window.addEventListener("load", initCreatorApp);
setTimeout(initCreatorApp, 150);

// ==========================================
// 設定入力ハンドラ
// ==========================================
function handleApiKeyInput() {
  const apiKeyInput = el("apiKeyInput");
  const apiSavedNotice = el("apiSavedNotice");
  if (!apiKeyInput) return;

  const key = apiKeyInput.value.trim();
  if (key) {
    safeStorage.set(STORAGE_KEY_API, key);
    if (apiSavedNotice) apiSavedNotice.style.display = "inline-block";
  } else {
    safeStorage.remove(STORAGE_KEY_API);
    if (apiSavedNotice) apiSavedNotice.style.display = "none";
  }
  checkReadyToGenerate();
}

function handleToggleApiVis() {
  const apiKeyInput = el("apiKeyInput");
  const toggleBtn = el("toggleApiVisibilityBtn");
  if (!apiKeyInput || !toggleBtn) return;

  if (apiKeyInput.type === "password") {
    apiKeyInput.type = "text";
    toggleBtn.textContent = "🙈";
  } else {
    apiKeyInput.type = "password";
    toggleBtn.textContent = "👁️";
  }
}

function handleFolderUrlInput() {
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const folderSavedNotice = el("folderSavedNotice");
  if (!driveFolderUrlInput) return;

  const url = driveFolderUrlInput.value.trim();
  if (url) {
    safeStorage.set(STORAGE_KEY_FOLDER, url);
    if (folderSavedNotice) folderSavedNotice.style.display = "inline-block";
  } else {
    safeStorage.remove(STORAGE_KEY_FOLDER);
    if (folderSavedNotice) folderSavedNotice.style.display = "none";
  }
}

// ==========================================
// 2. 画像の取り込み処理
// ==========================================
function setSourceImageDataUrl(dataUrl) {
  if (!dataUrl || typeof dataUrl !== "string" || !dataUrl.startsWith("data:image/")) {
    return;
  }
  currentImageBase64 = dataUrl;
  const sourceImagePreview = el("sourceImagePreview");
  const dropZoneContent = el("dropZoneContent");
  const sourceImagePreviewWrapper = el("sourceImagePreviewWrapper");

  if (sourceImagePreview) sourceImagePreview.src = currentImageBase64;
  if (dropZoneContent) dropZoneContent.classList.add("hidden");
  if (sourceImagePreviewWrapper) sourceImagePreviewWrapper.classList.remove("hidden");
  resetPasteBoxState();
  checkReadyToGenerate();
}

function handleImageFile(file, sourceInputEl) {
  if (!file) return;

  const isImage = (file.type && file.type.startsWith("image/")) ||
                  /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "") ||
                  (file.size > 0 && (!file.type || file.type === "image"));

  if (!isImage) {
    if (sourceInputEl) {
      try { sourceInputEl.value = ""; } catch (e) {}
    }
    alert("画像ファイル（PNG, JPG 等）を選択してください。");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    setSourceImageDataUrl(e.target.result);
  };
  reader.onerror = function () {
    alert("画像の読み込みに失敗しました。もう一度お試しください。");
  };
  reader.onloadend = function () {
    if (sourceInputEl) {
      try { sourceInputEl.value = ""; } catch (e) {}
    }
  };
  reader.readAsDataURL(file);
}

// ② 「📋 スクショを貼り付け」ボタンクリック
async function handlePasteButtonClick(e) {
  if (e) e.stopPropagation();

  if (navigator.clipboard && typeof navigator.clipboard.read === "function") {
    try {
      const clipboardItems = await navigator.clipboard.read();
      for (const item of clipboardItems) {
        const imageType = item.types.find(type => type.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          if (blob) {
            handleImageFile(blob);
            return;
          }
        }
      }
      focusPasteBox("⚠️ クリップボードに画像が見つかりません。画面切り取り（Win+Shift+S 等）で画像をコピー後、ここで Ctrl + V してください。", true);
      return;
    } catch (err) {
      // GAS iframe では Permissions-Policy で clipboard.read() がブロックされるのが正常動作
      console.warn("Clipboard API blocked, focusing contenteditable paste box:", err);
    }
  }

  focusPasteBox("⌨️ ここにカーソルが合いました！そのままキーボードの「Ctrl + V」を押してください！", false);
}

// ③ Ctrl + V ペーストイベント（clipboardData.files / items を優先取得）
function handlePasteEvent(e) {
  if (!e || e === lastHandledPasteEvent) return;

  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  // 1. filesリストから画像を探す
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const f = clipboardData.files[i];
      if ((f.type && f.type.startsWith("image/")) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || "")) {
        lastHandledPasteEvent = e;
        e.preventDefault();
        e.stopPropagation();
        handleImageFile(f);
        return;
      }
    }
  }

  // 2. itemsリストから画像を探す（Snipping Tool等のスクショ）
  if (clipboardData.items && clipboardData.items.length > 0) {
    for (let i = 0; i < clipboardData.items.length; i++) {
      const item = clipboardData.items[i];
      if (item.type && item.type.indexOf("image") !== -1) {
        const blob = item.getAsFile();
        if (blob) {
          lastHandledPasteEvent = e;
          e.preventDefault();
          e.stopPropagation();
          handleImageFile(blob);
          return;
        }
      }
    }
  }

  // 3. HTML内にdata:imageが埋め込まれて貼られるケースへのフォールバック
  const htmlText = clipboardData.getData ? clipboardData.getData("text/html") : "";
  if (htmlText) {
    const match = htmlText.match(/src=["'](data:image\/[^"']+)["']/i);
    if (match && match[1]) {
      lastHandledPasteEvent = e;
      e.preventDefault();
      e.stopPropagation();
      setSourceImageDataUrl(match[1]);
      return;
    }
  }
}

// contenteditable ボックス内に直接 <img> が挿入された場合のフォールバック + 非画像テキスト掃除
function handlePasteBoxDomFallback() {
  const box = el("pasteCatcherBox");
  if (!box) return;

  const img = box.querySelector("img");
  if (img && img.src) {
    const src = img.src;
    box.innerHTML = "";
    if (src.startsWith("data:image/")) {
      setSourceImageDataUrl(src);
      return;
    }
    if (src.startsWith("blob:")) {
      fetch(src)
        .then(r => r.blob())
        .then(blob => handleImageFile(blob))
        .catch(() => {
          setPasteStatus("⚠️ 画像データの取得に失敗しました。ファイル選択またはドラッグ＆ドロップをお試しください。", true);
        });
      return;
    }
  }

  // 画像以外の文字が入力/ペーストされたらクリアして案内
  if (box.innerHTML !== "") {
    const hadText = (box.textContent || "").trim().length > 0;
    box.innerHTML = "";
    if (hadText) {
      setPasteStatus("⚠️ 文字ではなく「画像（スクショ）」をコピーした状態で Ctrl + V してください。", true);
    }
  }
}

// ④ ドラッグ＆ドロップ処理
function handleDropFile(e) {
  e.preventDefault();
  e.stopPropagation();
  dragDepth = 0;
  const dz = el("dropZone");
  if (dz) dz.classList.remove("drag-over");

  const dt = e.dataTransfer;
  if (!dt) return;

  if (dt.files && dt.files.length > 0) {
    handleImageFile(dt.files[0]);
    return;
  }

  if (dt.items && dt.items.length > 0) {
    for (let i = 0; i < dt.items.length; i++) {
      if (dt.items[i].kind === "file") {
        const f = dt.items[i].getAsFile();
        if (f) {
          handleImageFile(f);
          return;
        }
      }
    }
  }

  const htmlText = dt.getData ? dt.getData("text/html") : "";
  if (htmlText) {
    const match = htmlText.match(/src=["'](data:image\/[^"']+)["']/i);
    if (match && match[1]) {
      setSourceImageDataUrl(match[1]);
    }
  }
}

// ⑤ 画像削除ボタン
function handleClearImage(e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentImageBase64 = null;
  const fileInput = el("fileInput");
  const sourceImagePreview = el("sourceImagePreview");
  const sourceImagePreviewWrapper = el("sourceImagePreviewWrapper");
  const dropZoneContent = el("dropZoneContent");

  if (fileInput) fileInput.value = "";
  if (sourceImagePreview) sourceImagePreview.src = "";
  if (sourceImagePreviewWrapper) sourceImagePreviewWrapper.classList.add("hidden");
  if (dropZoneContent) dropZoneContent.classList.remove("hidden");
  resetPasteBoxState();
  checkReadyToGenerate();
}

function checkReadyToGenerate() {
  const apiKeyInput = el("apiKeyInput");
  const generateBtn = el("generateBtn");
  const hasKey = apiKeyInput ? apiKeyInput.value.trim().length > 0 : false;
  const hasImage = currentImageBase64 !== null;
  if (generateBtn) generateBtn.disabled = !(hasKey && hasImage);
}

// ==========================================
// 3. Gemini API による解析・改題・生成
// ==========================================
async function handleGenerateClick() {
  const apiKeyInput = el("apiKeyInput");
  const customPromptInput = el("customPromptInput");
  const placeholderBox = el("placeholderBox");
  const resultArea = el("resultArea");
  const loadingBox = el("loadingBox");
  const loadingStatusText = el("loadingStatusText");
  const copySuccessMessage = el("copySuccessMessage");
  const exportWarningMessage = el("exportWarningMessage");
  const manualCopyBox = el("manualCopyBox");
  const generateBtn = el("generateBtn");

  const apiKey = apiKeyInput ? apiKeyInput.value.trim() : "";
  if (!apiKey) {
    alert("Gemini APIキーを入力してください。");
    if (apiKeyInput) apiKeyInput.focus();
    return;
  }
  if (!currentImageBase64) {
    alert("問題画像をセットしてください。");
    return;
  }

  const remakeRadio = document.querySelector('input[name="remakeMode"]:checked');
  const typeRadio = document.querySelector('input[name="questionType"]:checked');
  const remakeMode = remakeRadio ? remakeRadio.value : "exact";
  const questionType = typeRadio ? typeRadio.value : "マーク";
  const customPrompt = customPromptInput ? customPromptInput.value.trim() : "";

  if (placeholderBox) placeholderBox.classList.add("hidden");
  if (resultArea) resultArea.classList.add("hidden");
  if (loadingBox) loadingBox.classList.remove("hidden");
  if (copySuccessMessage) copySuccessMessage.classList.add("hidden");
  if (exportWarningMessage) exportWarningMessage.classList.add("hidden");
  if (manualCopyBox) manualCopyBox.classList.add("hidden");
  if (generateBtn) generateBtn.disabled = true;

  try {
    if (loadingStatusText) loadingStatusText.textContent = "AIが画像を解析し、数式と問題を構成しています...";

    const mimeType = currentImageBase64.split(";")[0].split(":")[1];
    const base64Data = currentImageBase64.split(",")[1];

    const systemPrompt = [
      "あなたは日本の高校数学の優秀な教員であり教材作成のスペシャリストです。",
      "添付された数学の問題画像を読み取り、指定されたルールに従って小テスト用データをJSON形式で出力してください。",
      "",
      "【設定条件】",
      "- 改題モード: " + (remakeMode === "exact" ? "元画像の問題をできるだけ忠実に再現（マーク化/選択肢化のみ行う）" : "元画像の問題を改題（数値を変更した類題を作成）"),
      "- 出題形式: " + questionType + "（マーク式または選択式）",
      customPrompt ? ("- 追加指示: " + customPrompt) : "",
      "",
      "【数学・表記ルール】",
      "1. 数式はすべて LaTeX 記法（$ ... $ または $$ ... $$）で美しく記述してください。",
      "2. マーク式の場合:",
      "   - 問題文中に穴埋め枠として \\fbox{ ア } や \\fbox{ イ } のようにマーク枠を配置してください。",
      "   - slotsOrChoices には [\"ア\", \"イ\"] のように使用したマーク枠のカタカナ文字を配列で入れてください。",
      "   - correctAnswer には \"1, 2\" や \"-, 3\" のようにカンマ区切りで各枠の正解を入れてください。",
      "3. 選択式の場合:",
      "   - slotsOrChoices には [\"選択肢Aのテキスト\", \"選択肢Bのテキスト\", \"選択肢Cのテキスト\", \"選択肢Dのテキスト\"] を入れてください（2〜4択）。",
      "   - correctAnswer には正解の文字（\"A\", \"B\", \"C\", \"D\" のいずれか）を入れてください。",
      "4. explanationMarkdown には、生徒が読んですぐ理解できる丁寧な途中式とポイント解説を LaTeX を交えて記述してください。",
      "",
      "【出力フォーマット】",
      "以下のJSONフォーマットのみを純粋に出力してください（コードブロック記号は含めないでください）。",
      "{",
      "  \"title\": \"単元名・問題タイトル（例: 第◯回 2次関数の決定）\",",
      "  \"problemMarkdown\": \"問題文の本文（LaTeX数式記法を含む）\",",
      "  \"type\": \"" + questionType + "\",",
      "  \"slotsOrChoices\": [\"ア\", \"イ\"],",
      "  \"correctAnswer\": \"1, 2\",",
      "  \"explanationMarkdown\": \"解説本文（LaTeX数式記法を含む）\"",
      "}"
    ].filter(line => line !== null).join("\n");

    const requestBody = {
      contents: [
        {
          parts: [
            { text: systemPrompt },
            {
              inline_data: {
                mime_type: mimeType,
                data: base64Data
              }
            }
          ]
        }
      ],
      generationConfig: {
        temperature: 0.2,
        response_mime_type: "application/json"
      }
    };

    const modelCandidates = ["gemini-3.8-flash", "gemini-1.5-flash", "gemini-2.0-flash"];
    let response = null;
    let lastErrorMsg = "";

    for (const model of modelCandidates) {
      const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
      try {
        const res = await fetch(apiUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(requestBody)
        });
        if (res.ok) {
          response = res;
          break;
        } else {
          const errJson = await res.json().catch(() => ({}));
          lastErrorMsg = errJson.error?.message || res.statusText;
        }
      } catch (err) {
        lastErrorMsg = err.message;
      }
    }

    if (!response) {
      throw new Error(`Gemini API エラー: ${lastErrorMsg}`);
    }

    const responseData = await response.json();
    const candidateText = responseData.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!candidateText) {
      throw new Error("AIから応答が得られませんでした。");
    }

    let parsedData;
    try {
      const cleanJson = candidateText
        .replace(/^\x60\x60\x60json\s*/i, "")
        .replace(/^\x60\x60\x60\s*/, "")
        .replace(/\s*\x60\x60\x60$/, "")
        .trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON parse error:", candidateText);
      throw new Error("AIの応答をJSONとして解釈できませんでした。もう一度お試しください。");
    }

    currentGeneratedData = parsedData;
    renderPreview(parsedData);

    if (loadingBox) loadingBox.classList.add("hidden");
    if (resultArea) resultArea.classList.remove("hidden");
  } catch (error) {
    console.error("生成エラー:", error);
    alert(`生成に失敗しました: ${error.message}`);
    if (loadingBox) loadingBox.classList.add("hidden");
    if (placeholderBox) placeholderBox.classList.remove("hidden");
  } finally {
    if (generateBtn) generateBtn.disabled = false;
    checkReadyToGenerate();
  }
}

// ==========================================
// 4. プレビューの描画とKaTeX数式レンダリング
// ==========================================
function renderPreview(data) {
  const resultTitleInput = el("resultTitleInput");
  const problemCardContent = el("problemCardContent");
  const explanationCardContent = el("explanationCardContent");
  const choicesLabel = el("choicesLabel");
  const choicesInput = el("choicesInput");
  const correctAnswerInput = el("correctAnswerInput");

  if (resultTitleInput) resultTitleInput.value = data.title || "数学 小テスト";

  if (problemCardContent) {
    problemCardContent.innerHTML = formatMarkdownMath(data.problemMarkdown);
    renderMath(problemCardContent);
  }

  if (explanationCardContent) {
    explanationCardContent.innerHTML = formatMarkdownMath(data.explanationMarkdown);
    renderMath(explanationCardContent);
  }

  const isMark = (data.type === "マーク" || data.type === "マーク式");
  if (choicesLabel) choicesLabel.textContent = isMark ? "マーク枠ラベル（カンマ区切り）" : "選択肢（カンマ区切り）";
  if (choicesInput) choicesInput.value = (data.slotsOrChoices || []).join(", ");
  if (correctAnswerInput) correctAnswerInput.value = data.correctAnswer || "";
}

function formatMarkdownMath(text) {
  if (!text) return "";
  return text
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

function renderMath(element) {
  if (typeof renderMathInElement === "function") {
    renderMathInElement(element, {
      delimiters: [
        { left: "$$", right: "$$", display: true },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: true },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
  }
}

// ==========================================
// 5. ドライブ保存 ＆ スプレッドシート用TSVコピー
// ==========================================
async function copyTextSafely(text) {
  // 1) Clipboard API を試行
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      console.warn("clipboard.writeText blocked, falling back to execCommand:", e);
    }
  }

  // 2) 非表示 textarea + execCommand("copy") フォールバック
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    ta.style.left = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return Boolean(ok);
  } catch (e) {
    console.warn("execCommand copy failed:", e);
    return false;
  }
}

async function handleExportClick() {
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const resultTitleInput = el("resultTitleInput");
  const choicesInput = el("choicesInput");
  const correctAnswerInput = el("correctAnswerInput");
  const problemCard = el("problemCard");
  const copySuccessMessage = el("copySuccessMessage");
  const exportWarningMessage = el("exportWarningMessage");
  const manualCopyBox = el("manualCopyBox");
  const manualCopyTextarea = el("manualCopyTextarea");
  const exportBtn = el("exportBtn");
  const exportBtnText = el("exportBtnText");

  const folderUrl = driveFolderUrlInput ? driveFolderUrlInput.value.trim() : "";
  const title = (resultTitleInput && resultTitleInput.value.trim()) || "小テスト";
  const type = (currentGeneratedData && currentGeneratedData.type) || "マーク";
  const rawChoices = choicesInput ? choicesInput.value.split(",").map(s => s.trim()).filter(s => s !== "") : [];
  const correctAnswer = correctAnswerInput ? correctAnswerInput.value.trim() : "";

  if (copySuccessMessage) copySuccessMessage.classList.add("hidden");
  if (exportWarningMessage) {
    exportWarningMessage.textContent = "";
    exportWarningMessage.classList.add("hidden");
  }
  if (manualCopyBox) manualCopyBox.classList.add("hidden");
  if (exportBtn) exportBtn.disabled = true;
  if (exportBtnText) exportBtnText.textContent = "問題画像を生成中...";

  try {
    if (typeof html2canvas !== "function") {
      throw new Error("画像変換ライブラリ(html2canvas)がまだ読み込まれていません。数秒待つかページを再読み込みしてお試しください。");
    }

    const canvas = await html2canvas(problemCard, {
      scale: 2,
      backgroundColor: "#ffffff"
    });
    const problemImageBase64 = canvas.toDataURL("image/png");

    let finalImageUrl = "";
    let driveWarning = "";

    // Googleドライブへの自動アップロード
    if (!folderUrl) {
      driveWarning = "⚠️ 「画像保存先 Googleドライブ フォルダURL」が未入力のため、問題画像をPCにダウンロード保存しました（URLを入力すると次回からドライブへ自動保存されます）。";
    } else if (!folderUrl.includes("drive.google.com")) {
      driveWarning = "⚠️ GoogleドライブのフォルダURL形式が正しくないため、問題画像をPCにダウンロード保存しました（https://drive.google.com/drive/folders/... のURLを指定してください）。";
    } else {
      if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存中...";

      try {
        if (typeof google !== "undefined" && google.script && google.script.run) {
          finalImageUrl = await new Promise((resolve, reject) => {
            google.script.run
              .withSuccessHandler(url => resolve(url))
              .withFailureHandler(err => reject(err))
              .uploadImageServer(folderUrl, problemImageBase64, `quiz_${Date.now()}.png`);
          });
        } else {
          const uploadPayload = {
            action: "uploadImage",
            folderUrl: folderUrl,
            base64Image: problemImageBase64,
            filename: `quiz_${Date.now()}.png`
          };

          const uploadRes = await fetch(DEFAULT_GAS_URL, {
            method: "POST",
            headers: { "Content-Type": "text/plain;charset=utf-8" },
            redirect: "follow",
            body: JSON.stringify(uploadPayload)
          });

          if (uploadRes.ok) {
            const resData = await uploadRes.json();
            if (resData.imageUrl) {
              finalImageUrl = resData.imageUrl;
            } else if (resData.error) {
              throw new Error(resData.error);
            }
          } else {
            throw new Error("HTTP " + uploadRes.status);
          }
        }
      } catch (e) {
        console.warn("ドライブ保存エラー:", e);
        driveWarning = "⚠️ Googleドライブ自動保存に失敗しました（" + (e && e.message ? e.message : e) + "）。代わりに画像をPCへダウンロード保存しました。";
      }
    }

    if (!finalImageUrl) {
      finalImageUrl = "（Googleドライブ保存完了後にURLが入ります）";
      downloadBase64Image(problemImageBase64, `${title}_問題.png`);
    }

    if (driveWarning && exportWarningMessage) {
      exportWarningMessage.textContent = driveWarning;
      exportWarningMessage.classList.remove("hidden");
    }

    const choiceCols = [
      rawChoices[0] || "",
      rawChoices[1] || "",
      rawChoices[2] || "",
      rawChoices[3] || "",
      rawChoices[4] || "",
      rawChoices[5] || ""
    ];

    const tsvRow = [
      title,
      (type === "マーク" || type === "マーク式") ? "マーク" : "選択",
      finalImageUrl,
      choiceCols[0],
      choiceCols[1],
      choiceCols[2],
      choiceCols[3],
      choiceCols[4],
      choiceCols[5],
      correctAnswer,
      "公開"
    ].join("\t");

    if (manualCopyTextarea) manualCopyTextarea.value = tsvRow;

    const copied = await copyTextSafely(tsvRow);
    if (copied) {
      if (copySuccessMessage) copySuccessMessage.classList.remove("hidden");
      if (exportBtnText) exportBtnText.textContent = "✓ 保存＆クリップボードにコピー完了！";
    } else {
      if (manualCopyBox) manualCopyBox.classList.remove("hidden");
      if (exportBtnText) exportBtnText.textContent = "Googleドライブ保存完了！（下のボタンでコピーしてください）";
    }
  } catch (err) {
    console.error("エクスポートエラー:", err);
    alert(`保存・コピー処理中にエラーが発生しました: ${err.message}`);
    if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存して、C列貼り付けデータをコピー！";
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
}

function handleManualCopyClick() {
  const ta = el("manualCopyTextarea");
  const copySuccessMessage = el("copySuccessMessage");
  if (!ta) return;

  ta.focus();
  ta.select();
  let ok = false;
  try {
    ok = document.execCommand("copy");
  } catch (e) {}

  if (!ok && navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(ta.value).catch(() => {});
    ok = true;
  }

  if (copySuccessMessage) copySuccessMessage.classList.remove("hidden");
}

function downloadBase64Image(base64Data, filename) {
  const a = document.createElement("a");
  a.href = base64Data;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
