# Chromeウェブストア リリースチェックリスト

**最終更新: 2025-10-11**

## 進捗状況
- ✅ Phase 1: 事前準備 - **完了**
- 🔄 Phase 2: テスト - **進行中**
- ⏳ Phase 3: スクリーンショット - **未着手**
- ⏳ Phase 4: パッケージ化・提出 - **未着手**

---

## 1. 事前準備 ✅

- [x] アイコンの準備（16px, 48px, 128px）
- [x] manifest.jsonの完成
- [x] プライバシーポリシーの作成
- [x] README.mdの充実
- [x] .gitignoreの設定
- [x] ドキュメントの絵文字による改善
- [x] Chrome Web Store向けREADME更新
- [x] GitHubリポジトリ公開
- [x] リモートリポジトリへのpush

## 2. テスト 📝

- [ ] Chrome拡張として正常に動作するか確認
  - [ ] Google Meetで録音テスト
  - [ ] Zoomで録音テスト
  - [ ] 文字起こし機能のテスト
  - [ ] AI要約機能のテスト
  - [ ] 履歴機能のテスト
  - [ ] タイトル編集機能のテスト
  - [ ] ダウンロード機能のテスト

## 3. スクリーンショット撮影 📸

`screenshots/` ディレクトリに以下を保存：

- [x] `screenshot-01-main.png` - メイン画面（録音開始前） ✅ 1280x800
- [x] `screenshot-02-recording.png` - 録音中の画面 ✅ 1280x800
- [x] `screenshot-03-transcript.png` - 文字起こし＋AI要約結果表示 ✅ 1280x800
- [x] `screenshot-04-settings.png` - 設定画面（上部） ✅ 1280x800
- [x] `screenshot-05-settings-bottom.png` - 設定画面（下部・カスタムプロンプト） ✅ 1280x800

**サイズ要件:**
- 必須: 1280x800px または 640x400px ✅
- 最大5枚まで ✅
- PNG形式推奨 ✅
- ファイルサイズ: 各5MB以下 ✅

## 4. パッケージ化 📦

```bash
# プロジェクトディレクトリで実行
cd /Users/hirokitakamura/Documents/Dev/koemoji-web

# 不要なファイルを除外してZIPを作成
zip -r koemoji-web-v1.0.0.zip . \
  -x "*.git*" \
  -x "*node_modules*" \
  -x "*.DS_Store" \
  -x "*archive*" \
  -x "*.md" \
  -x "generate_icons.py" \
  -x "docs/*" \
  -x ".claude/*"
```

または、以下のファイル/フォルダのみを含めてZIP化：
- manifest.json
- background.js
- content.js
- offscreen.html
- offscreen.js
- popup/
- settings/
- icons/
- lib/

## 5. Chrome Developer Dashboardでの登録

### 5.1 アカウント登録

1. [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/) にアクセス
2. 初回の場合：$5の開発者登録料を支払い

### 5.2 新しいアイテムをアップロード

1. 「新しいアイテム」をクリック
2. ZIPファイルをアップロード
3. 必須情報を入力：

**基本情報**
- 拡張機能名: `KoeMoji-Go Web`
- 簡単な説明: `Web会議の音声を自動で文字起こし・AI要約。Google Meet・Zoom対応`
- 詳細な説明: README.mdの内容を参考に記載
- カテゴリ: `生産性ツール`
- 言語: `日本語`

**ストアの掲載情報**
- アイコン: `icons/icon-128.png`
- スクリーンショット: `screenshots/` から4-5枚
- プロモーション用画像（オプション）: 440x280px

**プライバシー**
- プライバシーポリシーURL: GitHub Pagesや独自サイトにPRIVACY_POLICY.mdをホスト
- 単一目的の説明: `Web会議の音声を文字起こし・要約するツール`
- 権限の正当化:
  - `storage`: ユーザー設定と履歴の保存
  - `activeTab`: 現在のタブ（Web会議）の情報取得
  - `offscreen`: バックグラウンドでの音声録音

**配布**
- 公開範囲: 公開 / 非公開
- 地域: すべての地域（または日本のみ）
- 価格: 無料

## 6. 審査提出 🚀

- [ ] すべての情報を入力
- [ ] プライバシーポリシーのURLを設定
- [ ] 「審査のために送信」をクリック

**審査期間**: 通常1-3営業日

## 7. 公開後 ✅

- [ ] Chrome Web Storeのリンクを取得
- [ ] README.mdにストアリンクを追加
- [ ] GitHubリポジトリを公開
- [ ] SNS等で告知

## トラブルシューティング

### 審査で却下された場合

よくある理由：
1. **プライバシーポリシーが不十分**: より詳細な説明を追加
2. **権限の正当化が不明確**: manifest.jsonのpermissionsの使用理由を明記
3. **スクリーンショットが不適切**: 実際の機能を示すスクリーンショットを追加

### 修正後の再提出

1. 指摘された問題を修正
2. バージョン番号を上げる（例: 1.0.0 → 1.0.1）
3. 新しいZIPをアップロード
4. 再度「審査のために送信」

## 参考リンク

- [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
- [Chrome拡張機能の公開ガイド](https://developer.chrome.com/docs/webstore/publish/)
- [審査ポリシー](https://developer.chrome.com/docs/webstore/program-policies/)

---

**注意**: OpenAI APIキーは各ユーザーが自分で取得・設定する必要があります。ストアの説明に明記してください。
