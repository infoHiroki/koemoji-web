# 🏗️ KoeMoji-Go Web アーキテクチャ

## 📋 概要

KoeMoji-Go WebはChrome拡張機能として動作する、あらゆる音声を文字起こし・要約するツールです。仮想オーディオデバイス経由でシステム音声をキャプチャするため、Web会議、デスクトップアプリ、ブラウザ音声など、アプリケーションの種類を問わず利用できます。

## 🎯 システム構成

### コアコンポーネント

```
┌─────────────────────────────────────────────────┐
│           Chrome Extension                       │
├─────────────────────────────────────────────────┤
│                                                  │
│  ┌──────────────┐  ┌──────────────┐            │
│  │   Popup UI   │  │   Settings   │            │
│  │  (popup.js)  │  │(settings.js) │            │
│  └──────┬───────┘  └──────┬───────┘            │
│         │                  │                     │
│         v                  v                     │
│  ┌─────────────────────────────────┐            │
│  │     Background Script            │            │
│  │     (background.js)              │            │
│  └──────────┬──────────────────────┘            │
│             │                                     │
│    ┌────────┴────────┐                          │
│    v                 v                          │
│  ┌──────────┐  ┌──────────────┐                │
│  │  Audio   │  │   OpenAI     │                │
│  │ Recorder │  │   Client     │                │
│  └──────────┘  └──────────────┘                │
│                                                  │
└─────────────────────────────────────────────────┘
         │                        │
         v                        v
   ┌─────────┐            ┌──────────────┐
   │ System  │            │  OpenAI API  │
   │ Audio   │            │  - Whisper   │
   │ (Any    │            │  - GPT-4     │
   │  App)   │            └──────────────┘
   └─────────┘
```

## 📁 プロジェクト構造

```
koemoji-web/
├── manifest.json          # Chrome拡張設定
├── background.js          # バックグラウンドスクリプト
├── content.js            # コンテンツスクリプト
│
├── popup/                # メインUI
│   ├── popup.html        # ポップアップHTML
│   ├── popup.js          # UI制御ロジック
│   └── popup.css         # スタイル
│
├── settings/             # 設定画面
│   ├── settings.html     # 設定HTML
│   └── settings.js       # 設定ロジック
│
├── lib/                  # コアライブラリ
│   ├── audio-recorder.js # 音声録音機能
│   ├── audio-encoder.js  # 音声エンコード
│   ├── openai-client.js  # OpenAI API統合
│   └── storage.js        # データ永続化
│
├── icons/                # 拡張機能アイコン
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── docs/                 # ドキュメント
    ├── ARCHITECTURE.md
    ├── SETUP_GUIDE.md
    ├── DEVELOPMENT.md
    └── API_REFERENCE.md
```

## 🔄 データフロー

### 1. 🎙️ 録音フロー

```
User Action (Click Record)
    │
    v
popup.js
    │
    v
background.js
    │
    ├─> audio-recorder.js
    │   │
    │   ├─> navigator.mediaDevices.getUserMedia()
    │   │   (仮想デバイス: BlackHole/VoiceMeeter)
    │   │
    │   └─> Web Audio API
    │       - MediaRecorder
    │       - AudioContext
    │
    v
Recording in progress...
    │
    v
User Action (Stop Recording)
    │
    v
audio-encoder.js
    │
    ├─> WAV/MP3エンコード
    └─> Blob生成
```

### 2. 📝 文字起こし・要約フロー

```
Audio Blob
    │
    v
openai-client.js
    │
    ├─> Whisper API
    │   - FormData送信
    │   - 音声 → テキスト変換
    │   └─> Transcript Text
    │
    v
openai-client.js
    │
    ├─> GPT-4 API
    │   - テキスト送信
    │   - プロンプト: 要約生成
    │   └─> Summary Text
    │
    v
storage.js
    │
    ├─> chrome.storage.local
    │   - 文字起こし保存
    │   - 要約保存
    │   - メタデータ保存
    │
    v
popup.js
    │
    └─> UI表示更新
```

## 🎯 コンポーネント詳細

### 1. ⚙️ Background Script (background.js)

**役割:**
- Chrome拡張のバックグラウンド処理
- 録音状態の管理
- API通信の制御

**主要機能:**
```javascript
// 録音制御
startRecording(deviceId)
stopRecording()

// API連携
transcribeAudio(audioBlob)
generateSummary(transcript)

// ストレージ管理
saveTranscript(data)
loadTranscripts()
```

### 2. 🎵 Audio Recorder (lib/audio-recorder.js)

**役割:**
- 音声デバイスの列挙
- 音声キャプチャ
- リアルタイム録音

**技術:**
- `navigator.mediaDevices.getUserMedia()`
- `MediaRecorder` API
- `AudioContext` API

**主要機能:**
```javascript
// デバイス列挙
async getAudioDevices()

// 録音開始
async startRecording(deviceId) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { deviceId: { exact: deviceId } }
  });

  const mediaRecorder = new MediaRecorder(stream);
  // 録音処理...
}

// 録音停止
stopRecording()

// 音声データ取得
getAudioBlob()
```

### 3. 🔊 Audio Encoder (lib/audio-encoder.js)

**役割:**
- 音声データのエンコード
- WAV/MP3形式への変換
- ファイルサイズ最適化

**主要機能:**
```javascript
// WAVエンコード
encodeWAV(audioBuffer, sampleRate, channels)

// MP3エンコード（オプション）
encodeMP3(audioBuffer)

// 圧縮
compressAudio(audioBlob, options)
```

### 4. 🤖 OpenAI Client (lib/openai-client.js)

**役割:**
- OpenAI API統合
- Whisper API呼び出し
- GPT-4 API呼び出し

**主要機能:**
```javascript
// Whisper API
async transcribe(audioBlob, options) {
  const formData = new FormData();
  formData.append('file', audioBlob, 'audio.wav');
  formData.append('model', 'whisper-1');
  formData.append('language', 'ja');

  const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${apiKey}` },
    body: formData
  });

  return await response.json();
}

// GPT-4 API
async summarize(transcript, prompt) {
  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: 'gpt-4',
      messages: [
        { role: 'system', content: 'あなたは会議の議事録作成アシスタントです。' },
        { role: 'user', content: `以下の会議の文字起こしを要約してください:\n\n${transcript}` }
      ]
    })
  });

  const data = await response.json();
  return data.choices[0].message.content;
}
```

### 5. 💾 Storage (lib/storage.js)

**役割:**
- データの永続化
- chrome.storage.local管理
- データの読み書き

**データ構造:**
```javascript
{
  "transcripts": [
    {
      "id": "uuid-v4",
      "timestamp": "2024-01-15T10:30:00Z",
      "title": "Team Meeting",
      "duration": 1800, // 秒
      "transcript": "文字起こしテキスト...",
      "summary": "AI要約...",
      "audioSize": 15728640, // バイト
      "platform": "google-meet" // or "zoom" or "unknown" (プラットフォーム非依存)
    }
  ],
  "settings": {
    "apiKey": "sk-...",
    "recordingDevice": "BlackHole 2ch",
    "language": "ja",
    "autoSummarize": true
  }
}
```

**主要機能:**
```javascript
// 設定
async saveSettings(settings)
async loadSettings()

// 文字起こし
async saveTranscript(transcript)
async loadTranscripts()
async deleteTranscript(id)

// APIキー
async saveApiKey(apiKey)
async getApiKey()
```

## 🔒 セキュリティ設計

### 1. 🔑 APIキー管理

**保存場所:**
- `chrome.storage.sync` - 暗号化されたストレージ
- Googleアカウントに紐付き（同期可能）

**アクセス制御:**
- Background scriptのみアクセス可能
- Popup/Content scriptからは直接アクセス不可

### 2. 🛡️ データプライバシー

**ローカル保存:**
- 文字起こし結果は `chrome.storage.local` に保存
- 外部サーバーへの送信なし（OpenAI API除く）

**データ削除:**
- ユーザーが明示的に削除可能
- Chrome拡張アンインストール時に自動削除

### 3. ✅ 権限最小化

**manifest.json permissions:**
```json
{
  "permissions": [
    "storage",           // データ保存
    "activeTab",         // アクティブタブ情報へのアクセス
    "offscreen",         // オフスクリーン録音
    "audioCapture"       // 音声キャプチャ
  ],
  "host_permissions": []  // プラットフォーム非依存のため不要
}
```

## ⚡ パフォーマンス設計

### 1. 🎵 音声処理

**録音品質:**
- サンプリングレート: 44.1kHz（デフォルト）
- ビット深度: 16bit
- チャンネル: モノラル

**ファイルサイズ見積もり:**
```
1時間の会議:
- 非圧縮WAV: 約300MB
- 圧縮MP3(64kbps): 約28MB
```

**最適化:**
- リアルタイム圧縮
- チャンク分割（長時間会議対応）

### 2. 📡 API通信

**Whisper API制限:**
- ファイルサイズ: 25MB以下
- 対策: 音声圧縮 + チャンク分割

**GPT-4制限:**
- トークン数: 128K（gpt-4-turbo）
- 対策: 長文は要約を段階的に生成

### 3. 🧠 メモリ管理

**録音中:**
- ストリーミング録音（メモリ蓄積なし）
- 定期的なチャンク書き込み

**処理後:**
- 音声データは即座に破棄
- テキストデータのみ保存

## ⚠️ エラーハンドリング

### 1. 🎙️ 録音エラー

**症状:**
- デバイスアクセス失敗
- 権限エラー

**対応:**
```javascript
try {
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
} catch (error) {
  if (error.name === 'NotAllowedError') {
    // マイク権限がない
    showPermissionDialog();
  } else if (error.name === 'NotFoundError') {
    // デバイスが見つからない
    showDeviceSelectionDialog();
  }
}
```

### 2. 📡 API エラー

**症状:**
- ネットワークエラー
- APIキー無効
- レート制限

**対応:**
```javascript
try {
  const response = await fetch(apiUrl, options);
  if (!response.ok) {
    if (response.status === 401) {
      // APIキー無効
      showApiKeyError();
    } else if (response.status === 429) {
      // レート制限
      showRateLimitError();
    }
  }
} catch (error) {
  // ネットワークエラー
  showNetworkError();
}
```

## 🚀 拡張性

### 💡 将来の機能拡張

1. **話者識別**
   - DOM監視による話者名取得
   - タイムスタンプマッピング

2. **リアルタイム転写**
   - ストリーミングWhisper API
   - WebSocket通信

3. **多言語対応**
   - UI多言語化
   - 自動言語検出

4. **クラウド同期**
   - 外部ストレージ統合
   - チーム共有機能

## 🛠️ 技術スタック

### 💻 フロントエンド
- **HTML5/CSS3** - UI構築
- **Vanilla JavaScript** - ロジック実装
- **Chrome Extension API** - 拡張機能制御

### 🎵 音声処理
- **Web Audio API** - 音声キャプチャ・処理
- **MediaRecorder API** - 録音機能
- **WAV Encoder** - 音声エンコード

### 🤖 API統合
- **OpenAI Whisper API** - 音声認識
- **OpenAI GPT-4 API** - AI要約

### 💾 データ管理
- **chrome.storage API** - ローカルストレージ
- **IndexedDB** - 大容量データ（将来）

## 📐 開発原則

### YAGNI（You Aren't Gonna Need It）
- 必要な機能のみ実装
- 過度な抽象化を避ける

### DRY（Don't Repeat Yourself）
- 共通ロジックのライブラリ化
- コードの重複排除

### KISS（Keep It Simple, Stupid）
- シンプルな設計
- 複雑性の最小化

## 📚 参考資料

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)
