/**
 * ========================================================
 * 数学小テスト 問題作成スタジオ ロジック (creator.js)
 * ========================================================
 */

// 設定キー (localStorage)
const STORAGE_KEY_API = "quick_quiz_gemini_api_key";
const STORAGE_KEY_FOLDER = "quick_quiz_drive_folder_url";
const DEFAULT_GAS_URL = "https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec";

// DOM要素
const apiKeyInput = document.getElementById("apiKeyInput");
const toggleApiVisibilityBtn = document.getElementById("toggleApiVisibilityBtn");
const apiSavedNotice = document.getElementById("apiSavedNotice");

const driveFolderUrlInput = document.getElementById("driveFolderUrlInput");
const folderSavedNotice = document.getElementById("folderSavedNotice");

const dropZone = document.getElementById("dropZone");
const fileInput = document.getElementById("fileInput");
const dropZoneContent = document.getElementById("dropZoneContent");
const sourceImagePreviewWrapper = document.getElementById("sourceImagePreviewWrapper");
const sourceImagePreview = document.getElementById("sourceImagePreview");
const clearImgBtn = document.getElementById("clearImgBtn");

const customPromptInput = document.getElementById("customPromptInput");
const generateBtn = document.getElementById("generateBtn");

const placeholderBox = document.getElementById("placeholderBox");
const loadingBox = document.getElementById("loadingBox");
const loadingStatusText = document.getElementById("loadingStatusText");
const resultArea = document.getElementById("resultArea");

const resultTitleInput = document.getElementById("resultTitleInput");
const problemCard = document.getElementById("problemCard");
const problemCardContent = document.getElementById("problemCardContent");
const explanationCard = document.getElementById("explanationCard");
const explanationCardContent = document.getElementById("explanationCardContent");

const choicesLabel = document.getElementById("choicesLabel");
const choicesInput = document.getElementById("choicesInput");
const correctAnswerInput = document.getElementById("correctAnswerInput");

const exportBtn = document.getElementById("exportBtn");
const exportBtnText = document.getElementById("exportBtnText");
const copySuccessMessage = document.getElementById("copySuccessMessage");

// 状態変数
let currentImageBase64 = null;
let currentGeneratedData = null;

// ==========================================
// 1. 初期ロード & 設定の復元（自動記憶）
// ==========================================
window.addEventListener("DOMContentLoaded", () => {
  // APIキーの復元
  const savedApiKey = localStorage.getItem(STORAGE_KEY_API);
  if (savedApiKey) {
    apiKeyInput.value = savedApiKey;
    apiSavedNotice.style.display = "inline-block";
  } else {
    apiSavedNotice.style.display = "none";
  }

  // フォルダURLの復元
  const savedFolderUrl = localStorage.getItem(STORAGE_KEY_FOLDER);
  if (savedFolderUrl) {
    driveFolderUrlInput.value = savedFolderUrl;
    folderSavedNotice.style.display = "inline-block";
  } else {
    folderSavedNotice.style.display = "none";
  }

  checkReadyToGenerate();
});

// APIキーの入力時即座自動保存
apiKeyInput.addEventListener("input", () => {
  const key = apiKeyInput.value.trim();
  if (key) {
    localStorage.setItem(STORAGE_KEY_API, key);
    apiSavedNotice.style.display = "inline-block";
  } else {
    localStorage.removeItem(STORAGE_KEY_API);
    apiSavedNotice.style.display = "none";
  }
  checkReadyToGenerate();
});

toggleApiVisibilityBtn.addEventListener("click", () => {
  if (apiKeyInput.type === "password") {
    apiKeyInput.type = "text";
    toggleApiVisibilityBtn.textContent = "🙈";
  } else {
    apiKeyInput.type = "password";
    toggleApiVisibilityBtn.textContent = "👁️";
  }
});

// フォルダURLの入力時即座自動保存
driveFolderUrlInput.addEventListener("input", () => {
  const url = driveFolderUrlInput.value.trim();
  if (url) {
    localStorage.setItem(STORAGE_KEY_FOLDER, url);
    folderSavedNotice.style.display = "inline-block";
  } else {
    localStorage.removeItem(STORAGE_KEY_FOLDER);
    folderSavedNotice.style.display = "none";
  }
});

// ==========================================
// 2. 画像の取り込み（ファイル・D&D・Ctrl+V）
// ==========================================
function handleImageFile(file) {
  if (!file || !file.type.startsWith("image/")) {
    alert("画像ファイルを選択してください。");
    return;
  }

  const reader = new FileReader();
  reader.onload = (e) => {
    currentImageBase64 = e.target.result;
    sourceImagePreview.src = currentImageBase64;
    dropZoneContent.classList.add("hidden");
    sourceImagePreviewWrapper.classList.remove("hidden");
    checkReadyToGenerate();
  };
  reader.readAsDataURL(file);
}

fileInput.addEventListener("change", (e) => {
  if (e.target.files && e.target.files[0]) {
    handleImageFile(e.target.files[0]);
  }
});

// ドラッグ＆ドロップ
dropZone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropZone.classList.add("drag-over");
});
dropZone.addEventListener("dragleave", () => {
  dropZone.classList.remove("drag-over");
});
dropZone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropZone.classList.remove("drag-over");
  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
    handleImageFile(e.dataTransfer.files[0]);
  }
});

// Ctrl + V（クリップボード貼り付け）
window.addEventListener("paste", (e) => {
  const items = (e.clipboardData || e.originalEvent.clipboardData).items;
  for (let i = 0; i < items.length; i++) {
    if (items[i].type.indexOf("image") !== -1) {
      const blob = items[i].getAsFile();
      handleImageFile(blob);
      break;
    }
  }
});

clearImgBtn.addEventListener("click", (e) => {
  e.stopPropagation();
  currentImageBase64 = null;
  fileInput.value = "";
  sourceImagePreview.src = "";
  sourceImagePreviewWrapper.classList.add("hidden");
  dropZoneContent.classList.remove("hidden");
  checkReadyToGenerate();
});

function checkReadyToGenerate() {
  const hasKey = apiKeyInput.value.trim().length > 0;
  const hasImage = currentImageBase64 !== null;
  generateBtn.disabled = !(hasKey && hasImage);
}

// ==========================================
// 3. Gemini API による解析・改題・生成
// ==========================================
generateBtn.addEventListener("click", async () => {
  const apiKey = apiKeyInput.value.trim();
  if (!apiKey) {
    alert("Gemini APIキーを入力してください。");
    apiKeyInput.focus();
    return;
  }
  if (!currentImageBase64) {
    alert("問題画像をセットしてください。");
    return;
  }

  const remakeMode = document.querySelector('input[name="remakeMode"]:checked').value;
  const questionType = document.querySelector('input[name="questionType"]:checked').value;
  const customPrompt = customPromptInput.value.trim();

  // UI切り替え: ローディング表示
  placeholderBox.classList.add("hidden");
  resultArea.classList.add("hidden");
  loadingBox.classList.remove("hidden");
  copySuccessMessage.classList.add("hidden");
  generateBtn.disabled = true;

  try {
    loadingStatusText.textContent = "AIが画像を解析し、数式と問題を構成しています...";

    // Base64データから純粋な画像データとMIMEタイプを抽出
    const mimeType = currentImageBase64.split(";")[0].split(":")[1];
    const base64Data = currentImageBase64.split(",")[1];

    // プロンプトの組み立て
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

    // リクエストボディ
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

    // Gemini API リクエスト（Google最新指定の gemini-3.8-flash を最優先）
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

    // JSONパース
    let parsedData;
    try {
      // 余計なマークダウンフェンスをトリム
      const cleanJson = candidateText.replace(/^```json\s*/, "").replace(/\s*```$/, "").trim();
      parsedData = JSON.parse(cleanJson);
    } catch (e) {
      console.error("JSON parse error:", candidateText);
      throw new Error("AIの応答をJSONとして解釈できませんでした。もう一度お試しください。");
    }

    currentGeneratedData = parsedData;

    // プレビュー画面の描画
    renderPreview(parsedData);

    loadingBox.classList.add("hidden");
    resultArea.classList.remove("hidden");
  } catch (error) {
    console.error("生成エラー:", error);
    alert(`生成に失敗しました: ${error.message}`);
    loadingBox.classList.add("hidden");
    placeholderBox.classList.remove("hidden");
  } finally {
    generateBtn.disabled = false;
  }
});

// ==========================================
// 4. プレビューの描画とKaTeX数式レンダリング
// ==========================================
function renderPreview(data) {
  resultTitleInput.value = data.title || "数学 小テスト";

  // 問題文のレンダリング
  problemCardContent.innerHTML = formatMarkdownMath(data.problemMarkdown);
  renderMath(problemCardContent);

  // 解説のレンダリング
  explanationCardContent.innerHTML = formatMarkdownMath(data.explanationMarkdown);
  renderMath(explanationCardContent);

  // 枠・選択肢
  const isMark = (data.type === "マーク" || data.type === "マーク式");
  choicesLabel.textContent = isMark ? "マーク枠ラベル（カンマ区切り）" : "選択肢（カンマ区切り）";
  choicesInput.value = (data.slotsOrChoices || []).join(", ");
  correctAnswerInput.value = data.correctAnswer || "";
}

// 改行や太字の簡易変換
function formatMarkdownMath(text) {
  if (!text) return "";
  return text
    .replace(/\n\n/g, "<br><br>")
    .replace(/\n/g, "<br>")
    .replace(/\*\*(.*?)\*\*/g, "<strong>$1</strong>");
}

// KaTeX の自動数式レンダリング
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
exportBtn.addEventListener("click", async () => {
  const folderUrl = driveFolderUrlInput.value.trim();
  const title = resultTitleInput.value.trim() || "小テスト";
  const type = currentGeneratedData.type || "マーク";
  const rawChoices = choicesInput.value.split(",").map(s => s.trim()).filter(s => s !== "");
  const correctAnswer = correctAnswerInput.value.trim();

  copySuccessMessage.classList.add("hidden");
  exportBtn.disabled = true;
  exportBtnText.textContent = "問題画像を生成中...";

  try {
    // 1. 問題カードを html2canvas で高品質PNG画像化
    const canvas = await html2canvas(problemCard, {
      scale: 2, // 高解像度（Retina/印刷クオリティ）
      backgroundColor: "#ffffff"
    });
    const problemImageBase64 = canvas.toDataURL("image/png");

    let finalImageUrl = "";

    // 2. Googleドライブへの自動アップロード
    if (folderUrl && folderUrl.includes("drive.google.com")) {
      exportBtnText.textContent = "Googleドライブに保存中...";

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

    // もしドライブAPI未連携、またはエラーの場合はローカルダウンロード案内
    if (!finalImageUrl) {
      // プレースホルダーまたは画像ダウンロード
      finalImageUrl = "（Googleドライブ保存完了後にURLが入ります）";
      // 画像を自動ダウンロード
      downloadBase64Image(problemImageBase64, `${title}_問題.png`);
    }

    // 3. スプレッドシートの C列〜M列 にピッタリ入るタブ区切り文字列（TSV）を作成！
    // C列: タイトル
    // D列: 形式 (マーク or 選択)
    // E列: 画像URL
    // F列: 選択肢A / 枠ア
    // G列: 選択肢B / 枠イ
    // H列: 選択肢C / 枠ウ
    // I列: 選択肢D / 枠エ
    // J列: 選択肢E / 枠オ
    // K列: 選択肢F / 枠カ
    // L列: 正解
    // M列: 公開状態 (公開)

    const choiceCols = [
      rawChoices[0] || "",
      rawChoices[1] || "",
      rawChoices[2] || "",
      rawChoices[3] || "",
      rawChoices[4] || "",
      rawChoices[5] || ""
    ];

    const tsvRow = [
      title,                                // C列: タイトル
      (type === "マーク" || type === "マーク式") ? "マーク" : "選択", // D列: 形式
      finalImageUrl,                        // E列: 画像URL
      choiceCols[0],                        // F列: 選択肢A
      choiceCols[1],                        // G列: 選択肢B
      choiceCols[2],                        // H列: 選択肢C
      choiceCols[3],                        // I列: 選択肢D
      choiceCols[4],                        // J列: 選択肢E
      choiceCols[5],                        // K列: 選択肢F
      correctAnswer,                        // L列: 正解
      "公開"                                // M列: 公開状態
    ].join("\t"); // タブ区切り

    // クリップボードにコピー
    await navigator.clipboard.writeText(tsvRow);

    // 成功メッセージ表示
    copySuccessMessage.classList.remove("hidden");
    exportBtnText.textContent = "✓ 保存＆クリップボードにコピー完了！";
  } catch (err) {
    console.error("エクスポートエラー:", err);
    alert(`保存・コピー処理中にエラーが発生しました: ${err.message}`);
    exportBtnText.textContent = "Googleドライブに保存して、C列貼り付けデータをコピー！";
  } finally {
    exportBtn.disabled = false;
  }
});

function downloadBase64Image(base64Data, filename) {
  const a = document.createElement("a");
  a.href = base64Data;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
