// background.js - バックグラウンドスクリプト

// 定数
const OFFSCREEN_INIT_DELAY = 100; // ms - オフスクリーンドキュメント初期化待機時間
const MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB - Whisper APIの制限

// ライブラリのインポート（Service Workerではimportを使用）
importScripts(
  'lib/audio-encoder.js',
  'lib/audio-storage.js',
  'lib/openai-client.js',
  'lib/storage.js',
  'lib/job-queue.js',
  'lib/job-processor.js'
);

// オフスクリーンドキュメントの状態
let offscreenDocumentCreated = false;

// AudioStorageインスタンス
const audioStorage = new AudioStorage();

// Keep-Alive機構（Service Workerスリープ防止）
let keepAliveInterval = null;

// Keep-Aliveを開始
function startKeepAlive() {
  if (keepAliveInterval) {
    return; // 既に実行中
  }

  console.log('Starting Keep-Alive mechanism');

  // 25秒ごとにService Workerを起こす
  keepAliveInterval = setInterval(() => {
    console.log('Keep-Alive ping');
    // chrome.storageへの軽い読み書きでService Workerを起こす
    chrome.storage.local.get('keepAlive', () => {
      chrome.storage.local.set({ keepAlive: Date.now() });
    });
  }, 25000); // 25秒
}

// Keep-Aliveを停止
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
    console.log('Keep-Alive stopped');
  }
}

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

// Service Worker起動時・復帰時の処理
chrome.runtime.onStartup.addListener(async () => {
  console.log('Service Worker started');
  await checkAndRestoreRecordingState();
  await startJobProcessor();
});

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

  // 録音状態を確認して復旧
  await checkAndRestoreRecordingState();

  // ジョブプロセッサーを起動
  await startJobProcessor();
});

// 録音状態を確認して復旧
async function checkAndRestoreRecordingState() {
  try {
    const state = await chrome.storage.local.get(['isRecording', 'recordingStartTime']);

    if (state.isRecording && state.recordingStartTime) {
      console.log('Restoring recording state after Service Worker restart');

      // Keep-Aliveを再開
      startKeepAlive();

      // offscreen documentを再作成（念のため）
      try {
        await createOffscreenDocument();
        console.log('Offscreen document restored');
      } catch (error) {
        console.error('Failed to restore offscreen document:', error);

        // 復旧失敗時は録音状態をクリア
        await chrome.storage.local.set({
          isRecording: false,
          recordingStartTime: null
        });
        stopKeepAlive();
      }
    }
  } catch (error) {
    console.error('Failed to check recording state:', error);
  }
}

// ジョブプロセッサーを起動（Service Worker起動時に実行）
async function startJobProcessor() {
  try {
    console.log('Starting job processor...');

    // 設定を読み込み
    const settings = await Storage.loadSettings();

    // APIキーが設定されていない場合はスキップ
    if (!settings.apiKey) {
      console.log('API key not set, skipping job processor');
      return;
    }

    // ジョブプロセッサーを起動
    await JobProcessor.start(settings);

    console.log('Job processor started successfully');
  } catch (error) {
    console.error('Failed to start job processor:', error);
  }
}

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

      case 'deleteAllTranscripts':
        return await handleDeleteAllTranscripts(message);

      case 'updateTranscriptTitle':
        return await handleUpdateTranscriptTitle(message);

      case 'getSettings':
        return await handleGetSettings(message);

      case 'saveSettings':
        return await handleSaveSettings(message);

      case 'retryTranscription':
        return await handleRetryTranscription(message);

      case 'deleteAudioFile':
        return await handleDeleteAudioFile(message);

      case 'recordingWarning':
        return await handleRecordingWarning(message);

      case 'recordingAutoStop':
        return await handleRecordingAutoStop(message);

      case 'ping':
        // Keep-Alive用のpingメッセージ（何もしない）
        return { success: true, pong: true };

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
    await new Promise(resolve => setTimeout(resolve, OFFSCREEN_INIT_DELAY));

    const response = await sendMessageToOffscreen({
      action: 'startRecording',
      deviceId: settings.recordingDevice
    });

    if (!response || !response.success) {
      throw new Error(response?.error || '録音の開始に失敗しました');
    }

    console.log('Recording started in offscreen document');

    // Keep-Aliveを開始（Service Workerスリープ防止）
    startKeepAlive();

    // 録音状態を永続化
    await chrome.storage.local.set({
      isRecording: true,
      recordingStartTime: Date.now()
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to start recording:', error);

    // エラー時はKeep-Aliveを停止
    stopKeepAlive();

    // 録音状態をクリア
    await chrome.storage.local.set({
      isRecording: false,
      recordingStartTime: null
    });

    throw error;
  }
}

// 録音停止
async function handleStopRecording(message) {
  try {
    // オフスクリーンドキュメントが存在するか確認
    if (!offscreenDocumentCreated) {
      throw new Error('録音が開始されていません。まず「録音開始」ボタンを押してください。');
    }

    // オフスクリーンドキュメントに録音停止を要求
    const response = await sendMessageToOffscreen({
      action: 'stopRecording'
    });

    if (!response.success) {
      throw new Error(response.error || '録音の停止に失敗しました');
    }

    const { chunks, totalDuration } = response;

    console.log(`Recording stopped, received ${chunks.length} chunks`);

    // 設定を読み込み
    const settings = await Storage.loadSettings();

    if (!settings.apiKey) {
      throw new Error('APIキーが設定されていません。設定画面でAPIキーを入力してください。');
    }

    // プラットフォーム検出
    const platform = await detectPlatform();

    // タイトル生成（日付のみ、秒数なし）
    const dateStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 文字起こし結果を作成（処理中状態）
    const transcript = Storage.createTranscript({
      title: dateStr,
      duration: totalDuration,
      audioSize: chunks.reduce((sum, chunk) => sum + chunk.size, 0),
      platform: platform,
      audioStored: false  // チャンク分割の場合は音声を保存しない
    });

    // 保存
    await Storage.saveTranscript(transcript);

    // ジョブをキューに追加
    await JobQueue.addJob({
      transcriptId: transcript.id,
      chunks: chunks,
      metadata: {
        title: transcript.title,
        duration: totalDuration,
        platform: platform,
        audioSize: transcript.audioSize
      }
    });

    console.log(`Job added to queue: ${transcript.id}`);

    // 録音状態をクリア
    await chrome.storage.local.set({
      isRecording: false,
      recordingStartTime: null
    });

    // オフスクリーンドキュメントを閉じる
    await closeOffscreenDocument();

    // ジョブプロセッサーを起動（キューにジョブがあれば処理開始）
    startJobProcessor();

    return {
      success: true,
      transcriptId: transcript.id
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);

    // 録音状態をクリア
    await chrome.storage.local.set({
      isRecording: false,
      recordingStartTime: null
    });

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

    // タイトル生成（日付のみ、秒数なし）
    const dateStr = new Date().toLocaleString('ja-JP', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit'
    });

    // 文字起こし結果を作成（処理中状態）
    const transcript = Storage.createTranscript({
      title: dateStr,
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

// プラットフォーム名を日本語化
function getPlatformName(platform) {
  const platformNames = {
    'google-meet': 'Google Meet',
    'zoom': 'Zoom',
    'unknown': 'Web会議'
  };
  return platformNames[platform] || 'Web会議';
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

// すべての文字起こしを削除
async function handleDeleteAllTranscripts(message) {
  try {
    await Storage.deleteAllTranscripts();
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete all transcripts:', error);
    throw error;
  }
}

// 文字起こしのタイトルを更新
async function handleUpdateTranscriptTitle(message) {
  try {
    const { id, title } = message;
    await Storage.updateTranscript(id, { title });
    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to update transcript title:', error);
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

// 音声ストレージのクリーンアップ
async function cleanupAudioStorage(settings) {
  try {
    // 期限切れの音声を削除
    const expiredCount = await audioStorage.cleanupExpiredAudios();

    // 件数制限を超えた古い音声を削除
    const maxCount = settings.maxAudioCount || 20;
    const oldCount = await audioStorage.cleanupOldAudios(maxCount);

    if (expiredCount > 0 || oldCount > 0) {
      console.log(`Audio cleanup: ${expiredCount} expired, ${oldCount} old recordings deleted`);
    }
  } catch (error) {
    console.error('Audio cleanup failed:', error);
  }
}

// 文字起こしを再試行
async function handleRetryTranscription(message) {
  try {
    const { transcriptId } = message;

    if (!transcriptId) {
      throw new Error('transcriptId is required');
    }

    // 音声ファイルを取得
    const audioRecord = await audioStorage.getAudio(transcriptId);

    if (!audioRecord || !audioRecord.audioBlob) {
      throw new Error('音声ファイルが見つかりません。保存期間が過ぎた可能性があります。');
    }

    // 設定を読み込み
    const settings = await Storage.loadSettings();

    if (!settings.apiKey) {
      throw new Error('APIキーが設定されていません。');
    }

    // 文字起こしを再実行
    await transcribeAudio(audioRecord.audioBlob, transcriptId, settings);

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to retry transcription:', error);
    throw error;
  }
}

// 音声ファイルを削除
async function handleDeleteAudioFile(message) {
  try {
    const { transcriptId } = message;

    if (!transcriptId) {
      throw new Error('transcriptId is required');
    }

    await audioStorage.deleteAudio(transcriptId);

    // transcriptのaudioStoredフラグを更新
    await Storage.updateTranscript(transcriptId, { audioStored: false });

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to delete audio file:', error);
    throw error;
  }
}

// 録音時間警告
async function handleRecordingWarning(message) {
  try {
    const { duration, remainingSeconds } = message;
    const remainingMinutes = Math.floor(remainingSeconds / 60);

    console.warn(`Recording duration warning: ${Math.floor(duration / 60)} minutes elapsed, ${remainingMinutes} minutes remaining`);

    // Popupに警告を通知
    notifyPopup({
      action: 'recordingWarning',
      duration: duration,
      remainingMinutes: remainingMinutes
    });

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to handle recording warning:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// 録音自動停止
async function handleRecordingAutoStop(message) {
  try {
    const { duration } = message;

    console.warn(`Recording auto-stopped after ${Math.floor(duration / 60)} minutes`);

    // Popupに自動停止を通知
    notifyPopup({
      action: 'recordingAutoStop',
      duration: duration
    });

    // 録音を停止
    await handleStopRecording({});

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to handle recording auto-stop:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

console.log('Background script loaded');
