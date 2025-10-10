# 開発ガイド

KoeMoji-Go Web Chrome拡張機能の開発方法を説明します。

## 開発環境

### 必要なもの

- **Google Chrome** 最新版
- **テキストエディタ** - VS Code推奨
- **OpenAI APIキー** - [取得方法](https://platform.openai.com/api-keys)
- **仮想オーディオデバイス**
  - macOS: BlackHole
  - Windows: VoiceMeeter

### 推奨VS Code拡張機能

```json
{
  "recommendations": [
    "dbaeumer.vscode-eslint",
    "esbenp.prettier-vscode",
    "ms-vscode.vscode-json"
  ]
}
```

## プロジェクトのセットアップ

### 1. リポジトリのクローン

```bash
git clone https://github.com/infoHiroki/koemoji-web.git
cd koemoji-web
```

### 2. Chrome拡張として読み込み

1. Chromeを開く
2. アドレスバーに `chrome://extensions/` と入力
3. 右上の「デベロッパーモード」を有効化
4. 「パッケージ化されていない拡張機能を読み込む」をクリック
5. `koemoji-web` フォルダを選択

### 3. 開発の開始

```bash
# エディタを開く
code .

# または任意のエディタで開発開始
```

## プロジェクト構造

```
koemoji-web/
├── manifest.json          # Chrome拡張設定
├── background.js          # バックグラウンドスクリプト
├── content.js            # コンテンツスクリプト
│
├── popup/                # メインUI
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
│
├── settings/             # 設定画面
│   ├── settings.html
│   └── settings.js
│
├── lib/                  # コアライブラリ
│   ├── audio-recorder.js
│   ├── audio-encoder.js
│   ├── openai-client.js
│   └── storage.js
│
├── icons/                # アイコン
│   ├── icon-16.png
│   ├── icon-48.png
│   └── icon-128.png
│
└── docs/                 # ドキュメント
```

## 開発フロー

### 1. 機能追加の手順

```bash
# 1. ブランチを作成
git checkout -b feature/your-feature-name

# 2. コードを編集
# ...

# 3. Chrome拡張をリロード
# chrome://extensions/ で「更新」ボタンをクリック

# 4. テスト
# Google Meetなどで動作確認

# 5. コミット
git add .
git commit -m "Add your feature description"

# 6. プッシュ
git push origin feature/your-feature-name
```

### 2. デバッグ方法

#### Background Script

1. `chrome://extensions/` を開く
2. KoeMoji-Go Webの「サービスワーカー」リンクをクリック
3. DevToolsが開く
4. `console.log()` で出力確認

```javascript
// background.js
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message); // デバッグ出力
  // ...
});
```

#### Popup Script

1. 拡張機能アイコンを右クリック
2. 「検証」を選択
3. DevToolsが開く
4. Consoleタブで出力確認

```javascript
// popup.js
document.getElementById('startBtn').addEventListener('click', () => {
  console.log('Start button clicked'); // デバッグ出力
  // ...
});
```

#### Content Script

1. Google Meetなどの対象ページを開く
2. 右クリック → 「検証」
3. Consoleタブで出力確認

```javascript
// content.js
console.log('Content script loaded on:', window.location.href);
```

### 3. ホットリロード

拡張機能の変更後は手動でリロードが必要です:

1. `chrome://extensions/` を開く
2. 拡張機能の「更新」ボタンをクリック
3. またはキーボードショートカット: `Ctrl+R` (Windows) / `Cmd+R` (Mac)

## コーディング規約

### JavaScript

#### スタイルガイド

```javascript
// ✅ Good: const/let使用、セミコロンあり
const audioRecorder = new AudioRecorder();
let isRecording = false;

// ❌ Bad: var使用、セミコロンなし
var audioRecorder = new AudioRecorder()
var isRecording = false

// ✅ Good: アロー関数
const startRecording = async () => {
  // ...
};

// ✅ Good: 明確な命名
const getUserMediaStream = async (deviceId) => {
  // ...
};

// ❌ Bad: 不明確な命名
const getStuff = async (id) => {
  // ...
};
```

#### エラーハンドリング

```javascript
// ✅ Good: try-catchで適切にハンドリング
async function transcribeAudio(audioBlob) {
  try {
    const response = await fetch(apiUrl, options);
    if (!response.ok) {
      throw new Error(`API error: ${response.status}`);
    }
    return await response.json();
  } catch (error) {
    console.error('Transcription failed:', error);
    showErrorNotification(error.message);
    throw error;
  }
}

// ❌ Bad: エラーを無視
async function transcribeAudio(audioBlob) {
  const response = await fetch(apiUrl, options);
  return await response.json();
}
```

#### 非同期処理

```javascript
// ✅ Good: async/await使用
const processRecording = async () => {
  const audioBlob = await recorder.stop();
  const transcript = await transcribe(audioBlob);
  const summary = await summarize(transcript);
  return { transcript, summary };
};

// ❌ Bad: Promiseチェーン
const processRecording = () => {
  return recorder.stop()
    .then(audioBlob => transcribe(audioBlob))
    .then(transcript => summarize(transcript))
    // ...
};
```

### HTML/CSS

```html
<!-- ✅ Good: セマンティックHTML -->
<main class="popup-container">
  <header class="popup-header">
    <h1>KoeMoji-Go Web</h1>
  </header>
  <section class="recording-controls">
    <button id="startBtn" class="btn btn-primary">
      Start Recording
    </button>
  </section>
</main>

<!-- ❌ Bad: div多用 -->
<div class="container">
  <div class="header">
    <div>KoeMoji-Go Web</div>
  </div>
  <div class="controls">
    <div id="startBtn" class="button">Start Recording</div>
  </div>
</div>
```

```css
/* ✅ Good: BEM命名規則 */
.popup-container {
  padding: 16px;
}

.popup-header {
  margin-bottom: 12px;
}

.popup-header__title {
  font-size: 18px;
  font-weight: bold;
}

/* ❌ Bad: 曖昧な命名 */
.container {
  padding: 16px;
}

.header {
  margin-bottom: 12px;
}

.title {
  font-size: 18px;
}
```

## テスト

### 手動テスト

#### 録音機能

1. Google Meetで新しい会議を作成
2. 拡張機能で録音開始
3. マイクテスト（何か話す）
4. 録音停止
5. 文字起こし結果を確認

#### 文字起こし・要約

1. テスト音声ファイルを準備
2. 録音機能で音声を録音
3. 文字起こしが正確か確認
4. 要約が適切か確認

#### エラーハンドリング

1. **無効なAPIキー**
   - 設定で無効なAPIキーを入力
   - 録音・文字起こしを実行
   - 適切なエラーメッセージが表示されるか確認

2. **ネットワークエラー**
   - ネットワークを切断
   - 文字起こしを実行
   - エラーメッセージが表示されるか確認

3. **デバイスアクセスエラー**
   - マイク権限を無効化
   - 録音を開始
   - 権限要求ダイアログが表示されるか確認

### 自動テスト（将来実装）

```javascript
// 例: Jestでのユニットテスト
describe('AudioRecorder', () => {
  test('should start recording', async () => {
    const recorder = new AudioRecorder();
    await recorder.start('device-id');
    expect(recorder.isRecording).toBe(true);
  });

  test('should stop recording and return audio blob', async () => {
    const recorder = new AudioRecorder();
    await recorder.start('device-id');
    const blob = await recorder.stop();
    expect(blob).toBeInstanceOf(Blob);
  });
});
```

## パフォーマンス最適化

### 1. 音声データの扱い

```javascript
// ✅ Good: 使用後すぐに破棄
async function processAudio(audioBlob) {
  try {
    const transcript = await transcribe(audioBlob);
    // audioBlobは自動的にGCされる
    return transcript;
  } finally {
    audioBlob = null; // 明示的にnull化
  }
}

// ❌ Bad: グローバル変数に保持
let globalAudioBlob;

async function processAudio(audioBlob) {
  globalAudioBlob = audioBlob; // メモリリーク
  const transcript = await transcribe(audioBlob);
  return transcript;
}
```

### 2. API呼び出しの最適化

```javascript
// ✅ Good: チャンク分割で大きなファイルを処理
async function transcribeLargeAudio(audioBlob) {
  const chunks = splitAudioIntoChunks(audioBlob, 10 * 60); // 10分ごと
  const transcripts = await Promise.all(
    chunks.map(chunk => transcribe(chunk))
  );
  return transcripts.join('\n');
}

// ❌ Bad: 大きなファイルをそのまま送信（25MB制限でエラー）
async function transcribeLargeAudio(audioBlob) {
  return await transcribe(audioBlob); // ファイルサイズ超過でエラー
}
```

### 3. ストレージの最適化

```javascript
// ✅ Good: 古いデータを自動削除
async function saveTranscript(transcript) {
  const storage = await chrome.storage.local.get('transcripts');
  const transcripts = storage.transcripts || [];

  // 最新20件のみ保持
  transcripts.unshift(transcript);
  if (transcripts.length > 20) {
    transcripts.pop();
  }

  await chrome.storage.local.set({ transcripts });
}

// ❌ Bad: 無制限に蓄積（ストレージ枯渇）
async function saveTranscript(transcript) {
  const storage = await chrome.storage.local.get('transcripts');
  const transcripts = storage.transcripts || [];
  transcripts.push(transcript);
  await chrome.storage.local.set({ transcripts });
}
```

## セキュリティ

### APIキーの保護

```javascript
// ✅ Good: chrome.storage.syncで暗号化保存
async function saveApiKey(apiKey) {
  await chrome.storage.sync.set({ apiKey });
}

async function getApiKey() {
  const storage = await chrome.storage.sync.get('apiKey');
  return storage.apiKey;
}

// ❌ Bad: ローカルストレージ（平文保存）
function saveApiKey(apiKey) {
  localStorage.setItem('apiKey', apiKey); // 危険！
}
```

### XSS対策

```javascript
// ✅ Good: textContentを使用
function displayTranscript(text) {
  const elem = document.getElementById('transcript');
  elem.textContent = text; // 安全
}

// ❌ Bad: innerHTMLを使用
function displayTranscript(text) {
  const elem = document.getElementById('transcript');
  elem.innerHTML = text; // XSSリスク
}
```

## デプロイ

### Chrome Web Storeへの公開

1. **パッケージ化**
   ```bash
   # manifest.jsonのversionを更新
   # アイコンを準備
   # ZIPファイルを作成
   zip -r koemoji-web.zip . -x "*.git*" -x "node_modules/*" -x "docs/*"
   ```

2. **Chrome Developer Dashboardで公開**
   - [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole)
   - 新しいアイテムをアップロード
   - 説明・スクリーンショットを追加
   - 審査リクエスト

### バージョニング

セマンティックバージョニングを採用:

- **Major (1.0.0)**: 破壊的変更
- **Minor (0.1.0)**: 新機能追加
- **Patch (0.0.1)**: バグ修正

```json
// manifest.json
{
  "version": "1.0.0"
}
```

## トラブルシューティング

### 拡張機能が読み込めない

**症状**: エラー "Manifest file is missing or unreadable"

**解決策**:
- `manifest.json` が正しいJSON形式か確認
- 構文エラーがないか確認

### Background Scriptが動作しない

**症状**: console.logが出力されない

**解決策**:
1. `chrome://extensions/` でサービスワーカーを確認
2. エラーがあれば修正
3. 拡張機能をリロード

### 録音が開始されない

**症状**: エラー "Permission denied"

**解決策**:
1. Chromeのマイク権限を確認
2. `chrome://settings/content/microphone` で許可
3. ページをリロード

## 参考資料

### 公式ドキュメント

- [Chrome Extension API](https://developer.chrome.com/docs/extensions/)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [MediaRecorder API](https://developer.mozilla.org/en-US/docs/Web/API/MediaRecorder)
- [OpenAI API Documentation](https://platform.openai.com/docs/api-reference)

### サンプルコード

- [Chrome Extension Samples](https://github.com/GoogleChrome/chrome-extensions-samples)
- [Web Audio Examples](https://github.com/mdn/webaudio-examples)

### コミュニティ

- [Chrome Extensions Google Group](https://groups.google.com/a/chromium.org/g/chromium-extensions)
- [Stack Overflow - Chrome Extension](https://stackoverflow.com/questions/tagged/google-chrome-extension)

## 貢献

プルリクエストを歓迎します！

1. Forkする
2. Feature branchを作成
3. コミット
4. プッシュ
5. Pull Requestを作成

詳細は [CONTRIBUTING.md](../CONTRIBUTING.md) を参照してください。

## ライセンス

このプロジェクトは個人利用は自由ですが、商用利用は事前連絡が必要です。
詳細は [LICENSE](../LICENSE) を参照してください。
