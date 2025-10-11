// popup.js - メインUI制御

// DOM要素の取得
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const recordingTime = document.querySelector('.time-display');
const transcriptSection = document.getElementById('transcriptSection');
const transcriptDate = document.getElementById('transcriptDate');
const transcriptDuration = document.getElementById('transcriptDuration');
const transcriptText = document.getElementById('transcriptText');
const summaryContent = document.getElementById('summaryContent');
const summaryText = document.getElementById('summaryText');
const copyBtn = document.getElementById('copyBtn');
const downloadBtn = document.getElementById('downloadBtn');
const deleteBtn = document.getElementById('deleteBtn');
const historyList = document.getElementById('historyList');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const settingsBtn = document.getElementById('settingsBtn');

// 状態管理
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let currentTranscript = null;

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Popup initialized');
  await loadHistory();
  await checkRecordingStatus(); // 録音状態を確認
  setupEventListeners();
});

// 録音状態を確認（ポップアップ再オープン時）
async function checkRecordingStatus() {
  try {
    console.log('Checking recording status...');

    const response = await chrome.runtime.sendMessage({
      action: 'getRecordingStatus'
    });

    if (response && response.success && response.isRecording) {
      console.log('Recording in progress, restoring UI state');

      // 録音中の状態を復元
      isRecording = true;

      // 録音開始時刻を計算（現在時刻 - 録音時間）
      recordingStartTime = Date.now() - (response.duration * 1000);

      // UI更新
      updateRecordingUI(true);

      // タイマー開始
      startRecordingTimer();

      console.log('Recording state restored:', {
        duration: response.duration,
        startTime: new Date(recordingStartTime).toISOString()
      });
    } else {
      console.log('No recording in progress');
    }
  } catch (error) {
    console.error('Failed to check recording status:', error);
    // エラーは無視（録音中でない場合も正常）
  }
}

// イベントリスナーの設定
function setupEventListeners() {
  // 録音制御
  startBtn.addEventListener('click', handleStartRecording);
  stopBtn.addEventListener('click', handleStopRecording);

  // 文字起こし結果のアクション
  copyBtn.addEventListener('click', handleCopy);
  downloadBtn.addEventListener('click', handleDownload);
  deleteBtn.addEventListener('click', handleDelete);

  // 履歴
  refreshHistoryBtn.addEventListener('click', loadHistory);

  // 設定
  settingsBtn.addEventListener('click', () => {
    chrome.runtime.openOptionsPage();
  });

  // メッセージリスナー
  chrome.runtime.onMessage.addListener(handleMessage);
}

// 録音開始
async function handleStartRecording() {
  try {
    console.log('Starting recording...');

    // バックグラウンドスクリプトに録音開始を要求
    const response = await chrome.runtime.sendMessage({
      action: 'startRecording'
    });

    if (response.success) {
      isRecording = true;
      recordingStartTime = Date.now();

      // UI更新
      updateRecordingUI(true);

      // タイマー開始
      startRecordingTimer();

      console.log('Recording started successfully');
    } else {
      throw new Error(response.error || '録音の開始に失敗しました');
    }
  } catch (error) {
    console.error('Failed to start recording:', error);
    showError('録音の開始に失敗しました: ' + error.message);
  }
}

// 録音停止
async function handleStopRecording() {
  try {
    console.log('Stopping recording...');

    // タイマー停止
    stopRecordingTimer();

    // バックグラウンドスクリプトに録音停止を要求
    const response = await chrome.runtime.sendMessage({
      action: 'stopRecording'
    });

    if (response.success) {
      isRecording = false;

      // UI更新
      updateRecordingUI(false);
      showTranscriptSection(true);

      // 文字起こし処理中表示
      transcriptText.textContent = '文字起こし処理中...';
      statusText.textContent = '処理中...';
    } else {
      throw new Error(response.error || '録音の停止に失敗しました');
    }
  } catch (error) {
    console.error('Failed to stop recording:', error);
    showError('録音の停止に失敗しました: ' + error.message);
  }
}

// 録音タイマー開始
function startRecordingTimer() {
  recordingTimer = setInterval(() => {
    const elapsed = Date.now() - recordingStartTime;
    const hours = Math.floor(elapsed / 3600000);
    const minutes = Math.floor((elapsed % 3600000) / 60000);
    const seconds = Math.floor((elapsed % 60000) / 1000);

    recordingTime.textContent =
      `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  }, 1000);
}

// 録音タイマー停止
function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }
}

// 録音UI更新
function updateRecordingUI(recording) {
  if (recording) {
    startBtn.style.display = 'none';
    stopBtn.style.display = 'flex';
    statusIndicator.classList.add('recording');
    statusText.textContent = '録音中...';
  } else {
    startBtn.style.display = 'flex';
    stopBtn.style.display = 'none';
    statusIndicator.classList.remove('recording');
    statusText.textContent = '準備完了';
    recordingTime.textContent = '00:00:00';
  }
}

// 文字起こしセクション表示
function showTranscriptSection(show) {
  transcriptSection.style.display = show ? 'block' : 'none';
}

// コピー
async function handleCopy() {
  try {
    const text = buildCopyText();
    await navigator.clipboard.writeText(text);
    showNotification('クリップボードにコピーしました');
  } catch (error) {
    console.error('Failed to copy:', error);
    showError('コピーに失敗しました');
  }
}

// ダウンロード
function handleDownload() {
  try {
    const text = buildCopyText();
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transcript_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('ダウンロードしました');
  } catch (error) {
    console.error('Failed to download:', error);
    showError('ダウンロードに失敗しました');
  }
}

// コピー・ダウンロード用テキスト生成
function buildCopyText() {
  let text = '# 文字起こし結果\n\n';
  text += `日時: ${transcriptDate.textContent}\n`;
  text += `時間: ${transcriptDuration.textContent}\n\n`;
  text += `## 文字起こし\n\n${transcriptText.textContent}\n\n`;

  if (summaryContent.style.display !== 'none') {
    text += `## AI要約\n\n${summaryText.textContent}\n`;
  }

  return text;
}

// 削除
async function handleDelete() {
  if (!currentTranscript) return;

  if (!confirm('この文字起こし結果を削除しますか？')) {
    return;
  }

  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteTranscript',
      id: currentTranscript.id
    });

    if (response.success) {
      currentTranscript = null;
      showTranscriptSection(false);
      await loadHistory();
      showNotification('削除しました');
    } else {
      throw new Error(response.error || '削除に失敗しました');
    }
  } catch (error) {
    console.error('Failed to delete:', error);
    showError('削除に失敗しました');
  }
}

// 履歴読み込み
async function loadHistory() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getTranscripts'
    });

    if (response.success) {
      displayHistory(response.transcripts || []);
    } else {
      throw new Error(response.error || '履歴の読み込みに失敗しました');
    }
  } catch (error) {
    console.error('Failed to load history:', error);
    historyList.innerHTML = '<p class="empty-message">履歴の読み込みに失敗しました</p>';
  }
}

// 履歴表示
function displayHistory(transcripts) {
  if (transcripts.length === 0) {
    historyList.innerHTML = '<p class="empty-message">録音履歴がありません</p>';
    return;
  }

  historyList.innerHTML = transcripts.map(transcript => `
    <div class="history-item" data-id="${transcript.id}">
      <div class="history-item__title">${escapeHtml(transcript.title || '無題')}</div>
      <div class="history-item__meta">
        <span>${formatDate(transcript.timestamp)}</span>
        <span>${formatDuration(transcript.duration)}</span>
      </div>
    </div>
  `).join('');

  // 履歴アイテムのクリックイベント
  document.querySelectorAll('.history-item').forEach(item => {
    item.addEventListener('click', () => {
      const id = item.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript) {
        displayTranscript(transcript);
      }
    });
  });
}

// 文字起こし結果表示
function displayTranscript(transcript) {
  currentTranscript = transcript;

  transcriptDate.textContent = formatDate(transcript.timestamp);
  transcriptDuration.textContent = formatDuration(transcript.duration);
  transcriptText.textContent = transcript.transcript || '文字起こし結果がありません';

  if (transcript.summary) {
    summaryContent.style.display = 'block';
    summaryText.textContent = transcript.summary;
  } else {
    summaryContent.style.display = 'none';
  }

  showTranscriptSection(true);

  // スクロール
  transcriptSection.scrollIntoView({ behavior: 'smooth' });
}

// メッセージハンドラー
function handleMessage(message, sender, sendResponse) {
  console.log('Received message:', message);

  switch (message.action) {
    case 'transcriptionComplete':
      handleTranscriptionComplete(message.data);
      break;
    case 'summaryComplete':
      handleSummaryComplete(message.data);
      break;
    case 'error':
      showError(message.error);
      break;
  }
}

// 文字起こし完了
function handleTranscriptionComplete(data) {
  currentTranscript = data;
  displayTranscript(data);
  statusText.textContent = '文字起こし完了';
  loadHistory();
}

// 要約完了
function handleSummaryComplete(data) {
  if (currentTranscript && currentTranscript.id === data.id) {
    currentTranscript.summary = data.summary;
    summaryContent.style.display = 'block';
    summaryText.textContent = data.summary;
  }
  statusText.textContent = '要約完了';
  loadHistory();
}

// 通知表示
function showNotification(message) {
  // 簡易的な通知（将来的にはtoast通知などを実装）
  console.log('Notification:', message);
  const originalText = statusText.textContent;
  statusText.textContent = message;
  setTimeout(() => {
    statusText.textContent = originalText;
  }, 2000);
}

// エラー表示
function showError(message) {
  console.error('Error:', message);
  statusText.textContent = `エラー: ${message}`;
  statusText.style.color = '#f44336';
  setTimeout(() => {
    statusText.style.color = '';
    statusText.textContent = '準備完了';
  }, 5000);
}

// ユーティリティ関数
function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function formatDuration(seconds) {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;

  if (hours > 0) {
    return `${hours}時間${minutes}分`;
  } else if (minutes > 0) {
    return `${minutes}分${secs}秒`;
  } else {
    return `${secs}秒`;
  }
}

function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
