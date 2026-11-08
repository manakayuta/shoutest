/**
 * ========================================================
 * 数学小テストシステム 最大6択対応版 (コード.gs)
 * ========================================================
 */

// 1. 生徒がアクセスした時に画面（HTML）を表示する
function doGet(e) {
  return HtmlService.createHtmlOutputFromFile("index")
    .setTitle("数学小テストシステム")
    .addMetaTag("viewport", "width=device-width, initial-scale=1.0")
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

// 2. 問題一覧の取得
function getQuestionListServer() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = ss.getSheetByName("問題一覧");
  if (!sheet) throw new Error("「問題一覧」シートが見つかりません");

  const data = sheet.getDataRange().getValues();
  if (data.length <= 1) return [];

  const rows = data.slice(1);
  return rows
    .filter(r => String(r[12]).trim() === "公開") // M列(インデックス12)が「公開」
    .map(r => ({
      questionId: String(r[0]),
      round: String(r[1]),
      title: String(r[2]),
      type: String(r[3])
    }));
}

// 3. 個別問題データの取得（最大6択まで対応）
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

  // F列(5)〜K列(10)の最大6択を取得し、空欄でないものだけを抽出
  const choices = [
    String(targetRow[5] || ""),  // 選択肢A
    String(targetRow[6] || ""),  // 選択肢B
    String(targetRow[7] || ""),  // 選択肢C
    String(targetRow[8] || ""),  // 選択肢D
    String(targetRow[9] || ""),  // 選択肢E
    String(targetRow[10] || "")  // 選択肢F
  ].filter(c => c.trim() !== "");

  return {
    questionId: String(targetRow[0]),
    round: String(targetRow[1]),
    questionTitle: `${targetRow[1]} ${targetRow[2]}`,
    type: String(targetRow[3]),
    imageUrl: directImageUrl,
    choices: choices.length > 0 ? choices : ["A", "B"]
  };
}

// 4. 解答の送信と成績記録
function submitAnswerServer(questionId, selectedChoice) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const qSheet = ss.getSheetByName("問題一覧");
  const aSheet = ss.getSheetByName("解答記録");

  if (!qSheet || !aSheet) throw new Error("必要なシートが見つかりません");

  const qRows = qSheet.getDataRange().getValues().slice(1);
  const targetQ = qRows.find(r => String(r[0]) === String(questionId));
  if (!targetQ) throw new Error("該当の問題が見つかりません");

  // L列(インデックス11)が「正解」
  const correctAnswer = String(targetQ[11]).trim();
  const studentAnswer = String(selectedChoice).trim();
  const isCorrect = (studentAnswer.toUpperCase() === correctAnswer.toUpperCase());

  // 生徒の学校メールアドレス
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

// Googleドライブ画像URLの自動変換
function convertDriveUrlToDirect(url) {
  if (!url) return "";
  if (url.includes("lh3.googleusercontent.com") || url.startsWith("data:")) return url;
  const match = url.match(/\/d\/([a-zA-Z0-9_-]+)/) || url.match(/id=([a-zA-Z0-9_-]+)/);
  if (match && match[1]) {
    return "https://lh3.googleusercontent.com/d/" + match[1];
  }
  return url;
}
