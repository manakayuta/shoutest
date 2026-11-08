# 数学 復習小テスト Webアプリ (Quick Math Quiz)

高校の数学の授業冒頭で実施する、生徒向け4択復習小テストシステムです。

## 🌐 本番WebアプリURL（生徒配布用）
👉 **https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec**

※学校アカウント（`hjs.ed.jp`）でログインしている生徒のPCから直接解くことで、生徒のメールアドレスが100%自動で記録され、なりすましを防ぎます。

## 特徴
- **即座に解答＆フィードバック**: 生徒が選択肢を選ぶと、二重送信を防ぎつつ即座に送信・判定。
- **直感的なUI＆楽しい演出**: 正解時には紙吹雪（Confetti）の物理演算アニメーション、不正解時にも励ましのシェイク演出。
- **数式画像の最適化**: Studyaidやスクショ画像をGoogleドライブ経由で美しく表示。
- **小テスト一覧画面**: 過去回の復習・受け直しに対応。
- **成績一覧の自動マトリクス**: 何回目で合格したか（努力のプロセス）を全自動集計。

## ファイル構成
- `index.html`: 画面の骨組み（ローディング、問題表示、結果表示）
- `style.css`: スタイリング・レスポンシブデザイン・アニメーション定義
- `app.js`: GAS APIとの通信（GET/POST）、画面切り替え、紙吹雪パーティクル演出

## バックエンド（Google Apps Script）との連携方法
1. Google Apps Script で Web アプリとしてデプロイし、公開URLを取得します。
2. `app.js` の先頭にある `GAS_WEB_APP_URL` に、取得したURLを設定します。
   ```javascript
   const GAS_WEB_APP_URL = "https://script.google.com/macros/s/XXXXX/exec";
   ```
