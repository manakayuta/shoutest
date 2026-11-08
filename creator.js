// ========================================================
// 数学小テスト 問題作成スタジオ ロジック v3.2 (creator.js)
// GAS (HtmlService iframe) / ローカル両対応・完全版
// 生徒用画面 (index.html) と同一の純粋ES構文・テンプレートリテラル排除版
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
  setPasteStatus("🟢 動作準備OK (v3.2) — ファイル選択 / D&D / Ctrl+V すべて対応", "ready");
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
    if (exportBtn) {
      exportBtn.addEventListener("click", handleExportClick);
    }
    if (manualCopyBtn) {
      manualCopyBtn.addEventListener("click", handleManualCopyClick);
    }

    setVersionBadge("教員用ツール v3.2 (🟢 動作準備OK)", "badge-ready");
    setPasteStatus("🟢 動作準備OK (v3.2) — ファイル選択 / D&D / Ctrl+V すべて対応", "ready");

    // ブラウザの遅延自動入力（オートフィル）対策
    [300, 1000, 2500].forEach(function (delay) {
      setTimeout(syncSettingsNotices, delay);
    });

    // UI起動完了後に数式・画像変換ライブラリを非同期読み込み
    setTimeout(loadExternalAssets, 50);
  } catch (err) {
    const msg = err && err.message ? err.message : String(err);
    console.error("Creator init error:", err);
    setVersionBadge("教員用ツール v3.2 (🔴 起動エラー: " + msg + ")", "badge-error");
    setPasteStatus("🔴 起動エラー: " + msg, "error");
  }
}

window.addEventListener("error", function (e) {
  if (!isAppInitialized) {
    const msg = (e && e.message) ? e.message : "不明なエラー";
    setVersionBadge("教員用ツール v3.2 (🔴 エラー: " + msg + ")", "badge-error");
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
// 3. Gemini API による解析・改題・生成
// ==========================================
function callGeminiWithFallback(modelCandidates, idx, apiKey, requestBody, lastErrorMsg) {
  if (idx >= modelCandidates.length) {
    return Promise.reject(new Error("Gemini API エラー: " + (lastErrorMsg || "不明なエラー")));
  }
  const model = modelCandidates[idx];
  const apiUrl = "https://generativelanguage.googleapis.com/v1beta/models/" + encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(apiKey);

  return fetch(apiUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(requestBody)
  }).then(function (res) {
    if (res.ok) {
      return res.json();
    }
    return res.json().catch(function () { return {}; }).then(function (errJson) {
      const msg = (errJson && errJson.error && errJson.error.message) ? errJson.error.message : res.statusText;
      return callGeminiWithFallback(modelCandidates, idx + 1, apiKey, requestBody, msg);
    });
  }).catch(function (err) {
    const msg = err && err.message ? err.message : String(err);
    return callGeminiWithFallback(modelCandidates, idx + 1, apiKey, requestBody, msg);
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

  const modelCandidates = ["gemini-3.8-flash", "gemini-1.5-flash", "gemini-2.0-flash"];

  callGeminiWithFallback(modelCandidates, 0, apiKey, requestBody, "")
    .then(function (responseData) {
      const candidates = responseData && responseData.candidates;
      const firstCandidate = (candidates && candidates.length > 0) ? candidates[0] : null;
      const parts = (firstCandidate && firstCandidate.content && firstCandidate.content.parts) ? firstCandidate.content.parts : null;
      const candidateText = (parts && parts.length > 0) ? parts[0].text : null;

      if (!candidateText) {
        throw new Error("AIから応答が得られませんでした。");
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
        parsedData = JSON.parse(cleanJson);
      } catch (e) {
        console.error("JSON parse error:", candidateText);
        throw new Error("AIの応答をJSONとして解釈できませんでした。もう一度お試しください。");
      }

      currentGeneratedData = parsedData;
      renderPreview(parsedData);

      if (loadingBox) loadingBox.classList.add("hidden");
      if (resultArea) resultArea.classList.remove("hidden");
    })
    .catch(function (error) {
      console.error("生成エラー:", error);
      const errMsg = (error && error.message) ? error.message : String(error);
      alert("生成に失敗しました: " + errMsg);
      if (loadingBox) loadingBox.classList.add("hidden");
      if (placeholderBox) placeholderBox.classList.remove("hidden");
    })
    .then(function () {
      if (generateBtn) generateBtn.disabled = false;
      checkReadyToGenerate();
    });
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
  const br = "<" + "br>";
  const stOpen = "<" + "strong>";
  const stClose = "<" + "/strong>";
  return String(text)
    .replace(/\n\n/g, br + br)
    .replace(/\n/g, br)
    .replace(/\*\*(.*?)\*\*/g, stOpen + "$1" + stClose);
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

function uploadProblemImage(folderUrl, problemImageBase64) {
  if (!folderUrl) {
    return Promise.resolve({
      url: "",
      warning: "⚠️ 「画像保存先 Googleドライブ フォルダURL」が未入力のため、問題画像をPCにダウンロード保存しました（URLを入力すると次回からドライブへ自動保存されます）。"
    });
  }
  if (!folderUrl.includes("drive.google.com")) {
    return Promise.resolve({
      url: "",
      warning: "⚠️ GoogleドライブのフォルダURL形式が正しくないため、問題画像をPCにダウンロード保存しました（https://drive.google.com/drive/folders/... のURLを指定してください）。"
    });
  }

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
        .uploadImageServer(folderUrl, problemImageBase64, "quiz_" + Date.now() + ".png");
    });
  }

  const uploadPayload = {
    action: "uploadImage",
    folderUrl: folderUrl,
    base64Image: problemImageBase64,
    filename: "quiz_" + Date.now() + ".png"
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
  const copySuccessMessage = el("copySuccessMessage");
  const exportWarningMessage = el("exportWarningMessage");
  const manualCopyBox = el("manualCopyBox");
  const manualCopyTextarea = el("manualCopyTextarea");
  const exportBtn = el("exportBtn");
  const exportBtnText = el("exportBtnText");

  const folderUrl = driveFolderUrlInput ? driveFolderUrlInput.value.trim() : "";
  const title = (resultTitleInput && resultTitleInput.value.trim()) || "小テスト";
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
  if (exportBtnText) exportBtnText.textContent = "問題画像を生成中...";

  ensureHtml2Canvas()
    .then(function () {
      return html2canvas(problemCard, {
        scale: 2,
        backgroundColor: "#ffffff"
      });
    })
    .then(function (canvas) {
      const problemImageBase64 = canvas.toDataURL("image/png");
      if (folderUrl && folderUrl.includes("drive.google.com") && exportBtnText) {
        exportBtnText.textContent = "Googleドライブに保存中...";
      }
      return uploadProblemImage(folderUrl, problemImageBase64).then(function (res) {
        return { problemImageBase64: problemImageBase64, uploadResult: res };
      });
    })
    .then(function (bundle) {
      let finalImageUrl = bundle.uploadResult.url;
      const driveWarning = bundle.uploadResult.warning;

      if (!finalImageUrl) {
        finalImageUrl = "（Googleドライブ保存完了後にURLが入ります）";
        downloadBase64Image(bundle.problemImageBase64, title + "_問題.png");
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

      const sanitizeCell = function (val) {
        return String(val || "").replace(/[\r\n\t]+/g, " ").trim();
      };

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
        sanitizeCell(correctAnswer),
        "公開"
      ].join("\t");

      if (manualCopyTextarea) manualCopyTextarea.value = tsvRow;

      return copyTextSafely(tsvRow).then(function (copied) {
        if (copied) {
          if (copySuccessMessage) copySuccessMessage.classList.remove("hidden");
          if (exportBtnText) exportBtnText.textContent = "✓ 保存＆クリップボードにコピー完了！";
        } else {
          if (manualCopyBox) manualCopyBox.classList.remove("hidden");
          if (exportBtnText) exportBtnText.textContent = "Googleドライブ保存完了！（下のボタンでコピーしてください）";
        }
      });
    })
    .catch(function (err) {
      console.error("エクスポートエラー:", err);
      const errMsg = (err && err.message) ? err.message : String(err);
      alert("保存・コピー処理中にエラーが発生しました: " + errMsg);
      if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存して、C列貼り付けデータをコピー！";
    })
    .then(function () {
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
