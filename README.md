# 数学 復習小テスト Webアプリ (Quick Math Quiz)

高校の数学の授業冒頭で実施する、生徒向け4択復習小テストのフロントエンドWebアプリケーションです。

## 特徴
- **即座に解答＆フィードバック**: 生徒が選択肢を選ぶと、二重送信を防ぎつつ即座に送信・判定。
- **直感的なUI＆楽しい演出**: 正解時には紙吹雪（Confetti）の物理演算アニメーション、不正解時にも励ましのシェイク演出。
- **数式画像の最適化**: Google ドライブ上の問題画像を美しくレスポンシブ表示。
- **Google Workspace 連携**: 生徒側の名前入力不要（GAS側で実行アカウントを自動判別）。
- **デモモード搭載**: GASが未設定でも、ブラウザで開くだけで動作確認が可能。

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
