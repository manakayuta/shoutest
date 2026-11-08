/**
 * ========================================================
 * 数学小テスト 問題作成スタジオ ロジック v2.0 (creator.js)
 * GAS (HtmlService iframe) およびローカル環境 両対応・完全堅牢版
 * ========================================================
 */

// 設定キー (localStorage)
const STORAGE_KEY_API = "quick_quiz_gemini_api_key";
const STORAGE_KEY_FOLDER = "quick_quiz_drive_folder_url";
const DEFAULT_GAS_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

// 状態変数
let currentImageBase64 = null;
let currentGeneratedData = null;

// DOM要素を常に最新で取得するヘルパー（GASの遅延DOM構築でも絶対にnullにならない）
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

// ==========================================
// 1. 初期ロード & 設定の復元（自動記憶）
// ==========================================
function initSettings() {
  const apiKeyInput = el("apiKeyInput");
  const apiSavedNotice = el("apiSavedNotice");
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const folderSavedNotice = el("folderSavedNotice");

  // APIキーの復元
  const savedApiKey = safeStorage.get(STORAGE_KEY_API);
  if (savedApiKey && apiKeyInput && !apiKeyInput.value) {
    apiKeyInput.value = savedApiKey;
  }
  if (apiSavedNotice) {
    apiSavedNotice.style.display = (apiKeyInput && apiKeyInput.value.trim()) ? "inline-block" : "none";
  }

  // フォルダURLの復元
  const savedFolderUrl = safeStorage.get(STORAGE_KEY_FOLDER);
  if (savedFolderUrl && driveFolderUrlInput && !driveFolderUrlInput.value) {
    driveFolderUrlInput.value = savedFolderUrl;
  }
  if (folderSavedNotice) {
    folderSavedNotice.style.display = (driveFolderUrlInput && driveFolderUrlInput.value.trim()) ? "inline-block" : "none";
  }

  checkReadyToGenerate();
}

// あらゆる読み込みタイミングで確実に初期化を実行
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSettings);
} else {
  initSettings();
}
window.addEventListener("load", initSettings);
setTimeout(initSettings, 200);

// APIキー入力ハンドラ
window.onApiKeyInput = function () {
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
};

// APIキー表示切り替え
window.onToggleApiVis = function () {
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
};

// フォルダURL入力ハンドラ
window.onFolderUrlInput = function () {
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
};

// ==========================================
// 2. 画像の取り込み（ファイル選択・D&D・ボタン貼付・Ctrl+V）
// ==========================================
function handleImageFile(file) {
  if (!file) return;

  const isImage = (file.type && file.type.startsWith("image/")) ||
                  /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(file.name || "") ||
                  (file.size > 0 && (!file.type || file.type === "image"));

  if (!isImage) {
    alert("画像ファイル（PNG, JPG 等）を選択してください。");
    return;
  }

  const reader = new FileReader();
  reader.onload = function (e) {
    currentImageBase64 = e.target.result;
    const sourceImagePreview = el("sourceImagePreview");
    const dropZoneContent = el("dropZoneContent");
    const sourceImagePreviewWrapper = el("sourceImagePreviewWrapper");

    if (sourceImagePreview) sourceImagePreview.src = currentImageBase64;
    if (dropZoneContent) dropZoneContent.classList.add("hidden");
    if (sourceImagePreviewWrapper) sourceImagePreviewWrapper.classList.remove("hidden");
    checkReadyToGenerate();
  };
  reader.onerror = function () {
    alert("画像の読み込みに失敗しました。もう一度お試しください。");
  };
  reader.readAsDataURL(file);
}

// ① ファイル選択ボタンからの変更イベント
window.onFileInputChange = function (inputEl) {
  if (inputEl && inputEl.files && inputEl.files[0]) {
    handleImageFile(inputEl.files[0]);
    // 次回同じファイルを選択してもchangeが発火するように読み込み開始後にリセット
    setTimeout(() => {
      try { inputEl.value = ""; } catch (e) {}
    }, 300);
  }
};

// ② 「📋 スクショを貼り付け」ボタンクリック
window.onPasteButtonClick = async function () {
  // Clipboard API が使える場合はワンクリックで画像を読み取る
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
      alert("クリップボードに画像が見つかりませんでした。\n画面切り取り（Win + Shift + S 等）で画像をコピーしてから押してください。");
      return;
    } catch (err) {
      // GASのiframe等でClipboard API権限がブロックされた場合は、専用入力欄にフォーカスしてCtrl+Vを促す
      console.warn("Clipboard API fallback to paste input:", err);
    }
  }

  // フォールバック：ペースト受信用ボックスにフォーカスを当てて Ctrl+V を案内
  const pasteInput = el("pasteCatcherInput");
  if (pasteInput) {
    pasteInput.focus();
    pasteInput.value = "";
    pasteInput.placeholder = "⌨️ そのままキーボードの Ctrl + V を押してください！";
  }
};

// ③ Ctrl + V ペースト処理
window.onPasteEvent = function (e) {
  const clipboardData = e.clipboardData || window.clipboardData;
  if (!clipboardData) return;

  // 1. filesリストから画像を探す
  if (clipboardData.files && clipboardData.files.length > 0) {
    for (let i = 0; i < clipboardData.files.length; i++) {
      const f = clipboardData.files[i];
      if ((f.type && f.type.startsWith("image/")) || /\.(png|jpe?g|gif|webp|bmp)$/i.test(f.name || "")) {
        e.preventDefault();
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
          e.preventDefault();
          handleImageFile(blob);
          return;
        }
      }
    }
  }
};

// 画面全体での Ctrl + V も常時キャッチ
window.addEventListener("paste", window.onPasteEvent);
document.addEventListener("paste", window.onPasteEvent);

// ④ ドラッグ＆ドロップ処理
["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
  window.addEventListener(eventName, (e) => {
    e.preventDefault();
  }, false);
});

window.onDragOver = function (e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = el("dropZone");
  if (dz) dz.classList.add("drag-over");
};

window.onDragLeave = function (e) {
  e.preventDefault();
  e.stopPropagation();
  const dz = el("dropZone");
  if (dz) dz.classList.remove("drag-over");
};

window.onDropFile = function (e) {
  e.preventDefault();
  e.stopPropagation();
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
};

// ⑤ 画像削除ボタン
window.onClearImage = function (e) {
  if (e) {
    e.preventDefault();
    e.stopPropagation();
  }
  currentImageBase64 = null;
  const fileInput = el("fileInput");
  const sourceImagePreview = el("sourceImagePreview");
  const sourceImagePreviewWrapper = el("sourceImagePreviewWrapper");
  const dropZoneContent = el("dropZoneContent");
  const pasteInput = el("pasteCatcherInput");

  if (fileInput) fileInput.value = "";
  if (sourceImagePreview) sourceImagePreview.src = "";
  if (sourceImagePreviewWrapper) sourceImagePreviewWrapper.classList.add("hidden");
  if (dropZoneContent) dropZoneContent.classList.remove("hidden");
  if (pasteInput) pasteInput.placeholder = "💡 ここをクリックして Ctrl + V でも直接貼り付けできます";
  checkReadyToGenerate();
};

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
window.onGenerateClick = async function () {
  const apiKeyInput = el("apiKeyInput");
  const customPromptInput = el("customPromptInput");
  const placeholderBox = el("placeholderBox");
  const resultArea = el("resultArea");
  const loadingBox = el("loadingBox");
  const loadingStatusText = el("loadingStatusText");
  const copySuccessMessage = el("copySuccessMessage");
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

  // UI切り替え: ローディング表示
  if (placeholderBox) placeholderBox.classList.add("hidden");
  if (resultArea) resultArea.classList.add("hidden");
  if (loadingBox) loadingBox.classList.remove("hidden");
  if (copySuccessMessage) copySuccessMessage.classList.add("hidden");
  if (generateBtn) generateBtn.disabled = true;

  try {
    if (loadingStatusText) loadingStatusText.textContent = "AIが画像を解析し、数式と問題を構成しています...";

    const mimeType = currentImageBase64.split(";")[0].split(":")[1];
    const base64Data = currentImageBase64.split(",")[1];

    const systemPrompt = `
あなたは日本の高校数学の優秀な教員であり教材作成のスペシャリストです。
添付された数学の問題画像を読み取り、指定されたルールに従って小テスト用データをJSON形式で出力してください。

【設定条件】
- 改題モード: ${remakeMode === "exact" ? "元画像の問題をできるだけ忠実に再現（マーク化/選択肢化のみ行う）" : "元画像の問題を改題（数値を変更した類題を作成）"}
- 出題形式: ${questionType}（マーク式または選択式）
${customPrompt ? `- 追加指示: ${customPrompt}` : ""}

【数学・表記ルール】
1. 数式はすべて LaTeX 記法（$ ... $ または $$ ... $$）で美しく記述してください。
2. マーク式の場合:
   - 問題文中に穴埋め枠として \\fbox{ ア } や \\fbox{ イ } のようにマーク枠を配置してください。
   - slotsOrChoices には ["ア", "イ"] のように使用したマーク枠のカタカナ文字を配列で入れてください。
   - correctAnswer には "1, 2" や "-, 3" のようにカンマ区切りで各枠の正解を入れてください。
3. 選択式の場合:
   - slotsOrChoices には ["選択肢Aのテキスト", "選択肢Bのテキスト", "選択肢Cのテキスト", "選択肢Dのテキスト"] を入れてください（2〜4択）。
   - correctAnswer には正解の文字（"A", "B", "C", "D" のいずれか）を入れてください。
4. explanationMarkdown には、生徒が読んですぐ理解できる丁寧な途中式とポイント解説を LaTeX を交えて記述してください。

【出力フォーマット】
以下のJSONフォーマットのみを純粋に出力してください（バッククォート \`\`\`json も含めないでください）。
{
  "title": "単元名・問題タイトル（例: 第◯回 2次関数の決定）",
  "problemMarkdown": "問題文の本文（LaTeX数式記法を含む）",
  "type": "${questionType}",
  "slotsOrChoices": ["ア", "イ"],
  "correctAnswer": "1, 2",
  "explanationMarkdown": "解説本文（LaTeX数式記法を含む）"
}
`;

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
      const cleanJson = candidateText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
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
  }
};

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
window.onExportClick = async function () {
  const driveFolderUrlInput = el("driveFolderUrlInput");
  const resultTitleInput = el("resultTitleInput");
  const choicesInput = el("choicesInput");
  const correctAnswerInput = el("correctAnswerInput");
  const problemCard = el("problemCard");
  const copySuccessMessage = el("copySuccessMessage");
  const exportBtn = el("exportBtn");
  const exportBtnText = el("exportBtnText");

  const folderUrl = driveFolderUrlInput ? driveFolderUrlInput.value.trim() : "";
  const title = (resultTitleInput && resultTitleInput.value.trim()) || "小テスト";
  const type = (currentGeneratedData && currentGeneratedData.type) || "マーク";
  const rawChoices = choicesInput ? choicesInput.value.split(",").map(s => s.trim()).filter(s => s !== "") : [];
  const correctAnswer = correctAnswerInput ? correctAnswerInput.value.trim() : "";

  if (copySuccessMessage) copySuccessMessage.classList.add("hidden");
  if (exportBtn) exportBtn.disabled = true;
  if (exportBtnText) exportBtnText.textContent = "問題画像を生成中...";

  try {
    const canvas = await html2canvas(problemCard, {
      scale: 2,
      backgroundColor: "#ffffff"
    });
    const problemImageBase64 = canvas.toDataURL("image/png");

    let finalImageUrl = "";

    // Googleドライブへの自動アップロード
    if (folderUrl && folderUrl.includes("drive.google.com")) {
      if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存中...";

      try {
        if (typeof google !== "undefined" && google.script && google.script.run) {
          // Google Apps Script 環境（Webアプリ内）で動作中の場合
          finalImageUrl = await new Promise((resolve, reject) => {
            google.script.run
              .withSuccessHandler(url => resolve(url))
              .withFailureHandler(err => reject(err))
              .uploadImageServer(folderUrl, problemImageBase64, `quiz_${Date.now()}.png`);
          });
        } else {
          // 外部 / ローカル実行時の fetch
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
            }
          }
        }
      } catch (e) {
        console.warn("ドライブ保存エラー (フォールバックします):", e);
      }
    }

    if (!finalImageUrl) {
      finalImageUrl = "（Googleドライブ保存完了後にURLが入ります）";
      downloadBase64Image(problemImageBase64, `${title}_問題.png`);
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

    await navigator.clipboard.writeText(tsvRow);

    if (copySuccessMessage) copySuccessMessage.classList.remove("hidden");
    if (exportBtnText) exportBtnText.textContent = "✓ 保存＆クリップボードにコピー完了！";
  } catch (err) {
    console.error("エクスポートエラー:", err);
    alert(`保存・コピー処理中にエラーが発生しました: ${err.message}`);
    if (exportBtnText) exportBtnText.textContent = "Googleドライブに保存して、C列貼り付けデータをコピー！";
  } finally {
    if (exportBtn) exportBtn.disabled = false;
  }
};

function downloadBase64Image(base64Data, filename) {
  const a = document.createElement("a");
  a.href = base64Data;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
