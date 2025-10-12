# KoeMoji-Go Web

Web会議専用AI文字起こし・要約Chrome拡張機能

## 概要

KoeMoji-Go Webは、Google MeetやZoomなどのWeb会議を自動で文字起こし・要約するChrome拡張機能です。デスクトップ版[KoeMoji-Go](https://github.com/infoHiroki/KoeMoji-Go)と同じ高品質な音声認識とAI要約を、ブラウザで手軽に利用できます。

### 特徴

- 🎙️ **完全な音声録音** - マイク入力とシステム音声を同時録音
- 🤖 **高精度文字起こし** - OpenAI Whisper APIによる音声認識
- 📝 **AI自動要約** - GPT-4による議事録自動生成
- 🔒 **プライバシー重視** - ローカルストレージ保存、外部流出なし
- ⚡ **ワンクリック録音** - 会議中に簡単操作
- 🌐 **アプリ非依存** - すべての音声アプリに対応（Meet、Zoom、Teams、Discord等）

## 🚀 クイックスタート

### 📦 インストール

#### 1. Chrome Web Storeからインストール

> **注意**: Chrome Web Store公開準備中です。現在は開発版のみ利用可能です。

**Chrome Web Store公開後:**
1. [KoeMoji-Go Web - Chrome Web Store](https://chrome.google.com/webstore/) にアクセス
2. 「Chromeに追加」ボタンをクリック
3. 確認ダイアログで「拡張機能を追加」をクリック

#### 2. セットアップ

**重要**: マイクとシステム音声を同時録音するため、仮想オーディオデバイスのセットアップが必要です。

##### macOS
- **BlackHole** 2ch のインストール
- Audio MIDI設定で集約デバイス作成

##### Windows
- **VoiceMeeter** のインストール
- 音声ルーティング設定

📖 詳細は [セットアップガイド](documentation/SETUP_GUIDE.md) をご覧ください。

#### 3. OpenAI APIキーの設定

1. 拡張機能アイコン（🎙️）をクリック
2. 「⚙️ 設定」を開く
3. OpenAI APIキーを入力
4. 録音デバイスを選択（BlackHole/VoiceMeeter）
5. 「設定を保存」をクリック

🔑 [OpenAI APIキーの取得方法](https://platform.openai.com/api-keys)

### 基本的な使い方

#### 1. 会議の録音

1. Google MeetまたはZoom（ブラウザ版）で会議を開始
2. Chrome拡張機能アイコンをクリック
3. **🔴 Start Recording** をクリック
4. 会議終了時に **⏹️ Stop & Transcribe** をクリック

#### 2. 文字起こし・要約の確認

録音停止後、自動的に:
- 📝 文字起こし生成（Whisper API）
- 📋 AI要約生成（GPT-4）

結果はポップアップ画面に表示されます。

#### 3. 結果の利用

- **📋 Copy** - クリップボードにコピー
- **💾 Download** - テキストファイルとしてダウンロード
- **🗑️ Delete** - 不要な記録を削除

## 対応環境

### ブラウザ
- Google Chrome（推奨）
- Microsoft Edge
- Brave
- その他Chromium系ブラウザ

### 対応アプリケーション
システムオーディオをキャプチャするため、**あらゆる音声アプリケーション**に対応：
- ✅ Web会議: Google Meet、Zoom、Microsoft Teams、Webex、Discord等
- ✅ デスクトップアプリ: Zoom、Teams、Slackデスクトップアプリ等
- ✅ ブラウザ音声: YouTube、ポッドキャスト等

**仮想オーディオデバイス経由で録音するため、アプリケーションの種類を問いません。**

### OS
- macOS 10.15以上
- Windows 10/11

## API料金

### OpenAI API使用料金（目安）

| 会議時間 | Whisper API | GPT-4 API | 合計 |
|---------|-------------|-----------|------|
| 30分 | $0.18 | $0.05-0.10 | $0.23-0.28 |
| 1時間 | $0.36 | $0.10-0.20 | $0.46-0.56 |

※ GPT-4料金は文字起こしのテキスト量により変動

## デスクトップ版との比較

| 機能 | KoeMoji-Go Web | KoeMoji-Go Desktop |
|------|----------------|-------------------|
| インストール | Chrome拡張 | 実行ファイル |
| 対応環境 | Web会議 | ローカル音声全般 |
| 文字起こし | Whisper API | Whisper API |
| AI要約 | GPT-4 | GPT-4 |
| ファイル処理 | なし | 自動監視・一括処理 |
| 用途 | Web会議特化 | 汎用音声文字起こし |

**両方使うことで完璧なカバレッジ！**

## ドキュメント

- 📖 [技術アーキテクチャ](documentation/ARCHITECTURE.md)
- 🔧 [セットアップガイド](documentation/SETUP_GUIDE.md)
- 💻 [開発ガイド](documentation/DEVELOPMENT.md)
- 📚 [API リファレンス](documentation/API_REFERENCE.md)

## トラブルシューティング

### 録音ができない

**症状**: 録音ボタンをクリックしても録音が開始されない

**解決策**:
1. BlackHole/VoiceMeeterが正しくインストールされているか確認
2. Chrome拡張の設定で録音デバイスを確認
3. Chromeのマイク権限を確認

### 自分の声が録音されない

**原因**: システム音声のみがキャプチャされている

**解決策**:
- macOS: 集約デバイスにマイクとBlackHoleの両方が含まれているか確認
- Windows: VoiceMeeterでマイク入力が有効か確認

### 文字起こしが失敗する

**原因**: OpenAI APIキーの問題、またはネットワークエラー

**解決策**:
1. APIキーが正しく設定されているか確認
2. APIキーの利用制限を確認
3. ネットワーク接続を確認

## 💻 開発者向け

### 開発版のインストール

**開発者またはChrome Web Store公開前のテストユーザー向け:**

1. **リポジトリをクローン**
   ```bash
   git clone https://github.com/infoHiroki/koemoji-web.git
   cd koemoji-web
   ```

2. **Chrome拡張として読み込み**
   - Chrome拡張機能ページを開く: `chrome://extensions/`
   - 「デベロッパーモード」を有効化
   - 「パッケージ化されていない拡張機能を読み込む」
   - `koemoji-web` フォルダを選択

3. **セットアップと設定**
   - 上記「クイックスタート」の手順2-3に従う

📖 詳細は [開発ガイド](documentation/DEVELOPMENT.md) を参照。

### 技術スタック

- **Chrome Extension Manifest V3**
- **Vanilla JavaScript** - フレームワーク不要
- **Web Audio API** - 音声録音
- **OpenAI Whisper API** - 音声認識
- **OpenAI GPT-4 API** - AI要約

## ライセンス

**個人利用**: 自由に使用可能
**商用利用**: 事前連絡が必要

詳細は [LICENSE](LICENSE) ファイルをご確認ください。

## 作者

KoeMoji-Go開発チーム
連絡先: koemoji2024@gmail.com

## 関連プロジェクト

- [KoeMoji-Go Desktop](https://github.com/infoHiroki/KoeMoji-Go) - デスクトップ版音声文字起こしツール

## サポート

問題が発生した場合は、[GitHub Issues](https://github.com/infoHiroki/koemoji-web/issues) で報告してください。
