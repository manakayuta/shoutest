/**
 * ========================================================
 * 数学小テストシステム マーク式＋選択式ハイブリッド版 (コード.gs)
 * ========================================================
 */

function doGet(e) {
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

// 3. 個別問題データの取得（マーク式ラベル・最大6択対応）
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

  // F列(5)〜K列(10)の最大6項目
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

// 4. 解答送信と記録（★マーク式の表記ゆれ吸収対応）
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

  // 正誤判定:
  // 1. 通常の完全一致
  let isCorrect = (studentAnswer.toUpperCase() === correctAnswer.toUpperCase());

  // 2. マーク式用の正規化（カンマ、空白、ハイフン、全角記号、π/pi、e/E を統一して比較）
  if (!isCorrect) {
    const normalize = (str) => String(str)
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
    "'" + studentAnswer, // 先頭にシングルクォートを付与してスプレッドシートの日付自動変換を防止
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
