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
  if (offscreenDocumentCreated) {
    return;
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
    console.error('Failed to create offscreen document:', error);
    throw error;
  }
}

// オフスクリーンドキュメントを閉じる
async function closeOffscreenDocument() {
  if (!offscreenDocumentCreated) {
    return;
  }

  try {
    await chrome.offscreen.closeDocument();
    offscreenDocumentCreated = false;
    console.log('Offscreen document closed');
  } catch (error) {
    console.error('Failed to close offscreen document:', error);
  }
}

// インストール時
chrome.runtime.onInstalled.addListener((details) => {
  console.log('Extension installed:', details.reason);

  if (details.reason === 'install') {
    // 初回インストール時の処理
    console.log('First time installation');
  }
});

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Received message:', message.action);

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

    if (!settings.recordingDevice) {
      throw new Error('録音デバイスが設定されていません。設定画面で録音デバイスを選択してください。');
    }

    // オフスクリーンドキュメントを作成
    await createOffscreenDocument();

    // オフスクリーンドキュメントに録音開始を要求
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording',
      deviceId: settings.recordingDevice
    });

    if (!response.success) {
      throw new Error(response.error || '録音の開始に失敗しました');
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
    const response = await chrome.runtime.sendMessage({
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
    const response = await chrome.runtime.sendMessage({
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

    // WAV形式に変換（Whisper APIはWAVを推奨）
    let processedBlob = audioBlob;
    if (audioBlob.type.includes('webm')) {
      console.log('Converting to WAV...');
      processedBlob = await AudioEncoder.convertToWAV(audioBlob);
    }

    // ファイルサイズチェック（25MB超える場合は分割）
    const maxSize = 25 * 1024 * 1024;
    let transcriptText = '';

    if (processedBlob.size > maxSize) {
      console.log('Audio file too large, splitting...');
      const chunks = await AudioEncoder.splitAudio(processedBlob, 600); // 10分ごと

      // 各チャンクを文字起こし
      for (let i = 0; i < chunks.length; i++) {
        console.log(`Transcribing chunk ${i + 1}/${chunks.length}...`);
        const result = await client.transcribe(chunks[i], {
          language: settings.language
        });
        transcriptText += result.text + '\n\n';
      }
    } else {
      // 通常の文字起こし
      const result = await client.transcribe(processedBlob, {
        language: settings.language
      });
      transcriptText = result.text;
    }

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

    // 要約生成
    const result = await client.summarize(transcriptText);

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
