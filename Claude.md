# KoeMoji-Go Web - Claude AI Reference

このドキュメントは、Claude Code（AI開発アシスタント）がプロジェクトを理解するための参照情報です。

## プロジェクト概要

**KoeMoji-Go Web**は、あらゆる音声を自動で文字起こし・AI要約するChrome拡張機能です。仮想オーディオデバイス（BlackHole/VoiceMeeter）経由でシステム音声をキャプチャするため、Web会議、デスクトップアプリ、ブラウザ音声など、アプリケーションの種類を問わず利用できます。

### 関連プロジェクト
- **デスクトップ版**: `/Users/hirokitakamura/Documents/Dev/KoeMoji-Go`
  - Go言語で実装されたデスクトップアプリケーション
  - PortAudioを使用した音声録音機能
  - Whisper API + GPT-4による文字起こし・要約
  - 同じセットアップ手順（BlackHole/VoiceMeeter）を共有

## 技術スタック

### 言語・フレームワーク
- **Vanilla JavaScript** (フレームワーク不使用)
- **HTML5/CSS3**
- **Chrome Extension Manifest V3**

### API
- **OpenAI Whisper API** - 音声認識
- **OpenAI GPT-4 API** - AI要約

### ブラウザAPI
- **Web Audio API** - 音声キャプチャ・処理
- **MediaRecorder API** - 録音機能
- **chrome.storage API** - データ永続化
- **chrome.runtime API** - バックグラウンド通信

## アーキテクチャ

### コンポーネント構成

```
Chrome Extension
├── Background Script (background.js)
│   └── 録音制御、API通信、状態管理
├── Popup UI (popup/)
│   └── メインUI、ユーザー操作
├── Settings (settings/)
│   └── 設定画面、デバイス選択、APIキー管理
├── Content Script (content.js)
│   └── プラットフォーム検出（将来の話者識別用、現在は未使用）
└── Libraries (lib/)
    ├── audio-recorder.js - 音声録音
    ├── audio-encoder.js - WAV/MP3エンコード
    ├── openai-client.js - OpenAI API統合
    └── storage.js - データ永続化
```

### 音声処理フロー

```
1. ユーザーが録音開始
2. getUserMedia で仮想デバイス（BlackHole/VoiceMeeter）から音声取得
3. Web Audio API で録音
4. 録音停止 → WAVエンコード
5. Whisper API → 文字起こし
6. GPT-4 API → 要約生成
7. chrome.storage に保存
8. UI に表示
```

### データフロー

```
User Input (popup.js)
    ↓
Background Script (background.js)
    ↓
Audio Recorder (lib/audio-recorder.js)
    ↓
Audio Encoder (lib/audio-encoder.js)
    ↓
OpenAI Client (lib/openai-client.js)
    ↓
Storage (lib/storage.js)
    ↓
Popup UI Update
```

## 重要な技術的前提

### 音声キャプチャの制約

**問題**: Chrome拡張で`chrome.tabCapture`を使うと、タブの音声（他の参加者）のみ取得され、マイク入力（自分の声）は含まれない。

**解決策**: システムオーディオミキシング
- **macOS**: BlackHole + Audio MIDI設定で集約デバイス作成
- **Windows**: VoiceMeeter で音声ルーティング

これにより、マイク入力とシステム音声を1つの仮想デバイスにミックスし、`getUserMedia`で完全な音声を取得。

### デスクトップ版との統一性

- 同じセットアップ手順（BlackHole/VoiceMeeter）
- 同じOpenAI APIキー
- 同じ音声処理品質

ユーザーは一度セットアップすれば、デスクトップ版とWeb版の両方を使える。

## 開発原則

### YAGNI（You Aren't Gonna Need It）
- 必要な機能のみ実装
- 過度な抽象化を避ける
- MVP思考を維持

### DRY（Don't Repeat Yourself）
- 共通ロジックをライブラリ化（lib/）
- コードの重複を排除
- 再利用可能な関数設計

### KISS（Keep It Simple, Stupid）
- シンプルな設計
- Vanilla JavaScript（フレームワーク不使用）
- 複雑性の最小化

## ファイル構造

```
koemoji-web/
├── manifest.json          # Chrome拡張設定
├── background.js          # バックグラウンドスクリプト
├── content.js             # コンテンツスクリプト
├── popup/
│   ├── popup.html         # メインUI
│   ├── popup.js           # UI制御
│   └── popup.css          # スタイル
├── settings/
│   ├── settings.html      # 設定画面
│   └── settings.js        # 設定ロジック
├── lib/
│   ├── audio-recorder.js  # 音声録音機能
│   ├── audio-encoder.js   # 音声エンコード
│   ├── openai-client.js   # OpenAI API統合
│   └── storage.js         # データ永続化
├── icons/
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
├── docs/
│   ├── ARCHITECTURE.md    # 技術アーキテクチャ
│   ├── SETUP_GUIDE.md     # セットアップ手順
│   ├── DEVELOPMENT.md     # 開発ガイド
│   └── API_REFERENCE.md   # API リファレンス
├── README.md              # プロジェクト概要
├── .gitignore
└── Claude.md              # このファイル
```

## コーディングスタイル

### JavaScript

```javascript
// ✅ Good
const audioRecorder = new AudioRecorder();
let isRecording = false;

const startRecording = async (deviceId) => {
  try {
    await recorder.start(deviceId);
  } catch (error) {
    console.error('Recording failed:', error);
    throw error;
  }
};

// ❌ Bad
var recorder = new AudioRecorder()
function startRecording(deviceId) {
  recorder.start(deviceId)
}
```

### 非同期処理

- **async/await** 使用（Promiseチェーン禁止）
- 適切なエラーハンドリング（try-catch）
- エラーメッセージをユーザーフレンドリーに

### 命名規則

- **変数**: camelCase (`audioRecorder`)
- **定数**: UPPER_SNAKE_CASE (`MAX_FILE_SIZE`)
- **クラス**: PascalCase (`AudioRecorder`)
- **ファイル**: kebab-case (`audio-recorder.js`)

## データ構造

### Settings

```javascript
{
  apiKey: "sk-...",              // OpenAI APIキー
  recordingDevice: "BlackHole 2ch", // 録音デバイス
  language: "ja",                // 言語
  autoSummarize: true            // 自動要約ON/OFF
}
```

### Transcript

```javascript
{
  id: "uuid-v4",
  timestamp: "2024-01-15T10:30:00Z",
  title: "Team Meeting",
  duration: 1800,                // 秒
  transcript: "文字起こし...",
  summary: "要約...",
  audioSize: 15728640,           // バイト
  platform: "google-meet"        // or "zoom" or "unknown" (プラットフォーム非依存)
}
```

## OpenAI API使用

### Whisper API

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'audio.wav');
formData.append('model', 'whisper-1');
formData.append('language', 'ja');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${apiKey}` },
  body: formData
});
```

**料金**: $0.006/分

**制限**: 25MB以下

### GPT-4 API

```javascript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4-turbo',
    messages: [
      { role: 'system', content: 'あなたは会議の議事録作成アシスタントです。' },
      { role: 'user', content: `以下の会議の文字起こしを要約してください:\n\n${transcript}` }
    ]
  })
});
```

**料金**:
- Input: $0.01/1K tokens
- Output: $0.03/1K tokens

## セキュリティ

### APIキー管理
- `chrome.storage.sync` で暗号化保存
- ソースコードに直接記述禁止
- `.gitignore` でローカル設定ファイルを除外

### XSS対策
- `textContent` 使用（`innerHTML` 禁止）
- ユーザー入力の適切なサニタイズ

### データプライバシー
- ローカルストレージ保存（外部送信なし）
- ユーザーが明示的に削除可能

## パフォーマンス

### 音声処理
- サンプリングレート: 44.1kHz
- ビット深度: 16bit
- チャンネル: モノラル
- ファイルサイズ見積もり: 1時間 ≈ 28MB（圧縮後）

### API最適化
- 大きなファイルはチャンク分割（10分ごと）
- 並列処理で複数チャンクを同時送信

### メモリ管理
- 音声データは処理後すぐに破棄
- ストレージは最新20件のみ保持

## テスト方針

### 手動テスト
1. **録音機能**: Web会議や音声アプリで実際に録音（Google Meet、Zoom、YouTube等）
2. **文字起こし**: 自分の声が正しく認識されるか
3. **要約**: 適切な要約が生成されるか
4. **エラーハンドリング**: 無効なAPIキー、ネットワークエラー等

### 自動テスト（将来）
- Jest でユニットテスト
- Playwright でE2Eテスト

## トラブルシューティング

### よくある問題

1. **録音できない**
   - マイク権限を確認
   - BlackHole/VoiceMeeterが正しくインストールされているか

2. **自分の声が録音されない**
   - 集約デバイスにマイクが含まれているか（macOS）
   - VoiceMeeterでマイク入力が有効か（Windows）

3. **文字起こしが失敗**
   - APIキーが有効か
   - ファイルサイズが25MB以下か
   - ネットワーク接続を確認

## 開発の進め方

### MVP開発順序

1. **Phase 1: 基本UI** (1週間)
   - popup.html/css/js
   - settings.html/js

2. **Phase 2: 録音機能** (1週間)
   - lib/audio-recorder.js
   - lib/audio-encoder.js

3. **Phase 3: API統合** (1-2週間)
   - lib/openai-client.js
   - lib/storage.js
   - background.js

4. **Phase 4: 仕上げ** (1週間)
   - content.js
   - UI改善
   - テスト・デバッグ

**合計**: 3-5週間

## 参考リソース

### ドキュメント
- `/docs/ARCHITECTURE.md` - 詳細な技術設計
- `/docs/SETUP_GUIDE.md` - セットアップ手順
- `/docs/DEVELOPMENT.md` - 開発ガイド
- `/docs/API_REFERENCE.md` - API仕様

### デスクトップ版
- `/Users/hirokitakamura/Documents/Dev/KoeMoji-Go`
- 特に参考になるファイル:
  - `docs/user/RECORDING_SETUP.md` - 音声セットアップ
  - `internal/recorder/wav.go` - WAVエンコード実装

### 公式ドキュメント
- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [OpenAI API](https://platform.openai.com/docs/api-reference)

## Claude AI へのガイドライン

### コード生成時
- YAGNI/DRY/KISS原則を厳守
- async/await を使用
- 適切なエラーハンドリング
- セミコロンを付ける
- わかりやすいコメント（日本語）

### ファイル作成時
- 既存の構造に従う
- 適切な場所に配置
- 依存関係を明確に

### デバッグ時
- console.log で適切にログ出力
- エラーメッセージをわかりやすく
- ユーザーフレンドリーなエラー表示

### レビュー時
- セキュリティリスクを指摘
- パフォーマンス問題を指摘
- より良い実装方法を提案

## Git コミットルール

### コミットメッセージ形式

すべてのコミットメッセージは以下の形式に従います：

```
<emoji> <type>: <subject>

<body>（オプション）
```

### 絵文字プレフィックス

コミットの先頭に絵文字を付けて、変更の種類を視覚的に表現します：

- ✨ `:sparkles:` - 新機能追加
- 🐛 `:bug:` - バグ修正
- 📝 `:memo:` - ドキュメント追加・更新
- 🎨 `:art:` - コードのフォーマット、構造改善（機能変更なし）
- ♻️ `:recycle:` - リファクタリング
- ⚡ `:zap:` - パフォーマンス改善
- 🔧 `:wrench:` - 設定ファイル変更
- ✅ `:white_check_mark:` - テスト追加・更新
- 🚀 `:rocket:` - デプロイ関連
- 🔒 `:lock:` - セキュリティ修正
- 🚧 `:construction:` - WIP（作業中）
- 🗑️ `:wastebasket:` - ファイル・コード削除
- 🎉 `:tada:` - 初回コミット
- 🔖 `:bookmark:` - バージョンタグ

### アトミックコミット

**1コミット = 1つの論理的変更**

- ✅ **Good**: 1つの機能、1つのバグ修正、1つのリファクタリング
- ❌ **Bad**: 複数の無関係な変更を1つのコミットに含める

### コミット例

```bash
# 新機能追加
✨ feat: Add audio recording functionality

Implement audio-recorder.js with getUserMedia API
Support BlackHole/VoiceMeeter device selection

# バグ修正
🐛 fix: Resolve microphone permission error

Add proper error handling for NotAllowedError
Display user-friendly permission dialog

# ドキュメント
📝 docs: Update setup guide for Windows

Add VoiceMeeter installation steps
Include troubleshooting section

# リファクタリング
♻️ refactor: Extract audio encoding logic

Move WAV encoding to audio-encoder.js
Improve code reusability

# 初回コミット
🎉 initial: Setup project structure and documentation
```

### Subject（件名）ルール

- 50文字以内
- 命令形（"Add" not "Added"）
- 英語推奨（日本語も可）
- 末尾にピリオド不要

### Body（本文）ルール

- 72文字で改行
- 「なぜ」この変更が必要か説明
- 「何を」変更したかはdiffで分かるので詳細不要

### コミット頻度

- 意味のある単位で細かくコミット
- 機能が完成していなくてもWIPコミット可（🚧使用）
- 1日の終わりに必ずコミット

### レビュー前のクリーンアップ

プルリクエスト前に不要なコミットをまとめる：

```bash
# 直近3つのコミットをまとめる
git rebase -i HEAD~3
```

### NG例

```bash
# ❌ Bad: 絵文字なし
git commit -m "fix bug"

# ❌ Bad: 説明が不明確
git commit -m "update"

# ❌ Bad: 複数の変更を1つに
git commit -m "Add feature, fix bugs, update docs"

# ❌ Bad: 過去形
git commit -m "Added recording feature"
```

### OK例

```bash
# ✅ Good
git commit -m "✨ feat: Add recording device selection UI"

# ✅ Good
git commit -m "🐛 fix: Handle API rate limit error"

# ✅ Good
git commit -m "📝 docs: Add API reference for OpenAI client"
```

## 連絡先

- GitHub: (準備中)
- Email: koemoji2024@gmail.com

---

最終更新: 2025-10-10
バージョン: 1.0.0
