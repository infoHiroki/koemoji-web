// offscreen.js - オフスクリーンドキュメント（バックグラウンド録音）

console.log('Offscreen document loaded');
console.log('AudioRecorder available:', typeof AudioRecorder);
console.log('AudioEncoder available:', typeof AudioEncoder);
console.log('AudioEncoder.splitAudio available:', typeof AudioEncoder?.splitAudio);

// 定数
const MAX_RECORDING_DURATION = 3 * 60 * 60; // 3時間（秒）
const WARNING_DURATION = 2 * 60 * 60 + 50 * 60; // 2時間50分（秒）

// 音声録音インスタンス
let audioRecorder = null;
let recordingStartTime = null;
let durationCheckInterval = null;
let warningShown = false;

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message);

  // offscreen宛のメッセージのみ処理
  if (message.target !== 'offscreen') {
    return false; // このメッセージは処理しない
  }

  handleMessage(message).then(sendResponse).catch(error => {
    console.error('Error handling message:', error);
    sendResponse({
      success: false,
      error: error.message
    });
  });

  return true; // 非同期応答
});

// メッセージハンドラー
async function handleMessage(message) {
  switch (message.action) {
    case 'startRecording':
      return await handleStartRecording(message);

    case 'stopRecording':
      return await handleStopRecording(message);

    case 'getRecordingStatus':
      return await handleGetRecordingStatus(message);

    default:
      throw new Error(`Unknown action: ${message.action}`);
  }
}

// 録音開始
async function handleStartRecording(message) {
  try {
    const { deviceId } = message;

    if (!deviceId) {
      throw new Error('録音デバイスが指定されていません');
    }

    console.log('Starting recording with device:', deviceId);

    // AudioRecorderを初期化
    audioRecorder = new AudioRecorder();

    // 録音開始
    await audioRecorder.start(deviceId);

    // 録音時間監視を開始
    recordingStartTime = Date.now();
    warningShown = false;
    startDurationCheck();

    console.log('Recording started successfully');

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
    if (!audioRecorder || !audioRecorder.isRecording()) {
      throw new Error('録音が開始されていません');
    }

    console.log('Stopping recording...');

    // 時間監視を停止
    stopDurationCheck();

    // 録音停止（ストリーミング版）
    // audioRecorder.stop() は内部でチャンクをflushし、recordingCompleteメッセージを送信する
    const result = await audioRecorder.stop();

    console.log('Recording stopped:', {
      totalChunks: result.totalChunks,
      duration: result.duration
    });

    // リセット
    audioRecorder = null;
    recordingStartTime = null;
    warningShown = false;

    return {
      success: true
    };
  } catch (error) {
    console.error('Failed to stop recording:', error);
    throw error;
  }
}

// 録音状態を取得
async function handleGetRecordingStatus(message) {
  try {
    const isRecording = audioRecorder && audioRecorder.isRecording();
    const duration = audioRecorder ? audioRecorder.getDuration() : 0;

    return {
      success: true,
      isRecording: isRecording,
      duration: duration
    };
  } catch (error) {
    console.error('Failed to get recording status:', error);
    throw error;
  }
}

// BlobをBase64に変換
async function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}

// 録音時間監視を開始
function startDurationCheck() {
  // 既存のインターバルがあればクリア
  if (durationCheckInterval) {
    clearInterval(durationCheckInterval);
  }

  // 10秒ごとに録音時間をチェック
  durationCheckInterval = setInterval(() => {
    if (!recordingStartTime || !audioRecorder) {
      stopDurationCheck();
      return;
    }

    const elapsedSeconds = (Date.now() - recordingStartTime) / 1000;

    // 2時間50分で警告
    if (elapsedSeconds >= WARNING_DURATION && !warningShown) {
      warningShown = true;
      console.warn(`Recording duration warning: ${Math.floor(elapsedSeconds / 60)} minutes`);

      // Backgroundスクリプトに警告を送信
      chrome.runtime.sendMessage({
        action: 'recordingWarning',
        duration: elapsedSeconds,
        remainingSeconds: MAX_RECORDING_DURATION - elapsedSeconds
      }).catch(error => {
        console.error('Failed to send warning:', error);
      });
    }

    // 3時間で自動停止
    if (elapsedSeconds >= MAX_RECORDING_DURATION) {
      console.warn('Recording duration limit reached. Auto-stopping...');

      // Backgroundスクリプトに自動停止を通知
      chrome.runtime.sendMessage({
        action: 'recordingAutoStop',
        duration: elapsedSeconds
      }).catch(error => {
        console.error('Failed to send auto-stop:', error);
      });

      // 録音を自動停止（内部処理）
      stopDurationCheck();
      // 注意: 実際の停止はbackgroundスクリプト経由で行う
    }
  }, 10000); // 10秒ごと
}

// 録音時間監視を停止
function stopDurationCheck() {
  if (durationCheckInterval) {
    clearInterval(durationCheckInterval);
    durationCheckInterval = null;
  }
}
