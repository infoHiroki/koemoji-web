// offscreen.js - オフスクリーンドキュメント（バックグラウンド録音）

console.log('Offscreen document loaded');

// 音声録音インスタンス
let audioRecorder = null;

// メッセージリスナー
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Offscreen received message:', message.action);

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

    // 録音停止
    const audioBlob = await audioRecorder.stop();
    const duration = audioRecorder.getDuration();

    console.log('Recording stopped:', {
      size: audioBlob.size,
      duration
    });

    // BlobをBase64に変換
    const audioBase64 = await blobToBase64(audioBlob);

    // リセット
    audioRecorder = null;

    return {
      success: true,
      audioBlob: audioBase64,
      duration: duration
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
