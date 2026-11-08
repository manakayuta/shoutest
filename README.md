# 数学 復習小テスト システム (Quick Math Quiz)

高校および中学校の数学の授業冒頭で実施する、生徒向け復習小テストWebシステムです。

---

## 🌐 本番WebアプリURL
- **生徒配布用**:  
  👉 **https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec**
- **教員専用「問題作成スタジオ」**:  
  👉 **https://script.google.com/a/macros/hjs.ed.jp/s/AKfycbxq7__DQzX4ci12QfJVhdmWMmAFzCa320LhOSOgl62e5q0idB9U5JJgwSURxRgNBgQk/exec?page=creator**

* 学校のGoogleアカウント（`hjs.ed.jp`）でログインしている生徒のPCから直接解くことで、生徒のメールアドレスが100%自動で記録され、なりすましを防ぎます。
* Google Classroom等にこのURLを1つ貼るだけで運用可能です。

---

## 🚀 主な機能・特徴

1. **2つの出題形式（ハイブリッド対応）**:
   - **選択式（2〜6択）**: 選択肢セルに入力された数だけボタン（A〜F）が自動整列（空欄セルは自動スキップ）。
   - **マーク式（共通テスト風穴埋めスロット）**: 問題画像の中の [ ア ] [ イ ] に対応するスロット枠が表示され、テンキーやPCキーボードから直接入力可能。
2. **直感的なUIと楽しい演出**:
   - 正解時には物理演算で弾けるカラフルな紙吹雪（Confetti）アニメーション🎉。
   - 不正解時にもシェイク演出と前向きな励ましメッセージを表示。
3. **小テスト一覧画面（過去回の復習・受け直し）**:
   - 公開中のテストが一覧で並び、合格済みのテストには「合格済み 🎉」バッジが表示されます。
4. **数式画像（Studyaid対応）**:
   - 数研出版のStudyaid等のスクショ画像をGoogleドライブに保存し、共有リンクを貼るだけで直リンク表示。
5. **完全自動の成績管理シート（Google スプレッドシート連携）**:
   - 生徒ごとの合格数自動カウント。
   - 何回目で合格したか（`⭕️ (3回)` など）の努力のプロセスを可視化。

---

## 📁 ファイル構成
- `gas_code.gs`: Google Apps Script バックエンドコード（API処理・画面配信・ドライブ画像保存・Geminiサーバー中継）
- `gas_index.html`: GASに貼り付ける生徒テスト画面コード（HTML+CSS+JS統合版）
- `gas_creator.html`: GASに貼り付ける教員専用問題作成スタジオコード（HTML+CSS+JS統合版、`?page=creator` で配信）
- `index.html` / `style.css` / `app.js`: 生徒画面用ソースコード
- `creator.html` / `creator.css` / `creator.js`: 教員専用問題作成スタジオのソースコード（編集後は `gas_creator.html` へ再バンドル）
- `HANDOVER.md`: 開発の流れ・技術仕様・GAS制約・別PCへの引き継ぎ手順をすべて記録した完全ドキュメント
