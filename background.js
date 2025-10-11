// background.js - バックグラウンドスクリプト

// ライブラリのインポート（Service Workerではimportを使用）
importScripts(
  'lib/audio-encoder.js',
  'lib/openai-client.js',
  'lib/storage.js'
);

// オフスクリーンドキュメントの状態
let offscreenDocumentCreated = false;

// オフスクリーンドキュメントを作成
async function createOffscreenDocument() {
  // 既にフラグが立っている場合はスキップ
  if (offscreenDocumentCreated) {
    console.log('Offscreen document already marked as created');
    return;
  }

  try {
    // 既に存在するか確認（Chrome 116+）
    if (chrome.runtime.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });

      if (existingContexts.length > 0) {
        console.log('Offscreen document already exists');
        offscreenDocumentCreated = true;
        return;
      }
    }
  } catch (error) {
    console.log('getContexts not available, continuing with create');
  }

  try {
    await chrome.offscreen.createDocument({
      url: 'offscreen.html',
      reasons: ['USER_MEDIA'],
      justification: 'Recording audio from virtual audio device'
    });
    offscreenDocumentCreated = true;
    console.log('Offscreen document created');
  } catch (error) {
    // "Only a single offscreen document" エラーの場合は既に存在する
    if (error.message && error.message.includes('Only a single offscreen document')) {
      console.log('Offscreen document already exists (caught error)');
      offscreenDocumentCreated = true;
      return;
    }
    console.error('Failed to create offscreen document:', error);
    throw error;
  }
}

// オフスクリーンドキュメントを閉じる
async function closeOffscreenDocument() {
  try {
    // 実際に存在するか確認（Chrome 116+）
    if (chrome.runtime.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });

      if (existingContexts.length === 0) {
        console.log('No offscreen document to close');
        offscreenDocumentCreated = false;
        return;
      }
    }

    await chrome.offscreen.closeDocument();
    offscreenDocumentCreated = false;
    console.log('Offscreen document closed');
  } catch (error) {
    console.error('Failed to close offscreen document:', error);
    offscreenDocumentCreated = false;
  }
}

// オフスクリーンドキュメントにメッセージを送信
async function sendMessageToOffscreen(message) {
  // offscreen documentが作成されているか確認
  if (!offscreenDocumentCreated) {
    throw new Error('Offscreen document not created');
  }

  // offscreen宛であることを明示
  const offscreenMessage = {
    ...message,
    target: 'offscreen'
  };

  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(offscreenMessage, (response) => {
      if (chrome.runtime.lastError) {
        console.error('Error sending message to offscreen:', chrome.runtime.lastError);
        reject(chrome.runtime.lastError);
      } else {
        resolve(response);
      }
    });
  });
}

// インストール時・更新時
chrome.runtime.onInstalled.addListener(async (details) => {
  console.log('Extension installed:', details.reason);

  if (details.reason === 'install') {
    // 初回インストール時の処理
    console.log('First time installation');
  }

  // 既存のオフスクリーンドキュメントをクリーンアップ
  try {
    // Chrome 116+の場合
    if (chrome.runtime.getContexts) {
      const existingContexts = await chrome.runtime.getContexts({
        contextTypes: ['OFFSCREEN_DOCUMENT']
      });

      if (existingContexts.length > 0) {
        console.log('Cleaning up existing offscreen document');
        await chrome.offscreen.closeDocument();
        offscreenDocumentCreated = false;
      }
    } else {
      // それ以外の場合は閉じるだけ試す
      await chrome.offscreen.closeDocument();
      offscreenDocumentCreated = false;
      console.log('Cleaned up offscreen document');
    }
  } catch (error) {
    console.log('No offscreen document to clean up');
  }
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Background received message:', message);

  // offscreen宛のメッセージは無視
  if (message.target === 'offscreen') {
    return false;
  }

  // 非同期処理のため、trueを返す
  handleMessage(message, sender).then(sendResponse);
  return true;
});

// メッセージハンドラー
async function handleMessage(message, sender) {
  try {
    switch (message.action) {
      case 'startRecording':
        return await handleStartRecording(message);

      case 'stopRecording':
        return await handleStopRecording(message);

      case 'getRecordingStatus':
        return await handleGetRecordingStatus(message);

      case 'transcribeAudio':
        return await handleTranscribeAudio(message);

      case 'getTranscripts':
        return await handleGetTranscripts(message);

      case 'deleteTranscript':
        return await handleDeleteTranscript(message);

      case 'getSettings':
        return await handleGetSettings(message);

      case 'saveSettings':
        return await handleSaveSettings(message);

      default:
        throw new Error(`Unknown action: ${message.action}`);
    }
  } catch (error) {
    console.error('Error handling message:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 録音開始
async function handleStartRecording(message) {
  try {
    // 設定を読み込み
    const settings = await Storage.loadSettings();
    console.log('Loaded settings:', {
      hasApiKey: !!settings.apiKey,
      recordingDevice: settings.recordingDevice,
      language: settings.language
    });

    if (!settings.recordingDevice) {
      throw new Error(
        '録音デバイスが設定されていません。\n\n' +
        '設定手順:\n' +
        '1. 拡張機能アイコンをクリック\n' +
        '2. 「⚙️ 設定」をクリック\n' +
        '3. 録音デバイスを選択\n' +
        '4. 「設定を保存」をクリック'
      );
    }

    // オフスクリーンドキュメントを作成
    await createOffscreenDocument();

    // オフスクリーンドキュメントに録音開始を要求
    // 少し待ってからメッセージを送信（offscreen documentの初期化待ち）
    await new Promise(resolve => setTimeout(resolve, 100));

    const response = await sendMessageToOffscreen({
      action: 'startRecording',
      deviceId: settings.recordingDevice
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '録音の開始に失敗しました');
    }

    console.log('Recording started in offscreen document');

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to start recording:', error);
    throw error;
  }
}

// 録音停止
async function handleStopRecording(message) {
  try {
    // オフスクリーンドキュメントに録音停止を要求
    const response = await sendMessageToOffscreen({
      action: 'stopRecording'
    });

    if (!response.success) {
      throw new Error(response.error || '録音の停止に失敗しました');
    }

    const { audioBlob: audioBase64, duration } = response;

    console.log('Recording stopped, starting transcription');

    // 設定を読み込み
    const settings = await Storage.loadSettings();

    if (!settings.apiKey) {
      throw new Error('APIキーが設定されていません。設定画面でAPIキーを入力してください。');
    }

    // Base64からBlobに変換
    const audioBlob = await base64ToBlob(audioBase64);

    // プラットフォーム検出
    const platform = await detectPlatform();

    // 文字起こし結果を作成（処理中状態）
    const transcript = Storage.createTranscript({
      title: `${platform} 会議 - ${new Date().toLocaleString('ja-JP')}`,
      duration: duration,
      audioSize: audioBlob.size,
      platform: platform
    });

    // 保存
    await Storage.saveTranscript(transcript);

    // 非同期で文字起こし処理を開始
    transcribeAudio(audioBlob, transcript.id, settings);

    // オフスクリーンドキュメントを閉じる
    await closeOffscreenDocument();

    return {
      success: true,
      transcriptId: transcript.id
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}

// 録音状態を取得
async function handleGetRecordingStatus(message) {
  try {
    if (!offscreenDocumentCreated) {
      return {
        success: true,
        isRecording: false,
        duration: 0
      };
    }

    // オフスクリーンドキュメントから状態を取得
    const response = await sendMessageToOffscreen({
      action: 'getRecordingStatus'
    });

    return response;
  } catch (error) {
    console.error('Failed to get recording status:', error);
    return {
      success: true,
      isRecording: false,
      duration: 0
    };
  }
}

// 文字起こし処理を開始（popup.jsから直接呼ばれる場合用）
async function handleTranscribeAudio(message) {
  try {
    const { audioBlob: audioBase64, duration } = message;

    // 設定を読み込み
    const settings = await Storage.loadSettings();

    if (!settings.apiKey) {
      throw new Error('APIキーが設定されていません。設定画面でAPIキーを入力してください。');
    }

    // Base64からBlobに変換
    const audioBlob = await base64ToBlob(audioBase64);

    // プラットフォーム検出
    const platform = await detectPlatform();

    // 文字起こし結果を作成（処理中状態）
    const transcript = Storage.createTranscript({
      title: `${platform} 会議 - ${new Date().toLocaleString('ja-JP')}`,
      duration: duration,
      audioSize: audioBlob.size,
      platform: platform
    });

    // 保存
    await Storage.saveTranscript(transcript);

    // 非同期で文字起こし処理を開始
    transcribeAudio(audioBlob, transcript.id, settings);

    return {
      success: true,
      transcriptId: transcript.id
    };
  } catch (error) {
    console.error('Failed to start transcription:', error);
    throw error;
  }
}

// Base64をBlobに変換
async function base64ToBlob(base64) {
  const response = await fetch(base64);
  return await response.blob();
}

// 文字起こし処理（非同期）
async function transcribeAudio(audioBlob, transcriptId, settings) {
  try {
    console.log('Starting transcription...');

    // OpenAI Clientを初期化
    const client = new OpenAIClient(settings.apiKey);

    // Whisper APIはWebMも対応しているので、そのまま送信
    // （Service WorkerではAudioContextが使えないためWAV変換をスキップ）
    console.log('Transcribing audio blob:', {
      type: audioBlob.type,
      size: audioBlob.size
    });

    // ファイルサイズチェック（25MB超える場合はエラー）
    const maxSize = 25 * 1024 * 1024;

    if (audioBlob.size > maxSize) {
      throw new Error(
        `ファイルサイズが大きすぎます（${(audioBlob.size / 1024 / 1024).toFixed(1)}MB）。` +
        `録音時間を短くしてください（推奨: 10分以内）。`
      );
    }

    // 文字起こし
    const result = await client.transcribe(audioBlob, {
      language: settings.language
    });
    const transcriptText = result.text;

    console.log('Transcription completed');

    // 文字起こし結果を更新
    await Storage.updateTranscript(transcriptId, {
      transcript: transcriptText
    });

    // Popupに通知
    notifyPopup({
      action: 'transcriptionComplete',
      data: await Storage.getTranscript(transcriptId)
    });

    // 自動要約が有効な場合
    if (settings.autoSummarize) {
      await generateSummary(transcriptId, transcriptText, settings);
    }
  } catch (error) {
    console.error('Transcription failed:', error);

    // エラーを保存
    await Storage.updateTranscript(transcriptId, {
      transcript: `エラー: ${error.message}`
    });

    // Popupに通知
    notifyPopup({
      action: 'error',
      error: error.message
    });
  }
}

// 要約生成（非同期）
async function generateSummary(transcriptId, transcriptText, settings) {
  try {
    console.log('Generating summary...');

    // OpenAI Clientを初期化
    const client = new OpenAIClient(settings.apiKey);

    // 要約生成（カスタムプロンプトがあれば使用）
    const options = {};
    if (settings.summaryPrompt) {
      options.customPrompt = settings.summaryPrompt;
    }
    const result = await client.summarize(transcriptText, options);

    console.log('Summary generated');

    // 要約を保存
    await Storage.updateTranscript(transcriptId, {
      summary: result.summary
    });

    // Popupに通知
    notifyPopup({
      action: 'summaryComplete',
      data: {
        id: transcriptId,
        summary: result.summary
      }
    });
  } catch (error) {
    console.error('Summary generation failed:', error);

    // Popupに通知
    notifyPopup({
      action: 'error',
      error: `要約生成に失敗しました: ${error.message}`
    });
  }
}

// Popupに通知
function notifyPopup(message) {
  chrome.runtime.sendMessage(message).catch(error => {
    // Popupが開いていない場合はエラーが発生するが、無視する
    console.log('Popup not open, message not sent');
  });
}

// プラットフォーム検出
async function detectPlatform() {
  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tabs.length === 0) {
      return 'unknown';
    }

    const url = tabs[0].url;

    if (url.includes('meet.google.com')) {
      return 'google-meet';
    } else if (url.includes('zoom.us')) {
      return 'zoom';
    } else {
      return 'unknown';
    }
  } catch (error) {
    console.error('Failed to detect platform:', error);
    return 'unknown';
  }
}

// 文字起こし履歴を取得
async function handleGetTranscripts(message) {
  try {
    const transcripts = await Storage.loadTranscripts();
    return {
      success: true,
      transcripts
    };
  } catch (error) {
    console.error('Failed to get transcripts:', error);
    throw error;
  }
}

// 文字起こしを削除
async function handleDeleteTranscript(message) {
  try {
    const { id } = message;
    await Storage.deleteTranscript(id);
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete transcript:', error);
    throw error;
  }
}

// 設定を取得
async function handleGetSettings(message) {
  try {
    const settings = await Storage.loadSettings();
    return {
      success: true,
      settings
    };
  } catch (error) {
    console.error('Failed to get settings:', error);
    throw error;
  }
}

// 設定を保存
async function handleSaveSettings(message) {
  try {
    const { settings } = message;
    await Storage.saveSettings(settings);
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to save settings:', error);
    throw error;
  }
}

console.log('Background script loaded');
