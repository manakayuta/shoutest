/**
 * ========================================================
 * 数学小テストシステム マーク式＋選択式＋画像アップロード対応版 (コード.gs)
 * ========================================================
 */

// 1. Webアプリ画面の配信（生徒用または教員用問題作成スタジオ）
function doGet(e) {
  if (e && e.parameter && e.parameter.page === "creator") {
    return HtmlService.createHtmlOutputFromFile("creator")
      .setTitle("数学小テスト 問題作成スタジオ")
      .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("数学小テストシステム")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. 問題一覧の取得
function getQuestionListServer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("問題一覧");
  const aSheet = ss.getSheetByName("解答記録");
  if (!qSheet || !aSheet) throw new Error("必要なシートが見つかりません");

  const qData = qSheet.getDataRange().getValues();
  if (qData.length <= 1) return [];

  const studentEmail = Session.getActiveUser().getEmail();
  const aRows = aSheet.getDataRange().getValues().slice(1);
  const passedSet = new Set();
  
  if (studentEmail) {
    aRows.forEach(row => {
      const email = String(row[1]).trim().toLowerCase();
      const qId = String(row[2]).trim();
      const result = String(row[5]).trim();
      if (email === studentEmail.toLowerCase() && result === "正解") {
        passedSet.add(qId);
      }
    });
  }

  const qRows = qData.slice(1);
  return qRows
    .filter(r => String(r[12]).trim() === "公開") // M列が「公開」
    .map(r => {
      const qId = String(r[0]);
      return {
        questionId: qId,
        round: String(r[1]),
        title: String(r[2]),
        type: String(r[3]),
        isPassed: passedSet.has(qId)
      };
    });
}

// 3. 個別問題データの取得
function getQuestionServer(questionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("問題一覧");
  if (!sheet) throw new Error("「問題一覧」シートが見つかりません");

  const rows = sheet.getDataRange().getValues().slice(1);
  let targetRow = null;

  if (questionId) {
    targetRow = rows.find(r => String(r[0]) === String(questionId) && String(r[12]).trim() === "公開");
  } else {
    targetRow = rows.find(r => String(r[12]).trim() === "公開");
  }

  if (!targetRow) throw new Error("出題可能な問題が見つかりません");

  const rawImageUrl = String(targetRow[4] || "");
  const directImageUrl = convertDriveUrlToDirect(rawImageUrl);

  const choices = [
    String(targetRow[5] || ""),
    String(targetRow[6] || ""),
    String(targetRow[7] || ""),
    String(targetRow[8] || ""),
    String(targetRow[9] || ""),
    String(targetRow[10] || "")
  ].filter(c => c.trim() !== "");

  return {
    questionId: String(targetRow[0]),
    round: String(targetRow[1]),
    questionTitle: `${targetRow[1]} ${targetRow[2]}`,
    type: String(targetRow[3]),
    imageUrl: directImageUrl,
    choices: choices.length > 0 ? choices : ["ア", "イ"]
  };
}

// 4. 解答送信と記録
function submitAnswerServer(questionId, selectedChoice) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("問題一覧");
  const aSheet = ss.getSheetByName("解答記録");

  if (!qSheet || !aSheet) throw new Error("必要なシートが見つかりません");

  const qRows = qSheet.getDataRange().getValues().slice(1);
  const targetQ = qRows.find(r => String(r[0]) === String(questionId));
  if (!targetQ) throw new Error("該当の問題が見つかりません");

  const correctAnswer = String(targetQ[11]).trim();
  const studentAnswer = String(selectedChoice).trim();

  let isCorrect = (studentAnswer.toUpperCase() === correctAnswer.toUpperCase());

  if (!isCorrect) {
    const normalize = (str) => String(str)
      .replace(/^['’]/, "")
      .replace(/[\s,、\-_ー−]/g, "")
      .replace(/パイ/g, "PI")
      .toUpperCase()
      .replace(/PI/g, "Π");

    const cleanStudent = normalize(studentAnswer);
    const cleanCorrect = normalize(correctAnswer);
    if (cleanStudent !== "" && cleanStudent === cleanCorrect) {
      isCorrect = true;
    }
  }

  let studentEmail = Session.getActiveUser().getEmail();
  if (!studentEmail) {
    studentEmail = "未取得アカウント";
  }

  const now = Utilities.formatDate(new Date(), "Asia/Tokyo", "yyyy/MM/dd HH:mm:ss");
  const title = `${targetQ[1]} ${targetQ[2]}`;
  const resultText = isCorrect ? "正解" : "不正解";

  aSheet.appendRow([
    now,
    studentEmail,
    questionId,
    title,
    "'" + studentAnswer, // 先頭にシングルクォートを付与して日付化防止
    resultText
  ]);

  return {
    isCorrect: isCorrect,
    correctAnswer: correctAnswer,
    studentEmail: studentEmail
  };
}

function convertDriveUrlToDirect(url) {
  if (!url) return "";
  if (url.includes("lh3.googleusercontent.com") || url.startsWith("data:")) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://lh3.googleusercontent.com/d/" + match[1];
  }
  return url;
}

// 5. 問題作成スタジオ（Webアプリ内）からのGoogleドライブ画像保存
function uploadImageServer(folderUrl, base64Image, filename) {
  const folderMatch = String(folderUrl || "").match(/\/folders\/([a-zA-Z0-9_-]+)/);
  if (!folderMatch || !folderMatch[1]) {
    throw new Error("有効なGoogleドライブフォルダURLではありません（フォルダURL形式を確認してください）");
  }
  const folderId = folderMatch[1];
  const folder = DriveApp.getFolderById(folderId);

  const base64Str = String(base64Image || "").replace(/^data:image\/\w+;base64,/, "");
  const decodedBytes = Utilities.base64Decode(base64Str);
  const blob = Utilities.newBlob(decodedBytes, "image/png", filename || `quiz_${Date.now()}.png`);

  const file = folder.createFile(blob);
  try {
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  } catch (err) {
    try {
      file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
    } catch (e2) {}
  }
  return "https://lh3.googleusercontent.com/d/" + file.getId();
}

// 5b. 問題作成スタジオ用 Gemini API サーバー中継（ブラウザ側fetch遮断・タイムアウト時の自動フォールバック）
function generateQuizServer(apiKey, requestBody, preferredModel) {
  const key = String(apiKey || "").trim();
  if (!key) {
    throw new Error("Gemini APIキーが指定されていません。");
  }

  const candidates = [];
  if (preferredModel && typeof preferredModel === "string" && preferredModel.trim()) {
    candidates.push(preferredModel.trim());
  }

  // 自動取得された最新のアクティブモデル
  const serverDiscovered = listModelsServer(key);
  if (Array.isArray(serverDiscovered) && serverDiscovered.length > 0) {
    for (let d = 0; d < serverDiscovered.length; d++) {
      if (candidates.indexOf(serverDiscovered[d]) === -1) {
        candidates.push(serverDiscovered[d]);
      }
    }
  }

  // フォールバック候補（廃止済みの旧モデル名 gemini-1.5-flash は除外）
  const staticList = [
    "gemini-3.8-flash",
    "gemini-3.5-flash-lite",
    "gemini-2.5-flash",
    "gemini-2.0-flash",
    "gemini-3.8-pro",
    "gemini-2.5-pro"
  ];
  for (let s = 0; s < staticList.length; s++) {
    if (candidates.indexOf(staticList[s]) === -1) {
      candidates.push(staticList[s]);
    }
  }

  const attempted = [];
  for (let i = 0; i < candidates.length; i++) {
    const model = candidates[i];
    const url = "https://generativelanguage.googleapis.com/v1beta/models/" +
      encodeURIComponent(model) + ":generateContent?key=" + encodeURIComponent(key);

    try {
      const res = UrlFetchApp.fetch(url, {
        method: "post",
        contentType: "application/json",
        payload: JSON.stringify(requestBody),
        muteHttpExceptions: true
      });

      const code = res.getResponseCode();
      const text = res.getContentText();
      if (code >= 200 && code < 300) {
        return JSON.parse(text);
      }

      let apiErrMsg = "HTTP " + code;
      try {
        const parsedErr = JSON.parse(text);
        if (parsedErr && parsedErr.error && parsedErr.error.message) {
          apiErrMsg = "HTTP " + code + ": " + parsedErr.error.message;
        }
      } catch (e) {}

      attempted.push(model + " => " + apiErrMsg);
      // 400(不正リクエスト), 401(キー無効), 403(権限なし)のみ中断。429(クォータ制限)は次のモデル候補へ
      if (code === 400 || code === 401 || code === 403) {
        throw new Error("Gemini API エラー (" + apiErrMsg + ")");
      }
    } catch (fetchErr) {
      const fetchMsg = (fetchErr && fetchErr.message) ? fetchErr.message : String(fetchErr);
      if (fetchMsg.indexOf("Gemini API エラー") !== -1) {
        throw fetchErr;
      }
      attempted.push(model + " => " + fetchMsg);
    }
  }
  throw new Error("Gemini API エラー (試行全モデル失敗: " + attempted.join(" | ") + ")");
}

// 5c. 利用可能なモデル一覧取得（GASサーバー側・動的適合）
function listModelsServer(apiKey) {
  const key = String(apiKey || "").trim();
  if (!key) return [];
  try {
    const url = "https://generativelanguage.googleapis.com/v1beta/models?key=" + encodeURIComponent(key);
    const res = UrlFetchApp.fetch(url, { muteHttpExceptions: true });
    if (res.getResponseCode() >= 200 && res.getResponseCode() < 300) {
      const data = JSON.parse(res.getContentText());
      if (data && Array.isArray(data.models)) {
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
    }
  } catch (e) {}
  return [];
}

// 6. 外部通信用（POST）
function doPost(e) {
  try {
    const postData = JSON.parse(e.postData.contents);
    if (postData.action === "uploadImage") {
      const folderUrl = String(postData.folderUrl || "");
      const folderMatch = folderUrl.match(/\/folders\/([a-zA-Z0-9_-]+)/);
      if (!folderMatch || !folderMatch[1]) {
        throw new Error("有効なGoogleドライブフォルダURLではありません（フォルダURL形式を確認してください）");
      }

      const folderId = folderMatch[1];
      const folder = DriveApp.getFolderById(folderId);

      const base64Str = postData.base64Image.replace(/^data:image\/\w+;base64,/, "");
      const decodedBytes = Utilities.base64Decode(base64Str);
      const filename = postData.filename || `quiz_${Date.now()}.png`;
      const blob = Utilities.newBlob(decodedBytes, "image/png", filename);

      const file = folder.createFile(blob);
      try {
        file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
      } catch (err) {
        file.setSharing(DriveApp.Access.DOMAIN_WITH_LINK, DriveApp.Permission.VIEW);
      }

      const directUrl = "https://lh3.googleusercontent.com/d/" + file.getId();
      return ContentService.createTextOutput(JSON.stringify({ imageUrl: directUrl, fileId: file.getId() }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    return ContentService.createTextOutput(JSON.stringify({ error: "不明なアクション" }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
