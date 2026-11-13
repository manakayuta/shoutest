// ========================================================
// 数学小テスト 問題作成スタジオ ロジック v4.3 (creator.js)
// GAS (HtmlService iframe) / ローカル両対応・完全版
// 生徒用画面 (index.html) と同一の純粋ES構文・AIモデル動的自動検出＆タイムアウト無制限版
// ========================================================

const STORAGE_KEY_API = "quick_quiz_gemini_api_key";
const STORAGE_KEY_FOLDER = "quick_quiz_drive_folder_url";
const DEFAULT_GAS_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

let currentImageBase64 = null;
let currentGeneratedData = null;
let isAppInitialized = false;
let dragDepth = 0;
let lastHandledPasteEvent = null;
let assetsLoadingStarted = false;
let activeGenerateToken = 0;
let activeAbortController = null;
let loadingTimerId = null;
let loadingStartTime = 0;

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

function setPasteStatus(msg, mode) {
  const statusEl = el("pasteStatusMsg");
  if (!statusEl) return;
  statusEl.classList.remove("hidden", "warn", "ready", "error");
  if (!msg) {
    statusEl.textContent = "";
    statusEl.classList.add("hidden");
    return;
  }
  statusEl.textContent = msg;
  if (mode === "warn" || mode === "ready" || mode === "error") {
    statusEl.classList.add(mode);
  }
}

function focusPasteBox(statusMsg, mode) {
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
    setPasteStatus(statusMsg, mode || "info");
  }
}

function resetPasteBoxState() {
  const box = el("pasteCatcherBox");
  if (box) {
    box.innerHTML = "";
    box.classList.remove("paste-ready");
    box.setAttribute("data-placeholder", "💡 ここをクリックして Ctrl + V（または右クリック→貼り付け）");
  }
  setPasteStatus("🟢 動作準備OK (v4.3) — ファイル選択 / D&D / Ctrl+V すべて対応", "ready");
}

// ==========================================
// 外部ライブラリ（KaTeX / html2canvas）の非同期遅延読み込み
// ※ 静的headでの外部通信ブロックによるUI起動停止を絶対に防ぐ
// ==========================================
function loadCssWithFallback(urls, idx) {
  if (idx >= urls.length) return;
  try {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = urls[idx];
    link.onerror = function () {
      loadCssWithFallback(urls, idx + 1);
    };
    (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(link);
  } catch (e) {}
}

function loadScriptWithFallback(urls, idx, onDone) {
  if (idx >= urls.length) {
    if (onDone) onDone(false);
    return;
  }
  try {
    const sc = document.createElement("script");
    sc.src = urls[idx];
    sc.async = true;
    sc.onload = function () {
      if (onDone) onDone(true);
    };
    sc.onerror = function () {
      loadScriptWithFallback(urls, idx + 1, onDone);
    };
    (document.head || document.getElementsByTagName("head")[0] || document.documentElement).appendChild(sc);
  } catch (e) {
    if (onDone) onDone(false);
  }
}

function loadExternalAssets() {
  if (assetsLoadingStarted) return;
  assetsLoadingStarted = true;

  loadCssWithFallback([
    "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css",
    "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css",
    "https://unpkg.com/katex@0.16.9/dist/katex.min.css"
  ], 0);

  loadScriptWithFallback([
    "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js",
    "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js",
    "https://unpkg.com/katex@0.16.9/dist/katex.min.js"
  ], 0, function (loaded) {
    if (loaded) {
      loadScriptWithFallback([
        "https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/contrib/auto-render.min.js",
        "https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/contrib/auto-render.min.js",
        "https://unpkg.com/katex@0.16.9/dist/contrib/auto-render.min.js"
      ], 0, function () {
        if (currentGeneratedData) {
          const pc = el("problemCardContent");
          const ec = el("explanationCardContent");
          if (pc) renderMath(pc);
          if (ec) renderMath(ec);
        }
      });
    }
  });

  loadScriptWithFallback([
    "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
    "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
    "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"
  ], 0);
}

function ensureHtml2Canvas() {
  if (typeof html2canvas === "function") {
    return Promise.resolve();
  }
  return new Promise(function (resolve, reject) {
    loadScriptWithFallback([
      "https://cdn.jsdelivr.net/npm/html2canvas@1.4.1/dist/html2canvas.min.js",
      "https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js",
      "https://unpkg.com/html2canvas@1.4.1/dist/html2canvas.min.js"
    ], 0, function (ok) {
      if (ok && typeof html2canvas === "function") {
        resolve();
      } else {
        reject(new Error("画像変換ライブラリ(html2canvas)を読み込めませんでした。ネットワーク接続を確認してください。"));
      }
    });
  });
}

// ==========================================
// 1. 初期ロード & イベント登録（完全CSP準拠）
// ==========================================
function syncSettingsNotices() {
  const apiKeyInput = el("apiKeyInput");
  const apiSavedNotice = el("apiSavedNotice");
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const folderSavedNotice = el("folderSavedNotice");

  if (apiSavedNotice) {
    apiSavedNotice.style.display = (apiKeyInput && apiKeyInput.value.trim()) ? "inline-block" : "none";
  }
  if (folderSavedNotice) {
    folderSavedNotice.style.display = (driveFolderUrlInput && driveFolderUrlInput.value.trim()) ? "inline-block" : "none";
  }
  checkReadyToGenerate();
}

function initSettings() {
  const apiKeyInput = el("apiKeyInput");
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const studentAppLink = el("studentAppLink");

  if (studentAppLink && typeof google !== "undefined" && google.script) {
    studentAppLink.href = DEFAULT_GAS_URL;
  }

  const savedApiKey = safeStorage.get(STORAGE_KEY_API);
  if (savedApiKey && apiKeyInput && !apiKeyInput.value) {
    apiKeyInput.value = savedApiKey;
  }

  const savedFolderUrl = safeStorage.get(STORAGE_KEY_FOLDER);
  if (savedFolderUrl && driveFolderUrlInput && !driveFolderUrlInput.value) {
    driveFolderUrlInput.value = savedFolderUrl;
  }

  syncSettingsNotices();
}

function initCreatorApp() {
  try {
    initSettings();

    if (isAppInitialized) return;

    const fileInput = el("fileInput");
    const dropZone = el("dropZone");
    const inputPanel = document.querySelector(".input-panel");
    const clipPasteBtn = el("clipPasteBtn");
    const pasteCatcherBox = el("pasteCatcherBox");
    const clearImgBtn = el("clearImgBtn");
    const apiKeyInput = el("apiKeyInput");
    const toggleApiVisibilityBtn = el("toggleApiVisibilityBtn");
    const driveFolderUrlInput = el("driveFolderUrlInput");
    const generateBtn = el("generateBtn");
    const cancelGenerateBtn = el("cancelGenerateBtn");
    const exportBtn = el("exportBtn");
    const manualCopyBtn = el("manualCopyBtn");

    if (!fileInput || !dropZone || !pasteCatcherBox) {
      return;
    }

    isAppInitialized = true;

    // 1) APIキー・フォルダURL入力設定
    if (apiKeyInput) {
      apiKeyInput.addEventListener("input", handleApiKeyInput);
      apiKeyInput.addEventListener("change", handleApiKeyInput);
      apiKeyInput.addEventListener("blur", syncSettingsNotices);
    }
    if (toggleApiVisibilityBtn) {
      toggleApiVisibilityBtn.addEventListener("click", handleToggleApiVis);
    }
    if (driveFolderUrlInput) {
      driveFolderUrlInput.addEventListener("input", handleFolderUrlInput);
      driveFolderUrlInput.addEventListener("change", handleFolderUrlInput);
      driveFolderUrlInput.addEventListener("blur", syncSettingsNotices);
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

    // 4) contenteditable ペースト受信ボックス（直接貼付 + DOM監視フォールバック）
    pasteCatcherBox.addEventListener("click", function (e) {
      e.stopPropagation();
      focusPasteBox("⌨️ ここにカーソルが合いました！そのまま Ctrl + V（または右クリック→貼り付け）してください", "info");
    });
    pasteCatcherBox.addEventListener("focus", function () {
      pasteCatcherBox.classList.add("paste-ready");
    });
    pasteCatcherBox.addEventListener("blur", function () {
      pasteCatcherBox.classList.remove("paste-ready");
    });
    pasteCatcherBox.addEventListener("paste", function (e) {
      handlePasteEvent(e);
      setTimeout(handlePasteBoxDomFallback, 50);
    });
    pasteCatcherBox.addEventListener("input", function () {
      handlePasteBoxDomFallback();
    });

    if (typeof MutationObserver === "function") {
      try {
        const observer = new MutationObserver(function () {
          handlePasteBoxDomFallback();
        });
        observer.observe(pasteCatcherBox, { childList: true, subtree: true });
      } catch (e) {}
    }

    // 5) 画面全体の Ctrl + V もキャッチ
    document.addEventListener("paste", handlePasteEvent);
    window.addEventListener("paste", handlePasteEvent);

    // 6) ドラッグ＆ドロップ（ページ遷移抑止 + ドロップゾーン/左パネル全体受付）
    ["dragover", "drop"].forEach(function (evt) {
      window.addEventListener(evt, function (e) {
        e.preventDefault();
      }, false);
      document.addEventListener(evt, function (e) {
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
    if (inputPanel) {
      inputPanel.addEventListener("dragover", function (e) {
        e.preventDefault();
      });
      inputPanel.addEventListener("drop", handleDropFile);
    }

    // 7) 画像削除・AI生成・エクスポート・手動コピー
    if (clearImgBtn) {
      clearImgBtn.addEventListener("click", handleClearImage);
    }
    if (generateBtn) {
      generateBtn.addEventListener("click", handleGenerateClick);
    }
    if (cancelGenerateBtn) {
      cancelGenerateBtn.addEventListener("click", handleCancelGenerateClick);
    }
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExportClick);
    }
    if (manualCopyBtn) {
      manualCopyBtn.addEventListener("click", handleManualCopyClick);
    }

    setVersionBadge("教員用ツール v4.3 (🟢 動作準備OK)", "badge-ready");
    setPasteStatus("🟢 動作準備OK (v4.3) — ファイル選択 / D&D / Ctrl+V すべて対応", "ready");

    // ブラウザの遅延自動入力（オートフィル）対策
    [300, 1000, 2500].forEach(function (delay) {
      setTimeout(syncSettingsNotices, delay);
    });

    // UI起動完了後に数式・画像変換ライブラリを非同期読み込み
    setTimeout(loadExternalAssets, 50);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("Creator init error:", err);
    setVersionBadge("教員用ツール v4.3 (🔴 起動エラー: " + msg + ")", "badge-error");
    setPasteStatus("🔴 起動エラー: " + msg, "error");
  }
}

window.addEventListener("error", function (e) {
  if (!isAppInitialized) {
    const msg = (e && e.message) ? e.message : "不明なエラー";
    setVersionBadge("教員用ツール v4.3 (🔴 エラー: " + msg + ")", "badge-error");
    setPasteStatus("🔴 エラー: " + msg, "error");
  }
});

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initCreatorApp);
} else {
  initCreatorApp();
}
window.addEventListener("load", initCreatorApp);
setTimeout(initCreatorApp, 100);

// ==========================================
// 設定入力ハンドラ
// ==========================================
function handleApiKeyInput() {
  const apiKeyInput = el("apiKeyInput");
  if (!apiKeyInput) return;

  const key = apiKeyInput.value.trim();
  if (key) {
    safeStorage.set(STORAGE_KEY_API, key);
  } else {
    safeStorage.remove(STORAGE_KEY_API);
  }
  syncSettingsNotices();
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
  if (!driveFolderUrlInput) return;

  const url = driveFolderUrlInput.value.trim();
  if (url) {
    safeStorage.set(STORAGE_KEY_FOLDER, url);
  } else {
    safeStorage.remove(STORAGE_KEY_FOLDER);
  }
  syncSettingsNotices();
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
    if (e && e.target && e.target.result) {
      setSourceImageDataUrl(e.target.result);
    }
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
function handlePasteButtonClick(e) {
  if (e) e.stopPropagation();

  if (navigator.clipboard && typeof navigator.clipboard.read === "function") {
    navigator.clipboard.read().then(function (clipboardItems) {
      for (let i = 0; i < clipboardItems.length; i++) {
        const item = clipboardItems[i];
        const imageType = item.types.find(function (t) { return t.startsWith("image/"); });
        if (imageType) {
          item.getType(imageType).then(function (blob) {
            if (blob) handleImageFile(blob);
          });
          return;
        }
      }
      focusPasteBox("⚠️ クリップボードに画像が見つかりません。画面切り取り（Win+Shift+S 等）で画像をコピー後、ここで Ctrl + V してください。", "warn");
    }).catch(function () {
      // GAS iframe では Permissions-Policy で clipboard.read() がブロックされるのが正常動作
      focusPasteBox("⌨️ ここにカーソルが合いました！そのままキーボードの「Ctrl + V」を押してください！（右クリック→貼り付けも可）", "info");
    });
    return;
  }

  focusPasteBox("⌨️ ここにカーソルが合いました！そのままキーボードの「Ctrl + V」を押してください！（右クリック→貼り付けも可）", "info");
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

// contenteditable ボックス内に直接画像要素が挿入された場合のフォールバック + 非画像テキスト掃除
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
    if (src.startsWith("blob:") || src.startsWith("http://") || src.startsWith("https://")) {
      fetch(src)
        .then(function (r) { return r.blob(); })
        .then(function (blob) { handleImageFile(blob); })
        .catch(function () {
          setPasteStatus("⚠️ 画像データの取得に失敗しました。スクショ（Win+Shift+S）または「📁 ファイルを選択」をお試しください。", "warn");
        });
      return;
    }
    setPasteStatus("⚠️ 貼り付けた画像形式を読み込めませんでした。スクショ（Win+Shift+S）または「📁 ファイルを選択」をお試しください。", "warn");
    return;
  }

  if (box.innerHTML !== "") {
    const hadText = (box.textContent || "").trim().length > 0;
    box.innerHTML = "";
    if (hadText) {
      setPasteStatus("⚠️ 文字ではなく「画像（スクショ）」をコピーした状態で Ctrl + V してください。", "warn");
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
// 3. Gemini API による解析・改題・生成（タイムアウト + 画像最適化 + GASサーバー中継対応）
// ==========================================
function stopLoadingTimer() {
  if (loadingTimerId !== null) {
    clearInterval(loadingTimerId);
    loadingTimerId = null;
  }
}

function startLoadingTimer() {
  stopLoadingTimer();
  loadingStartTime = Date.now();
  const elapsedEl = el("loadingElapsedText");
  if (elapsedEl) elapsedEl.textContent = "経過時間: 0秒";
  loadingTimerId = setInterval(function () {
    const sec = Math.floor((Date.now() - loadingStartTime) / 1000);
    const target = el("loadingElapsedText");
    if (target) target.textContent = "経過時間: " + sec + "秒";
  }, 1000);
}

function hideGenerateError() {
  const errBox = el("generateErrorBox");
  if (errBox) {
    errBox.innerHTML = "";
    errBox.classList.add("hidden");
  }
}

function showGenerateError(detailMsg, hintMsg) {
  const errBox = el("generateErrorBox");
  if (!errBox) {
    alert(detailMsg);
    return;
  }
  errBox.innerHTML = "";

  const titleEl = document.createElement("div");
  titleEl.className = "generate-error-title";
  titleEl.textContent = "⚠️ AI生成に失敗しました";
  errBox.appendChild(titleEl);

  const detailEl = document.createElement("div");
  detailEl.className = "generate-error-detail";
  detailEl.textContent = detailMsg;
  errBox.appendChild(detailEl);

  if (hintMsg) {
    const hintEl = document.createElement("div");
    hintEl.className = "generate-error-hint";
    hintEl.textContent = hintMsg;
    errBox.appendChild(hintEl);
  }

  errBox.classList.remove("hidden");
}

function handleCancelGenerateClick() {
  activeGenerateToken++;
  if (activeAbortController) {
    try { activeAbortController.abort(); } catch (e) {}
    activeAbortController = null;
  }
  stopLoadingTimer();
  const loadingBox = el("loadingBox");
  const placeholderBox = el("placeholderBox");
  const generateBtn = el("generateBtn");
  if (loadingBox) loadingBox.classList.add("hidden");
  if (placeholderBox) placeholderBox.classList.remove("hidden");
  if (generateBtn) generateBtn.disabled = false;
  checkReadyToGenerate();
}

function optimizeImageForGemini(dataUrl) {
  if (!dataUrl || typeof Image !== "function") {
    return Promise.resolve(dataUrl);
  }
  return new Promise(function (resolve) {
    let settled = false;
    const done = function (resultUrl) {
      if (settled) return;
      settled = true;
      resolve(resultUrl || dataUrl);
    };

    const guardTimer = setTimeout(function () { done(dataUrl); }, 2500);

    try {
      const img = new Image();
      img.onload = function () {
        clearTimeout(guardTimer);
        try {
          const w = img.naturalWidth || img.width || 0;
          const h = img.naturalHeight || img.height || 0;
          const maxDim = 1600;
          const needsResize = (w > maxDim || h > maxDim);
          const isHuge = dataUrl.length > 900000;

          if (!needsResize && !isHuge) {
            done(dataUrl);
            return;
          }

          let targetW = w || 1200;
          let targetH = h || 900;
          if (needsResize) {
            const scale = Math.min(maxDim / w, maxDim / h);
            targetW = Math.max(1, Math.round(w * scale));
            targetH = Math.max(1, Math.round(h * scale));
          }

          const canvas = document.createElement("canvas");
          canvas.width = targetW;
          canvas.height = targetH;
          const ctx = canvas.getContext("2d");
          if (!ctx) {
            done(dataUrl);
            return;
          }
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(0, 0, targetW, targetH);
          ctx.drawImage(img, 0, 0, targetW, targetH);
          const compressed = canvas.toDataURL("image/jpeg", 0.9);
          if (compressed && compressed.startsWith("data:image/") && compressed.length < dataUrl.length) {
            done(compressed);
          } else {
            done(dataUrl);
          }
        } catch (e) {
          done(dataUrl);
        }
      };
      img.onerror = function () {
        clearTimeout(guardTimer);
        done(dataUrl);
      };
      img.src = dataUrl;
    } catch (e) {
      clearTimeout(guardTimer);
      done(dataUrl);
    }
  });
}

function fetchDirect(url, options) {
  let controller = null;
  if (typeof AbortController === "function") {
    try { controller = new AbortController(); } catch (e) {}
  }
  activeAbortController = controller;

  const fetchOpts = Object.assign({}, options);
  if (controller && controller.signal) {
    fetchOpts.signal = controller.signal;
  }

  return fetch(url, fetchOpts).catch(function (err) {
    const wrapped = err instanceof Error ? err : new Error(String(err));
    wrapped.isNetworkError = true;
    throw wrapped;
  });
}

function extractGenerateModels(data) {
  if (!data || !Array.isArray(data.models)) return [];
  const list = [];
  data.models.forEach(function (m) {
    if (m && m.name && Array.isArray(m.supportedGenerationMethods)) {
      if (m.supportedGenerationMethods.indexOf("generateContent") !== -1) {
        let name = m.name;
        if (name.indexOf("models/") === 0) name = name.substring(7);
        list.push(name);
      }
    }
  });
  const excluded = ["omni", "embedding", "aqa", "realtime", "live", "image", "tts"];
  const filtered = list.filter(function (name) {
    const lower = name.toLowerCase();
    for (let i = 0; i < excluded.length; i++) {
      if (lower.indexOf(excluded[i]) !== -1) return false;
    }
    return true;
  });

  const getScore = function (name) {
    if (name.indexOf("gemini-3.8-flash") === 0) return 120;
    if (name.indexOf("gemini-3.5-flash") === 0) return 110;
    if (name.indexOf("gemini-3-flash") === 0) return 105;
    if (name.indexOf("gemini-2.5-flash") === 0) return 100;
    if (name.indexOf("gemini-2.0-flash") === 0) return 90;
    if (name.indexOf("flash") !== -1) return 80;
    if (name.indexOf("gemini-3.8-pro") === 0) return 70;
    if (name.indexOf("gemini-3.5-pro") === 0) return 60;
    if (name.indexOf("gemini-2.5-pro") === 0) return 50;
    if (name.indexOf("pro") !== -1) return 40;
    return 10;
  };

  filtered.sort(function (a, b) {
    const scoreDiff = getScore(b) - getScore(a);
    if (scoreDiff !== 0) return scoreDiff;
    return b.localeCompare(a);
  });
  return filtered;
}

function fetchAvailableModels(apiKey) {
  const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(apiKey);
  return fetchDirect(url, { method: "GET" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      const models = extractGenerateModels(data);
      if (models.length > 0) return models;
      throw new Error("有効なモデルが見つかりませんでした");
    })
    .catch(function () {
      if (typeof google !== "undefined" && google.script && google.script.run) {
        return new Promise(function (resolve) {
          google.script.run
            .withSuccessHandler(function (models) {
              if (Array.isArray(models) && models.length > 0) {
                resolve(models);
              } else {
                resolve([]);
              }
            })
            .withFailureHandler(function () {
              resolve([]);
            })
            .listModelsServer(apiKey);
        });
      }
      return [];
    });
}

function callGeminiViaGasServer(apiKey, requestBody, token, preferredModel) {
  if (typeof google === "undefined" || !google.script || !google.script.run) {
    return Promise.reject(new Error("GASサーバー環境ではありません"));
  }
  return new Promise(function (resolve, reject) {
    try {
      google.script.run
        .withSuccessHandler(function (res) {
          if (token !== activeGenerateToken) {
            reject(new Error("CANCELLED"));
            return;
          }
          resolve(res);
        })
        .withFailureHandler(function (err) {
          const msg = (err && err.message) ? err.message : String(err);
          const wrapped = new Error(msg);
          if (msg.indexOf("generateQuizServer") !== -1 || msg.indexOf("is not a function") !== -1) {
            wrapped.isMissingServerFn = true;
          }
          reject(wrapped);
        })
        .generateQuizServer(apiKey, requestBody, preferredModel || "");
    } catch (err) {
      reject(err);
    }
  });
}

function callGeminiWithFallback(modelCandidates, idx, apiKey, requestBody, lastErrorMsg, token, statusEl, attemptedErrors) {
  if (token !== activeGenerateToken) {
    return Promise.reject(new Error("CANCELLED"));
  }
  if (!attemptedErrors) attemptedErrors = [];

  if (idx >= modelCandidates.length) {
    let summary = lastErrorMsg || "利用可能なAIモデルが見つかりませんでした。";
    if (attemptedErrors.length > 0) {
      summary = summary + "（試行したモデル: " + attemptedErrors.join("; ") + "）";
    }
    return Promise.reject(new Error("Gemini API エラー: " + summary));
  }

  const model = modelCandidates[idx];
  const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);
  if (statusEl) {
    statusEl.textContent = "AI (" + model + ") が問題を生成中...（" + (idx + 1) + "/" + modelCandidates.length + "）";
  }

  return fetchDirect(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  }).then(function (res) {
    if (token !== activeGenerateToken) {
      throw new Error("CANCELLED");
    }
    if (res.ok) {
      return res.json();
    }
    return res.json().catch(function () { return {}; }).then(function (errJson) {
      const apiMsg = (errJson && errJson.error && errJson.error.message) ? errJson.error.message : (res.statusText || "Error");
      const statusMsg = "HTTP " + res.status + ": " + apiMsg;
      // 400(不正リクエスト), 401(キー無効), 403(権限なし)のみ即時中断。429(クォータ制限)は次のモデルを試す
      if (res.status === 400 || res.status === 401 || res.status === 403) {
        const fatal = new Error("Gemini API エラー (" + statusMsg + ")");
        fatal.httpStatus = res.status;
        fatal.isFatalApiError = true;
        throw fatal;
      }
      attemptedErrors.push(model + " => " + statusMsg);
      return callGeminiWithFallback(modelCandidates, idx + 1, apiKey, requestBody, statusMsg, token, statusEl, attemptedErrors);
    });
  }).catch(function (err) {
    if (token !== activeGenerateToken || (err && err.message === "CANCELLED")) {
      throw new Error("CANCELLED");
    }
    if (err && err.isFatalApiError) {
      throw err;
    }
    if (err && err.isNetworkError) {
      if (typeof google !== "undefined" && google.script && google.script.run) {
        if (statusEl) {
          statusEl.textContent = "直接通信に失敗したため、GASサーバー経由でAI (" + model + ") へ再接続しています...";
        }
        return callGeminiViaGasServer(apiKey, requestBody, token, model).catch(function (gasErr) {
          if (gasErr && gasErr.isMissingServerFn) {
            const combined = new Error("ブラウザからの直接通信に失敗しました（学校ネットワーク等で遮断されている可能性があります）");
            combined.needsGasCodeUpdate = true;
            throw combined;
          }
          const msg = (gasErr && gasErr.message) ? gasErr.message : String(gasErr);
          attemptedErrors.push(model + " (GAS経由) => " + msg);
          return callGeminiWithFallback(modelCandidates, idx + 1, apiKey, requestBody, msg, token, statusEl, attemptedErrors);
        });
      }
      throw err;
    }
    const msg = err && err.message ? err.message : String(err);
    attemptedErrors.push(model + " => " + msg);
    return callGeminiWithFallback(modelCandidates, idx + 1, apiKey, requestBody, msg, token, statusEl, attemptedErrors);
  });
}

function handleGenerateClick() {
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

  const myToken = ++activeGenerateToken;
  hideGenerateError();

  try {
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
    if (loadingStatusText) loadingStatusText.textContent = "画像を最適化してAIへ送信準備をしています...";
    startLoadingTimer();

    optimizeImageForGemini(currentImageBase64)
      .then(function (optimizedDataUrl) {
        if (myToken !== activeGenerateToken) {
          throw new Error("CANCELLED");
        }

        const commaIdx = optimizedDataUrl.indexOf(",");
        const headerPart = commaIdx !== -1 ? optimizedDataUrl.slice(0, commaIdx) : "data:image/png;base64";
        const mimeMatch = headerPart.match(/^data:([^;]+)/i);
        const mimeType = (mimeMatch && mimeMatch[1]) ? mimeMatch[1] : "image/png";
        const base64Data = commaIdx !== -1 ? optimizedDataUrl.slice(commaIdx + 1) : optimizedDataUrl;

        const systemPrompt = [
          "あなたは日本の高校数学の優秀な教員であり教材作成のスペシャリストです。",
          "添付された数学の問題画像を読み取り、指定されたルールに従って小テスト用データをJSON形式で出力してください。",
          "",
          "【設定条件】",
          "- 改題モード: " + (remakeMode === "exact" ? "元画像の問題をできるだけ忠実に再現（マーク化/選択肢化のみ行う）" : "元画像の問題を改題（数値を変更した類題を作成）"),
          "- 出題形式: " + questionType + "（マーク式または選択式）",
          customPrompt ? ("- 追加指示: " + customPrompt) : "",
          "",
          "【超重要：LaTeXのバックスラッシュ（二重エスケープ厳守）】",
          "JSONフォーマットとして安全にパースできるよう、LaTeX記法のバックスラッシュ \\ は必ず二重（\\\\frac, \\\\fbox, \\\\triangle 等）で出力してください。単一の \\frac だと \\f がフォームフィード制御文字に化けて数式が破損します。",
          "",
          "【重要：横長レイアウト＆数式のインライン配置ルール（超縦長化防止）】",
          "1. 小テスト画面で美しく収まるよう、教科書や共通テストと同じ「横長（幅広でコンパクト）な問題用紙風」に作成してください。",
          "2. 文中のアルファベット（x, y, A, B, C 等）や数式、座標、マーク枠（\\fbox{ ア }）は、絶対に独立行（$ ... $）にせず、必ず【インライン数式 $ ... $】を使って自然な日本語文の中にそのまま埋め込んでください。",
          "   - 【良い例】: 2つの放物線 $y = x^2, y = \\frac{1}{4}x^2$ と、点 $A(3, 0)$ を考える。点 $A$ を通り $y$ 軸に平行な直線と放物線 $y = x^2$ との交点を $B$ とし、点 $C$ の座標は $(\\fbox{ ア }, \\fbox{ イ })$ である。",
          "   - 【悪い例（厳禁）】: 「点\\n$A$\\nを通り\\n$y$\\n軸...」のように単語ごとに改行したり、一文字ごとに $ で中央揃えにすることは絶対に禁止です。",
          "3. 文章は句点（。）まで1行として自然に流れるようにし、単語やフレーズの途中での不自然な改行（\\n）は一切入れないでください。問題文全体として2〜4行程度の横長の美しい文章にまとめてください。",
          "4. マーク式の場合（★大学入学共通テストの厳格なマーク枠ルールに準拠してください★）:",
          "   - 【1枠＝1文字の厳格な原則】: 1つのマーク枠 \\fbox{ カタカナ } には、必ず【1桁の数字（0〜9）】または【符号のマイナス（-）】が【1文字だけ】入ります。1つの枠に2桁以上の数字が入ることは絶対にありません。",
          "   - 【2桁以上の数字の例】: 答えが「15」の場合、必ず2つの枠を使って \\fbox{ ア }\\fbox{ イ } とし、正解は \"1, 5\" としてください。",
          "   - 【負の数（マイナス）の例】: 答えが「-3」の場合、マイナス符号にも必ず独立した1つの枠を使って \\fbox{ ア }\\fbox{ イ } とし、正解は \"-, 3\" としてください。答えが「-15」なら \\fbox{ ア }\\fbox{ イ }\\fbox{ ウ } で正解は \"-, 1, 5\" です。",
          "   - 【分数の例】: 答えが「15/4」の場合、必ず \\frac{\\fbox{ ア }\\fbox{ イ }}{\\fbox{ ウ }} とし、正解は \"1, 5, 4\"、slotsOrChoices は [\"ア\", \"イ\", \"ウ\"] としてください。",
          "   - 【分数が負の数の例】: 答えが「-7/2」の場合、\\frac{\\fbox{ ア }\\fbox{ イ }}{\\fbox{ ウ }} で正解は \"-, 7, 2\" としてください。",
          "   - 【カタカナ文字の連続順】: マーク枠は「ア, イ, ウ, エ, オ, カ, キ, ク, ケ, コ...」の50音順で順番に漏れなく割り当ててください。",
          "   - slotsOrChoices には、問題文で使用したマーク枠を左から順に配列（例: [\"ア\", \"イ\", \"ウ\"]）で格納してください。",
          "   - correctAnswer には、各枠に入る1文字（数字または - ）をカンマ区切りの文字列（例: \"1, 5, 4\" や \"-, 3\"）で格納してください。",
          "5. 選択式の場合:",
          "   - slotsOrChoices には [\"選択肢Aのテキスト\", \"選択肢Bのテキスト\", \"選択肢Cのテキスト\", \"選択肢Dのテキスト\"] を入れてください（2〜4択）。",
          "   - correctAnswer には正解の文字（\"A\", \"B\", \"C\", \"D\" のいずれか）を入れてください。",
          "6. explanationMarkdown には、生徒が読んですぐ理解できる丁寧な途中式とポイント解説を LaTeX を交えて記述してください。",
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
          "}",
        ].join("\n");

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

        if (loadingStatusText) {
          loadingStatusText.textContent = "利用可能なAIモデルを検索・適合中...";
        }
        return fetchAvailableModels(apiKey).then(function (discovered) {
          if (myToken !== activeGenerateToken) throw new Error("CANCELLED");
          const staticFallbacks = [
            "gemini-2.5-flash",
            "gemini-3.8-flash",
            "gemini-2.5-pro",
            "gemini-2.0-flash",
            "gemini-1.5-flash-latest",
            "gemini-1.5-pro"
          ];
          const finalCandidates = [];
          if (Array.isArray(discovered) && discovered.length > 0) {
            for (let d = 0; d < discovered.length; d++) {
              if (finalCandidates.indexOf(discovered[d]) === -1) {
                finalCandidates.push(discovered[d]);
              }
            }
          }
          for (let s = 0; s < staticFallbacks.length; s++) {
            if (finalCandidates.indexOf(staticFallbacks[s]) === -1) {
              finalCandidates.push(staticFallbacks[s]);
            }
          }
          return callGeminiWithFallback(finalCandidates, 0, apiKey, requestBody, "", myToken, loadingStatusText, []);
        });
      })
      .then(function (responseData) {
        if (myToken !== activeGenerateToken) {
          throw new Error("CANCELLED");
        }
        const candidates = responseData && responseData.candidates;
        const firstCandidate = (candidates && candidates.length > 0) ? candidates[0] : null;
        const parts = (firstCandidate && firstCandidate.content && firstCandidate.content.parts) ? firstCandidate.content.parts : null;
        const candidateText = (parts && parts.length > 0) ? parts[0].text : null;

        if (!candidateText) {
          throw new Error("AIから応答が得られませんでした（APIキーや入力画像を確認してください）。");
        }

        let parsedData;
        try {
          const fence = String.fromCharCode(96, 96, 96);
          let cleanJson = candidateText.trim();
          if (cleanJson.toLowerCase().indexOf(fence + "json") === 0) {
            cleanJson = cleanJson.slice(fence.length + 4).trim();
          } else if (cleanJson.indexOf(fence) === 0) {
            cleanJson = cleanJson.slice(fence.length).trim();
          }
          if (cleanJson.endsWith(fence)) {
            cleanJson = cleanJson.slice(0, -fence.length).trim();
          }
          // LaTeXの単一バックスラッシュによるエスケープ破損 (\frac -> \f フォームフィード等) を自動修復
          cleanJson = repairJsonLatexEscapes(cleanJson);
          parsedData = JSON.parse(cleanJson);
        } catch (e) {
          console.error("JSON parse error:", candidateText);
          throw new Error("AIの応答をJSONとして解釈できませんでした。もう一度お試しください。");
        }

        currentGeneratedData = parsedData;
        renderPreview(parsedData);

        stopLoadingTimer();
        if (loadingBox) loadingBox.classList.add("hidden");
        if (resultArea) resultArea.classList.remove("hidden");
      })
      .catch(function (error) {
        stopLoadingTimer();
        activeAbortController = null;
        if (myToken !== activeGenerateToken || (error && error.message === "CANCELLED")) {
          return;
        }
        console.error("生成エラー:", error);
        const errMsg = (error && error.message) ? error.message : String(error);
        let hintMsg = "Gemini APIキーやインターネット接続を確認して、もう一度「問題と解説をAI生成する」を押してください。";
        if (error && error.needsGasCodeUpdate) {
          hintMsg = "対処法: GAS側の「コード.gs」を最新の gas_code.gs の内容に更新して新バージョンでデプロイすると、学校ネットワーク等でブラウザ直通が遮断される場合でもGASサーバー経由で自動生成できるようになります。";
        } else if (error && (error.httpStatus === 400 || error.httpStatus === 401 || error.httpStatus === 403)) {
          hintMsg = "対処法: 左下の「Gemini APIキー」が正しく貼り付けられているか（👁️ボタンで中身が Google AI Studio のキーになっているか）確認してください。";
        } else if (error && error.httpStatus === 429) {
          hintMsg = "対処法: 無料枠の連続リクエスト上限に達しました。1分ほど待ってから再試行してください。";
        }
        if (loadingBox) loadingBox.classList.add("hidden");
        if (placeholderBox) placeholderBox.classList.remove("hidden");
        showGenerateError(errMsg, hintMsg);
      })
      .then(function () {
        activeAbortController = null;
        if (myToken === activeGenerateToken) {
          if (generateBtn) generateBtn.disabled = false;
          checkReadyToGenerate();
        }
      });
  } catch (syncErr) {
    stopLoadingTimer();
    const syncMsg = (syncErr && syncErr.message) ? syncErr.message : String(syncErr);
    console.error("Generate sync error:", syncErr);
    if (loadingBox) loadingBox.classList.add("hidden");
    if (placeholderBox) placeholderBox.classList.remove("hidden");
    if (generateBtn) generateBtn.disabled = false;
    checkReadyToGenerate();
    showGenerateError("送信処理の開始時にエラーが発生しました: " + syncMsg, "");
  }
}

// ==========================================
// LaTeX と JSON 特殊エスケープ (\f, \b, \t 等) の自動修復ユーティリティ
// ==========================================
function repairJsonLatexEscapes(rawJson) {
  if (!rawJson) return "";
  // 有効なJSONエスケープ以外の \word (特に \frac, \fbox, \begin, \times 等) を \\word に自動修復
  return rawJson.replace(/(^|[^\\])\\([a-zA-Z]+)/g, function (match, prefix, cmd) {
    return prefix + "\\\\" + cmd;
  });
}

function repairParsedLatex(str) {
  if (!str) return "";
  let s = String(str);
  // 万が一 JSON.parse で \f が 0x0C (Form Feed)、\b が 0x08 に解釈されてしまっていた場合の救済
  s = s.replace(/\x0c([a-zA-Z]+)/g, function (match, word) {
    return "\\f" + word;
  });
  s = s.replace(/\x08([a-zA-Z]+)/g, function (match, word) {
    return "\\b" + word;
  });
  return s;
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


// ==========================================
// LaTeX 未ラップ数式（\triangle, \frac, \fbox 等）の自動救済・$ラップ処理
// ==========================================
function autoWrapLatexFormulas(text) {
  if (!text) return "";

  // 1. まずテキストを既存の $...$ 区間で分割（既存の数式デリミタを安全に保護）
  const parts = text.split(/(\$\$?[^\$]*\$\$?)/g);

  for (let p = 0; p < parts.length; p++) {
    // 奇数インデックスは既に $...$ で囲まれているためスキップ
    if (p % 2 === 1) continue;

    const segment = parts[p];
    if (!segment || segment.indexOf("\\") === -1) continue;

    let result = "";
    let i = 0;
    const len = segment.length;

    while (i < len) {
      if (segment[i] === "\\") {
        // バックスラッシュ直前の負号や開きカッコを取り込むか判定（例: "- \frac", "(- \frac", "( \frac"）
        let prefix = "";
        if (result.length > 0) {
          const matchPrefix = result.match(/([(\[]?\s*[-−]?\s*)$/);
          if (matchPrefix && matchPrefix[1] && matchPrefix[1].trim()) {
            prefix = matchPrefix[1];
            result = result.substring(0, result.length - prefix.length);
          }
        }

        // 数式の範囲を波括弧深さ(depth)を追跡してスキャン
        let depth = 0;
        let j = i;

        while (j < len) {
          const ch = segment[j];

          if (ch === "{" || ch === "[") {
            depth++;
            j++;
            continue;
          } else if (ch === "}" || ch === "]") {
            if (depth > 0) depth--;
            j++;
            continue;
          }

          // depth > 0 の間は波括弧の内側なのでそのまま進める
          if (depth > 0) {
            j++;
            continue;
          }

          // depth === 0 のときの境界判定
          if (ch === " " || ch === "\t") {
            let nextNonSpace = j + 1;
            while (nextNonSpace < len && (segment[nextNonSpace] === " " || segment[nextNonSpace] === "\t")) {
              nextNonSpace++;
            }
            // 空白の後に次のLaTeXコマンド・括弧・演算子が続く場合: \frac{1}{2} + \frac{1}{3} や \fbox{ア} \fbox{イ}
            if (nextNonSpace < len && (segment[nextNonSpace] === "{" || segment[nextNonSpace] === "\\" || segment[nextNonSpace] === "=" || segment[nextNonSpace] === "+" || segment[nextNonSpace] === "-" || segment[nextNonSpace] === "−")) {
              j = nextNonSpace;
              continue;
            }
            // 空白の後に英数字が続く場合（例: \triangle OAB や \angle ABC）
            if (nextNonSpace < len && /^[A-Za-z0-9]/.test(segment[nextNonSpace])) {
              j = nextNonSpace;
              continue;
            }
            // それ以外の空白は数式の区切りとみなす
            break;
          }

          // バックスラッシュはコマンド継続
          if (ch === "\\") {
            j++;
            continue;
          }

          // 数式として有効なASCII英数字・標準演算子
          if (/[A-Za-z0-9+\-*\/=^_,.<>|:;!~]/.test(ch)) {
            j++;
            continue;
          }

          // 開きカッコを取り込んでいた場合に対応する閉じカッコを取り込む
          if ((ch === ")" && prefix.indexOf("(") !== -1) || (ch === "]" && prefix.indexOf("[") !== -1)) {
            j++;
            break;
          }

          // 日本語文字（漢字、ひらがな、全角記号等）や句読点（。、など）が来たら数式終了！
          break;
        }

        let mathFormula = prefix + segment.substring(i, j);
        mathFormula = mathFormula.trim();

        // 文末の句読点（。や、など）が末尾に残っていればトリム
        let trailingPunct = "";
        const punctMatch = mathFormula.match(/([,.:;]+)$/);
        if (punctMatch && depth === 0) {
          trailingPunct = punctMatch[1];
          mathFormula = mathFormula.slice(0, -trailingPunct.length).trim();
        }

        result += " $" + mathFormula + "$ " + trailingPunct;
        i = j;
      } else {
        result += segment[i];
        i++;
      }
    }

    parts[p] = result;
  }

  return parts.join("");
}

function formatMarkdownMath(text) {
  if (!text) return "";
  let s = repairParsedLatex(String(text));

  // 1. \[ ... \] を $ ... $ に変換（Geminiが多用するディスプレイ数式をインライン化）
  s = s.replace(/\\\[([\s\S]*?)\\\]/g, function (match, inner) {
    return " $" + inner.trim() + "$ ";
  });

  // 2. $ ... $ を $ ... $ に変換（インライン化）
  s = s.replace(/\$\$([\s\S]*?)\$\$/g, function (match, inner) {
    return " $" + inner.trim() + "$ ";
  });

  // 3. \( ... \) を $ ... $ に統一
  s = s.replace(/\\\(([\s\S]*?)\\\)/g, function (match, inner) {
    return " $" + inner.trim() + "$ ";
  });

  // 4. $ ... $ で囲まれていない裸の LaTeX コマンド（\\triangle, \\frac, \\fbox 等）を自動検出して $ ... $ で包む
  s = autoWrapLatexFormulas(s);

  // 4. 文中の単独改行を結合（句点やコロン、箇条書き記号以外での改行を自然に横長に接続）
  const lines = s.split(/\r?\n/);
  const merged = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) {
      merged.push("");
      continue;
    }
    const isBulletOrHeading = /^([-*・]|\d+\.|\#+)/.test(line);

    if (merged.length > 0 && merged[merged.length - 1] !== "" && !isBulletOrHeading) {
      const prev = merged[merged.length - 1];
      if (!/[。．!！?？:：]$/.test(prev)) {
        merged[merged.length - 1] = prev + " " + line;
        continue;
      }
    }
    merged.push(line);
  }

  const br = "<" + "br>";
  const stOpen = "<" + "strong>";
  const stClose = "<" + "/strong>";

  return merged.join("\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\n+/g, br + br)
    .replace(/\n/g, br)
    .replace(/\*\*(.*?)\*\*/g, stOpen + "$1" + stClose);
}

function renderMath(element) {
  if (typeof renderMathInElement === "function") {
    renderMathInElement(element, {
      delimiters: [
        { left: "$", right: "$", display: false },
        { left: "$", right: "$", display: false },
        { left: "\\[", right: "\\]", display: false },
        { left: "\\(", right: "\\)", display: false }
      ],
      throwOnError: false
    });
  }
}

// ==========================================
// 5. ドライブ保存 ＆ スプレッドシート用TSVコピー
// ==========================================
function copyTextSafely(text) {
  if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
    return navigator.clipboard.writeText(text).then(function () {
      return true;
    }).catch(function () {
      return execCommandCopyFallback(text);
    });
  }
  return Promise.resolve(execCommandCopyFallback(text));
}

function execCommandCopyFallback(text) {
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
    return false;
  }
}

function uploadImageToDrive(folderUrl, imageBase64, filename) {
  if (!folderUrl) {
    return Promise.resolve({
      url: "",
      warning: "⚠️ 「画像保存先 Googleドライブ フォルダURL」が未入力のため、画像をPCにダウンロード保存しました（URLを入力すると次回からドライブへ自動保存されます）。"
    });
  }
  if (!folderUrl.includes("drive.google.com")) {
    return Promise.resolve({
      url: "",
      warning: "⚠️ GoogleドライブのフォルダURL形式が正しくないため、画像をPCにダウンロード保存しました（https://drive.google.com/drive/folders/... のURLを指定してください）。"
    });
  }

  const safeFilename = filename || ("quiz_" + Date.now() + ".png");

  if (typeof google !== "undefined" && google.script && google.script.run) {
    return new Promise(function (resolve) {
      google.script.run
        .withSuccessHandler(function (url) {
          resolve({ url: url || "", warning: "" });
        })
        .withFailureHandler(function (err) {
          const errMsg = (err && err.message) ? err.message : String(err);
          resolve({
            url: "",
            warning: "⚠️ Googleドライブ自動保存に失敗しました（" + errMsg + "）。代わりに画像をPCへダウンロード保存しました。"
          });
        })
        .uploadImageServer(folderUrl, imageBase64, safeFilename);
    });
  }

  const uploadPayload = {
    action: "uploadImage",
    folderUrl: folderUrl,
    base64Image: imageBase64,
    filename: safeFilename
  };

  return fetch(DEFAULT_GAS_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    redirect: "follow",
    body: JSON.stringify(uploadPayload)
  }).then(function (uploadRes) {
    if (!uploadRes.ok) {
      throw new Error("HTTP " + uploadRes.status);
    }
    return uploadRes.json();
  }).then(function (resData) {
    if (resData && resData.imageUrl) {
      return { url: resData.imageUrl, warning: "" };
    }
    throw new Error((resData && resData.error) ? resData.error : "URLが返されませんでした");
  }).catch(function (err) {
    const errMsg = (err && err.message) ? err.message : String(err);
    return {
      url: "",
      warning: "⚠️ Googleドライブ自動保存に失敗しました（" + errMsg + "）。代わりに画像をPCへダウンロード保存しました。"
    };
  });
}

function handleExportClick() {
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const resultTitleInput = el("resultTitleInput");
  const choicesInput = el("choicesInput");
  const correctAnswerInput = el("correctAnswerInput");
  const problemCard = el("problemCard");
  const explanationCard = el("explanationCard");
  const copySuccessMessage = el("copySuccessMessage");
  const exportWarningMessage = el("exportWarningMessage");
  const manualCopyBox = el("manualCopyBox");
  const manualCopyTextarea = el("manualCopyTextarea");
  const exportBtn = el("exportBtn");
  const exportBtnText = el("exportBtnText");

  const folderUrl = driveFolderUrlInput ? driveFolderUrlInput.value.trim() : "";
  const title = (resultTitleInput && resultTitleInput.value.trim()) || "小テスト";
  const safeTitle = title.replace(/[\\/:*?"<>|]/g, "_");
  const problemFilename = safeTitle + ".png";
  const explanationFilename = "【解説】" + safeTitle + ".png";

  const type = (currentGeneratedData && currentGeneratedData.type) || "マーク";
  const rawChoices = choicesInput ? choicesInput.value.split(",").map(function (s) { return s.trim(); }).filter(function (s) { return s !== ""; }) : [];
  const correctAnswer = correctAnswerInput ? correctAnswerInput.value.trim() : "";

  if (copySuccessMessage) copySuccessMessage.classList.add("hidden");
  if (exportWarningMessage) {
    exportWarningMessage.textContent = "";
    exportWarningMessage.classList.add("hidden");
  }
  if (manualCopyBox) manualCopyBox.classList.add("hidden");
  if (exportBtn) exportBtn.disabled = true;
  if (exportBtnText) exportBtnText.textContent = "問題と解説の画像を生成中...";

  ensureHtml2Canvas()
    .then(function () {
      // 1. 問題カードを画像化
      return html2canvas(problemCard, {
        scale: 2,
        backgroundColor: "#ffffff"
      });
    })
    .then(function (problemCanvas) {
      const problemImageBase64 = problemCanvas.toDataURL("image/png");

      // 2. 解説カードを画像化
      return html2canvas(explanationCard, {
        scale: 2,
        backgroundColor: "#ffffff"
      }).then(function (explanationCanvas) {
        const explanationImageBase64 = explanationCanvas.toDataURL("image/png");
        return {
          problemBase64: problemImageBase64,
          explanationBase64: explanationImageBase64
        };
      });
    })
    .then(function (images) {
      if (folderUrl && folderUrl.includes("drive.google.com") && exportBtnText) {
        exportBtnText.textContent = "Googleドライブに保存中（問題＆解説）...";
      }

      // 問題画像と解説画像を並列でGoogleドライブに保存
      const p1 = uploadImageToDrive(folderUrl, images.problemBase64, problemFilename);
      const p2 = uploadImageToDrive(folderUrl, images.explanationBase64, explanationFilename);

      return Promise.all([p1, p2]).then(function (results) {
        return {
          images: images,
          problemRes: results[0],
          explanationRes: results[1]
        };
      });
    })
    .then(function (bundle) {
      let finalImageUrl = bundle.problemRes.url;
      const driveWarning = bundle.problemRes.warning || bundle.explanationRes.warning;

      if (!finalImageUrl) {
        finalImageUrl = "（Googleドライブ保存完了後にURLが入ります）";
        downloadBase64Image(bundle.images.problemBase64, problemFilename);
        downloadBase64Image(bundle.images.explanationBase64, explanationFilename);
      }

      if (driveWarning && exportWarningMessage) {
        exportWarningMessage.textContent = driveWarning;
        exportWarningMessage.classList.remove("hidden");
      }

      // スプレッドシート用 C〜M列（11列）TSV行の構築
      const choiceCols = [
        rawChoices[0] || "",
        rawChoices[1] || "",
        rawChoices[2] || "",
        rawChoices[3] || "",
        rawChoices[4] || "",
        rawChoices[5] || ""
      ];

      const sanitizeCell = function (val) {
        return String(val || "").replace(/[\r\n\t]+/g, " ").trim();
      };

      // 正解（L列）がスプレッドシートで「2001, 5, 3」等の日付に自動変換されるのを防ぐため、先頭に ' を付与
      let safeAnswer = sanitizeCell(correctAnswer);
      if (safeAnswer && safeAnswer.indexOf("'") !== 0) {
        safeAnswer = "'" + safeAnswer;
      }

      const tsvRow = [
        sanitizeCell(title),
        (type === "マーク" || type === "マーク式") ? "マーク" : "選択",
        sanitizeCell(finalImageUrl),
        sanitizeCell(choiceCols[0]),
        sanitizeCell(choiceCols[1]),
        sanitizeCell(choiceCols[2]),
        sanitizeCell(choiceCols[3]),
        sanitizeCell(choiceCols[4]),
        sanitizeCell(choiceCols[5]),
        safeAnswer,
        "公開"
      ].join("\t");

      if (manualCopyTextarea) manualCopyTextarea.value = tsvRow;

      return copyTextSafely(tsvRow).then(function (copied) {
        if (copied) {
          if (copySuccessMessage) {
            copySuccessMessage.textContent = "✓ 問題＆解説画像をドライブに保存し、C列貼り付けデータをコピーしました！";
            copySuccessMessage.classList.remove("hidden");
          }
          if (exportBtnText) exportBtnText.textContent = "✓ 保存＆クリップボードにコピー完了！";
        } else {
          if (manualCopyBox) manualCopyBox.classList.remove("hidden");
          if (exportBtnText) exportBtnText.textContent = "ドライブ保存完了！（下のボタンでコピーしてください）";
        }
      });
    })
    .catch(function (err) {
      console.error("Export error:", err);
      const msg = (err && err.message) ? err.message : String(err);
      if (exportWarningMessage) {
        exportWarningMessage.textContent = "保存・コピー処理でエラーが発生しました: " + msg;
        exportWarningMessage.classList.remove("hidden");
      }
      if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存して、C列貼り付けデータをコピー！";
    })
    .finally(function () {
      if (exportBtn) exportBtn.disabled = false;
    });
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
    navigator.clipboard.writeText(ta.value).catch(function () {});
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
