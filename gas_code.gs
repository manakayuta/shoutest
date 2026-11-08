/**
 * ========================================================
 * 数学小テストシステム 完全自動・なりすまし防止版 (コード.gs)
 * ========================================================
 */

// 1. 生徒がアクセスした時に画面（HTML）を表示する
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("数学小テストシステム")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. 問題一覧の取得（サーバー側処理）
function getQuestionListServer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("問題一覧");
  if (!sheet) throw new Error("「問題一覧」シートが見つかりません");

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const rows = data.slice(1);
  return rows
    .filter(r => r[10] === "公開") // K列が「公開」
    .map(r => ({
      questionId: String(r[0]),
      round: String(r[1]),
      title: String(r[2]),
      type: String(r[3])
    }));
}

// 3. 個別問題データの取得（サーバー側処理）
function getQuestionServer(questionId) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("問題一覧");
  if (!sheet) throw new Error("「問題一覧」シートが見つかりません");

  const rows = sheet.getDataRange().getValues().slice(1);
  let targetRow = null;

  if (questionId) {
    targetRow = rows.find(r => String(r[0]) === String(questionId) && r[10] === "公開");
  } else {
    targetRow = rows.find(r => r[10] === "公開");
  }

  if (!targetRow) throw new Error("出題可能な問題が見つかりません");

  const rawImageUrl = String(targetRow[4] || "");
  const directImageUrl = convertDriveUrlToDirect(rawImageUrl);

  const choices = [
    String(targetRow[5] || ""),
    String(targetRow[6] || ""),
    String(targetRow[7] || ""),
    String(targetRow[8] || "")
  ].filter(c => c.trim() !== "");

  return {
    questionId: String(targetRow[0]),
    round: String(targetRow[1]),
    questionTitle: `${targetRow[1]} ${targetRow[2]}`,
    type: String(targetRow[3]),
    imageUrl: directImageUrl,
    choices: choices.length > 0 ? choices : ["A", "B", "C", "D"]
  };
}

// 4. 解答の送信と成績記録（サーバー側処理）
function submitAnswerServer(questionId, selectedChoice) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("問題一覧");
  const aSheet = ss.getSheetByName("解答記録");

  if (!qSheet || !aSheet) throw new Error("必要なシートが見つかりません");

  const qRows = qSheet.getDataRange().getValues().slice(1);
  const targetQ = qRows.find(r => String(r[0]) === String(questionId));
  if (!targetQ) throw new Error("該当の問題が見つかりません");

  const correctAnswer = String(targetQ[9]).trim();
  const studentAnswer = String(selectedChoice).trim();
  const isCorrect = (studentAnswer.toUpperCase() === correctAnswer.toUpperCase());

  // ★ここで生徒本人の本物の学校メールアドレスを100%自動取得（なりすまし不可）
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
    studentAnswer,
    resultText
  ]);

  return {
    isCorrect: isCorrect,
    correctAnswer: correctAnswer,
    studentEmail: studentEmail
  };
}

// ユーティリティ: Googleドライブ共有リンクをWeb画像URLに変換
function convertDriveUrlToDirect(url) {
  if (!url) return "";
  if (url.includes("lh3.googleusercontent.com") || url.startsWith("data:")) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://lh3.googleusercontent.com/d/" + match[1];
  }
  return url;
}
