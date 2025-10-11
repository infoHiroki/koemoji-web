# API リファレンス

KoeMoji-Go Webの内部APIとOpenAI API統合の詳細リファレンスです。

## 目次

- [内部API](#内部api)
  - [AudioRecorder](#audiorecorder)
  - [AudioEncoder](#audioencoder)
  - [OpenAIClient](#openai-client)
  - [Storage](#storage)
- [OpenAI API統合](#openai-api統合)
  - [Whisper API](#whisper-api)
  - [GPT-4 API](#gpt-4-api)
- [Chrome Extension API](#chrome-extension-api)
- [データ構造](#データ構造)

---

## 内部API

### AudioRecorder

音声録音機能を提供するクラス。

#### Constructor

```javascript
const recorder = new AudioRecorder();
```

#### Methods

##### `getAudioDevices()`

利用可能な音声入力デバイスを取得します。

```javascript
async getAudioDevices(): Promise<MediaDeviceInfo[]>
```

**戻り値:**
```javascript
[
  {
    deviceId: "default",
    groupId: "...",
    kind: "audioinput",
    label: "Default - Internal Microphone"
  },
  {
    deviceId: "abc123...",
    groupId: "...",
    kind: "audioinput",
    label: "BlackHole 2ch"
  }
]
```

**使用例:**
```javascript
const devices = await recorder.getAudioDevices();
const blackHole = devices.find(d => d.label.includes('BlackHole'));
console.log('BlackHole device ID:', blackHole.deviceId);
```

##### `start(deviceId)`

指定したデバイスで録音を開始します。

```javascript
async start(deviceId: string): Promise<void>
```

**パラメータ:**
- `deviceId` (string): 録音デバイスID

**エラー:**
- `NotAllowedError`: マイク権限がない
- `NotFoundError`: デバイスが見つからない
- `NotReadableError`: デバイスが使用中

**使用例:**
```javascript
try {
  await recorder.start('abc123...');
  console.log('Recording started');
} catch (error) {
  if (error.name === 'NotAllowedError') {
    alert('マイク権限を許可してください');
  }
}
```

##### `stop()`

録音を停止し、音声データを返します。

```javascript
async stop(): Promise<Blob>
```

**戻り値:**
- `Blob`: 録音された音声データ (audio/webm または audio/wav)

**使用例:**
```javascript
const audioBlob = await recorder.stop();
console.log('Audio size:', audioBlob.size, 'bytes');
```

##### `isRecording()`

録音中かどうかを確認します。

```javascript
isRecording(): boolean
```

**戻り値:**
- `boolean`: 録音中なら `true`

**使用例:**
```javascript
if (recorder.isRecording()) {
  console.log('Recording in progress...');
}
```

##### `getDuration()`

録音時間（秒）を取得します。

```javascript
getDuration(): number
```

**戻り値:**
- `number`: 録音時間（秒）

**使用例:**
```javascript
const duration = recorder.getDuration();
console.log(`Recorded ${duration} seconds`);
```

---

### AudioEncoder

音声エンコード機能を提供するクラス。

#### Methods

##### `encodeWAV(audioBuffer, sampleRate, channels)`

AudioBufferをWAV形式にエンコードします。

```javascript
encodeWAV(
  audioBuffer: AudioBuffer,
  sampleRate: number = 44100,
  channels: number = 1
): Blob
```

**パラメータ:**
- `audioBuffer` (AudioBuffer): Web Audio APIのAudioBuffer
- `sampleRate` (number): サンプリングレート（Hz）
- `channels` (number): チャンネル数（1=モノラル, 2=ステレオ）

**戻り値:**
- `Blob`: WAV形式の音声データ

**使用例:**
```javascript
const wavBlob = AudioEncoder.encodeWAV(audioBuffer, 44100, 1);
console.log('WAV size:', wavBlob.size);
```

##### `AudioEncoder.encode(audioBlob, options)`

音声Blobを指定形式に変換します。

```javascript
static async encode(
  audioBlob: Blob,
  options: {
    format?: string,   // 'webm' | 'wav' (デフォルト: 'webm')
    quality?: string   // 'low' | 'medium' | 'high' (デフォルト: 'medium')
  } = {}
): Promise<Blob>
```

**パラメータ:**
- `audioBlob` (Blob): 元の音声データ
- `options` (Object): エンコードオプション
  - `format`: 出力形式（'webm'はそのまま返す、'wav'はWAVに変換）
  - `quality`: 品質設定（将来の拡張用）

**戻り値:**
- `Blob`: エンコードされた音声データ

**使用例:**
```javascript
// WebM形式（そのまま）
const webm = await AudioEncoder.encode(audioBlob, {
  format: 'webm'
});

// WAV形式に変換
const wav = await AudioEncoder.encode(audioBlob, {
  format: 'wav'
});
console.log('WebM:', webm.size, 'WAV:', wav.size);
```

##### `splitAudio(audioBlob, chunkDuration)`

長い音声を複数のチャンクに分割します。

```javascript
async splitAudio(
  audioBlob: Blob,
  chunkDuration: number // 秒
): Promise<Blob[]>
```

**パラメータ:**
- `audioBlob` (Blob): 分割する音声データ
- `chunkDuration` (number): チャンクの長さ（秒）

**戻り値:**
- `Blob[]`: 分割された音声データの配列

**使用例:**
```javascript
// 1時間の録音を10分ごとに分割
const chunks = await AudioEncoder.splitAudio(audioBlob, 10 * 60);
console.log(`Split into ${chunks.length} chunks`);
```

---

### OpenAI Client

OpenAI API統合を提供するクラス。

#### Constructor

```javascript
const client = new OpenAIClient(apiKey);
```

**パラメータ:**
- `apiKey` (string): OpenAI APIキー

#### Methods

##### `transcribe(audioBlob, options)`

音声を文字起こしします。

```javascript
async transcribe(
  audioBlob: Blob,
  options: {
    language?: string,        // 言語コード (デフォルト: 'ja')
    prompt?: string,          // プロンプト（オプション）
    temperature?: number      // 0-1 (デフォルト: 0)
  } = {}
): Promise<TranscriptionResult>
```

**パラメータ:**
- `audioBlob` (Blob): 音声データ（25MB以下）
- `options` (Object): オプション

**戻り値:**
```javascript
{
  text: "文字起こし結果...",
  duration: 1800,  // 秒
  language: "ja"
}
```

**エラー:**
- APIキーが無効な場合: `Error('APIキーが無効です。設定を確認してください。')`
- ファイルサイズが25MBを超える場合: `Error('ファイルサイズが大きすぎます...')`
- ネットワークエラー: `Error(...)`

**使用例:**
```javascript
try {
  const result = await client.transcribe(audioBlob, {
    language: 'ja',
    temperature: 0
  });
  console.log('Transcript:', result.text);
} catch (error) {
  console.error('Transcription failed:', error.message);
}
```

##### `summarize(transcript, options)`

文字起こしテキストを要約します。

```javascript
async summarize(
  transcript: string,
  options: {
    model?: string,           // GPTモデル (デフォルト: 'gpt-4o-mini')
    maxTokens?: number,       // 最大トークン数 (デフォルト: 1000)
    temperature?: number,     // 0-2 (デフォルト: 0.7)
    customPrompt?: string     // カスタムプロンプト
  } = {}
): Promise<SummaryResult>
```

**パラメータ:**
- `transcript` (string): 文字起こしテキスト
- `options` (Object): オプション

**戻り値:**
```javascript
{
  summary: "会議の要約...",
  topics: ["議題1", "議題2"],
  actionItems: ["アクションアイテム1", "アクションアイテム2"],
  decisions: ["決定事項1"],
  tokens: 850  // 使用トークン数
}
```

**使用例:**
```javascript
const result = await client.summarize(transcript, {
  model: 'gpt-4o-mini',
  temperature: 0.5
});
console.log('Summary:', result.summary);
```

##### `estimateCost(audioBlob, transcriptLength)`

処理にかかるコストを見積もります。

```javascript
estimateCost(
  audioBlob: Blob,
  transcriptLength?: number
): {
  whisper: number,
  gpt4: number,
  total: number
}
```

**パラメータ:**
- `audioBlob` (Blob): 音声データ
- `transcriptLength` (number): 文字起こしの長さ（文字数）

**戻り値:**
```javascript
{
  whisper: 0.36,    // Whisper API料金（USD）
  gpt4: 0.15,       // GPT-4料金（USD）
  total: 0.51       // 合計（USD）
}
```

**使用例:**
```javascript
const cost = client.estimateCost(audioBlob, 5000);
console.log(`Estimated cost: $${cost.total.toFixed(2)}`);
```

---

### Storage

データ永続化を提供するクラス。

#### Methods

##### `saveSettings(settings)`

設定を保存します。

```javascript
async saveSettings(settings: Settings): Promise<void>
```

**パラメータ:**
```javascript
{
  apiKey: string,
  recordingDevice: string,
  language: string,
  autoSummarize: boolean
}
```

**使用例:**
```javascript
await Storage.saveSettings({
  apiKey: 'sk-...',
  recordingDevice: 'BlackHole 2ch',
  language: 'ja',
  autoSummarize: true
});
```

##### `loadSettings()`

設定を読み込みます。

```javascript
async loadSettings(): Promise<Settings>
```

**戻り値:**
```javascript
{
  apiKey: "sk-...",
  recordingDevice: "BlackHole 2ch",
  language: "ja",
  autoSummarize: true
}
```

##### `saveTranscript(transcript)`

文字起こし結果を保存します。

```javascript
async saveTranscript(transcript: Transcript): Promise<void>
```

**パラメータ:**
```javascript
{
  id: "uuid-v4",
  timestamp: "2024-01-15T10:30:00Z",
  title: "Team Meeting",
  duration: 1800,
  transcript: "文字起こし...",
  summary: "要約...",
  platform: "google-meet"
}
```

##### `loadTranscripts()`

すべての文字起こし結果を読み込みます。

```javascript
async loadTranscripts(): Promise<Transcript[]>
```

**戻り値:**
- `Transcript[]`: 文字起こし結果の配列（最新順）

##### `deleteTranscript(id)`

文字起こし結果を削除します。

```javascript
async deleteTranscript(id: string): Promise<void>
```

**パラメータ:**
- `id` (string): 削除する文字起こしのID

##### `updateTranscript(id, updates)`

文字起こし結果を更新します。

```javascript
async updateTranscript(
  id: string,
  updates: Partial<Transcript>
): Promise<void>
```

**パラメータ:**
- `id` (string): 更新する文字起こしのID
- `updates` (Object): 更新する項目（部分的なTranscriptオブジェクト）

**使用例:**
```javascript
await Storage.updateTranscript('abc123', {
  title: '新しいタイトル',
  summary: 'AI要約結果...'
});
```

##### `getTranscript(id)`

特定の文字起こし結果を取得します。

```javascript
async getTranscript(id: string): Promise<Transcript | null>
```

**パラメータ:**
- `id` (string): 取得する文字起こしのID

**戻り値:**
- `Transcript | null`: 文字起こし結果、見つからない場合はnull

##### `clearAll()`

すべてのデータをクリアします。

```javascript
async clearAll(): Promise<void>
```

**使用例:**
```javascript
await Storage.clearAll();
console.log('All data cleared');
```

##### `getStorageUsage()`

ストレージ使用量を取得します。

```javascript
async getStorageUsage(): Promise<{
  local: { bytes: number, mb: string },
  sync: { bytes: number, mb: string }
}>
```

**戻り値:**
```javascript
{
  local: {
    bytes: 1048576,
    mb: "1.00"
  },
  sync: {
    bytes: 512,
    mb: "0.00"
  }
}
```

##### `generateUUID()`

UUIDを生成します。

```javascript
static generateUUID(): string
```

**戻り値:**
- `string`: UUID v4形式の文字列

##### `createTranscript(data)`

文字起こしオブジェクトを作成します。

```javascript
static createTranscript(data: {
  title?: string,
  duration?: number,
  transcript?: string,
  summary?: string,
  audioSize?: number,
  platform?: string
}): Transcript
```

**パラメータ:**
- `data` (Object): 文字起こしデータ

**戻り値:**
- `Transcript`: 完全な文字起こしオブジェクト（IDとタイムスタンプが自動生成される）

**使用例:**
```javascript
const transcript = Storage.createTranscript({
  title: 'Team Meeting',
  duration: 1800,
  audioSize: 15728640,
  platform: 'google-meet'
});
console.log(transcript.id); // "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx"
```

---

## OpenAI API統合

### Whisper API

#### Endpoint

```
POST https://api.openai.com/v1/audio/transcriptions
```

#### Request

```javascript
const formData = new FormData();
formData.append('file', audioBlob, 'audio.wav');
formData.append('model', 'whisper-1');
formData.append('language', 'ja');
formData.append('temperature', '0');

const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`
  },
  body: formData
});
```

#### Response

```json
{
  "text": "文字起こし結果がここに入ります。"
}
```

#### 料金

- **$0.006 / 分**

#### 制限

- ファイルサイズ: 25MB以下
- 対応形式: mp3, mp4, mpeg, mpga, m4a, wav, webm

---

### GPT-4 API

#### Endpoint

```
POST https://api.openai.com/v1/chat/completions
```

#### Request

```javascript
const response = await fetch('https://api.openai.com/v1/chat/completions', {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json'
  },
  body: JSON.stringify({
    model: 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content: 'あなたは会議の議事録作成アシスタントです。'
      },
      {
        role: 'user',
        content: `以下の会議の文字起こしを要約してください:\n\n${transcript}`
      }
    ],
    temperature: 0.7,
    max_tokens: 1000
  })
});
```

#### Response

```json
{
  "choices": [
    {
      "message": {
        "role": "assistant",
        "content": "会議の要約:\n\n1. 主要な議題\n- ...\n"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 1500,
    "completion_tokens": 300,
    "total_tokens": 1800
  }
}
```

#### 料金

> **注意**: 最新の料金は[OpenAI Pricing](https://openai.com/pricing)を確認してください。

**GPT-4o Mini（推奨）:**
- Input: $0.00015 / 1K tokens
- Output: $0.0006 / 1K tokens

**GPT-4 Turbo:**
- Input: $0.01 / 1K tokens
- Output: $0.03 / 1K tokens

**GPT-4:**
- Input: $0.03 / 1K tokens
- Output: $0.06 / 1K tokens

---

## Chrome Extension API

### chrome.storage

#### 保存

```javascript
await chrome.storage.local.set({ key: value });
await chrome.storage.sync.set({ apiKey: 'sk-...' });
```

#### 読み込み

```javascript
const data = await chrome.storage.local.get('key');
console.log(data.key);

const { apiKey } = await chrome.storage.sync.get('apiKey');
```

#### 削除

```javascript
await chrome.storage.local.remove('key');
```

### chrome.runtime

#### メッセージ送信

**Promiseベース（推奨）:**
```javascript
// popup.js → background.js
const response = await chrome.runtime.sendMessage({
  action: 'startRecording',
  deviceId: 'abc123'
});
console.log('Response:', response);
```

**コールバックベース（Service Worker環境）:**
```javascript
// background.js内でのメッセージ送信
chrome.runtime.sendMessage(
  { action: 'startRecording', deviceId: 'abc123' },
  (response) => {
    if (chrome.runtime.lastError) {
      console.error('Error:', chrome.runtime.lastError);
    } else {
      console.log('Response:', response);
    }
  }
);
```

#### メッセージ受信

```javascript
// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'startRecording') {
    // 非同期処理の場合
    handleMessage(message).then(sendResponse);
    return true; // 非同期応答を有効化
  }
});

async function handleMessage(message) {
  // 非同期処理
  await startRecording(message.deviceId);
  return { success: true };
}
```

---

## データ構造

### Settings

```typescript
interface Settings {
  apiKey: string;              // OpenAI APIキー
  recordingDevice: string;     // 録音デバイスID
  language: string;            // 言語コード ('ja', 'en', etc.)
  autoSummarize: boolean;      // 自動要約ON/OFF
}
```

### Transcript

```typescript
interface Transcript {
  id: string;                  // UUID v4
  timestamp: string;           // ISO 8601形式
  title: string;               // タイトル
  duration: number;            // 録音時間（秒）
  transcript: string;          // 文字起こし結果
  summary?: string;            // AI要約（オプション）
  audioSize: number;           // 音声ファイルサイズ（バイト）
  platform: 'google-meet' | 'zoom' | 'unknown';  // プラットフォーム
}
```

### TranscriptionResult

```typescript
interface TranscriptionResult {
  text: string;                // 文字起こしテキスト
  duration: number;            // 音声の長さ（秒）
  language: string;            // 検出された言語
}
```

### SummaryResult

```typescript
interface SummaryResult {
  summary: string;             // 要約文
  topics: string[];            // 主要トピック
  actionItems: string[];       // アクションアイテム
  decisions: string[];         // 決定事項
  tokens: number;              // 使用トークン数
}
```

---

## エラーハンドリング

すべてのエラーは標準の`Error`クラスを使用します。

### AudioRecorder

エラーは`error.name`プロパティで識別できます：
- `NotAllowedError`: マイク権限がない
- `NotFoundError`: デバイスが見つからない
- `NotReadableError`: デバイスが使用中

```javascript
try {
  await recorder.start(deviceId);
} catch (error) {
  if (error.name === 'NotAllowedError') {
    console.error('マイクへのアクセス権限がありません');
  }
}
```

### OpenAIClient

エラーは`error.message`で内容を確認します：
- APIキー無効: "APIキーが無効です。設定を確認してください。"
- レート制限: "APIのレート制限に達しました..."
- ファイルサイズ超過: "ファイルサイズが大きすぎます。"

```javascript
try {
  await client.transcribe(audioBlob);
} catch (error) {
  console.error('Transcription error:', error.message);
}
```

### Storage

エラーは標準の`Error`として投げられます：

```javascript
try {
  await Storage.saveTranscript(transcript);
} catch (error) {
  console.error('Storage error:', error.message);
}
```

---

## バージョニング

### API Version

現在のバージョン: `v1.0.0`

### 互換性

- Chrome 88以降
- OpenAI API: 2024-01-01以降

---

## サポート

API に関する質問は以下まで:

- GitHub Issues: [koemoji-web/issues](https://github.com/infoHiroki/koemoji-web/issues)
- Email: koemoji2024@gmail.com
