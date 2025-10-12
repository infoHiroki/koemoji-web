// popup.js - メインUI制御

// DOM要素の取得
const startBtn = document.getElementById('startBtn');
const stopBtn = document.getElementById('stopBtn');
const statusIndicator = document.getElementById('statusIndicator');
const statusText = document.getElementById('statusText');
const recordingTime = document.querySelector('.time-display');
const historyList = document.getElementById('historyList');
const deleteAllBtn = document.getElementById('deleteAllBtn');
const refreshHistoryBtn = document.getElementById('refreshHistoryBtn');
const settingsBtn = document.getElementById('settingsBtn');

// 状態管理
let isRecording = false;
let recordingStartTime = null;
let recordingTimer = null;
let currentTranscript = null;
let keepAliveInterval = null;

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

  // 履歴
  deleteAllBtn.addEventListener('click', handleDeleteAll);
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
      statusText.textContent = '処理中...';
    } else {
      throw new Error(response.error || '録音の停止に失敗しました');
    }
  } catch (error) {
    console.error('Failed to stop recording:', error);

    // エラー時はUIを録音停止状態に戻す
    isRecording = false;
    updateRecordingUI(false);

    showError(error.message || '録音の停止に失敗しました');
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

  // Keep-Alive（Service Workerスリープ防止）
  // ポップアップから定期的にpingを送る
  startKeepAlive();
}

// Keep-Aliveを開始
function startKeepAlive() {
  if (keepAliveInterval) {
    return; // 既に実行中
  }

  // 20秒ごとにbackgroundにpingを送る
  keepAliveInterval = setInterval(() => {
    chrome.runtime.sendMessage({ action: 'ping' }).catch(error => {
      console.log('Keep-alive ping failed (background may be sleeping):', error);
    });
  }, 20000); // 20秒
}

// Keep-Aliveを停止
function stopKeepAlive() {
  if (keepAliveInterval) {
    clearInterval(keepAliveInterval);
    keepAliveInterval = null;
  }
}

// 録音タイマー停止
function stopRecordingTimer() {
  if (recordingTimer) {
    clearInterval(recordingTimer);
    recordingTimer = null;
  }

  // Keep-Aliveも停止
  stopKeepAlive();
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

  historyList.innerHTML = transcripts.map(transcript => {
    const summaryHtml = transcript.summary ?
      `<div class="history-summary">
        <div class="history-summary-header">
          <div class="history-summary-title">📋 AI要約</div>
          <button class="btn btn-small btn-text history-copy-summary" data-id="${transcript.id}">
            <span class="btn-icon">📋</span>
            コピー
          </button>
        </div>
        <div class="history-summary-text" data-summary="${escapeHtml(transcript.summary)}"></div>
      </div>` : '';

    // エラー表示と再試行ボタン
    const isError = transcript.transcript && transcript.transcript.startsWith('エラー:');
    const errorHtml = isError && transcript.audioStored ?
      `<div class="error-message">
        <span class="btn-icon">⚠️</span>
        文字起こしに失敗しました。音声ファイルから再試行できます。
      </div>` : '';

    // 再試行ボタン（音声が保存されている場合のみ）
    const retryButton = transcript.audioStored ?
      `<button class="btn btn-small history-retry" data-id="${transcript.id}" title="音声ファイルから文字起こしを再実行">
        <span class="btn-icon">🔄</span>
        再処理
      </button>` : '';

    // 音声ダウンロードボタン（音声が保存されている場合のみ）
    const downloadAudioButton = transcript.audioStored ?
      `<button class="btn btn-small history-download-audio" data-id="${transcript.id}" title="音声ファイルをダウンロード">
        <span class="btn-icon">🎵</span>
        音声DL
      </button>` : '';

    return `
      <div class="history-item" data-id="${transcript.id}">
        <div class="history-item-header">
          <div class="history-item__title" data-id="${transcript.id}">
            <span class="title-text">${escapeHtml(transcript.title || '無題')}</span>
            <button class="edit-title-btn" title="タイトルを編集">✏️</button>
          </div>
          <div class="history-item__meta">
            <span>${formatDate(transcript.timestamp)}</span>
            <span>${formatDuration(transcript.duration)}</span>
            ${transcript.audioStored ? '<span class="audio-stored-badge" title="音声ファイルが保存されています">💾</span>' : ''}
          </div>
        </div>
        <div class="history-item-detail">
          ${errorHtml}
          <div class="history-detail-meta">
            <span class="meta-item">
              <strong>日時:</strong> ${formatDate(transcript.timestamp)}
            </span>
            <span class="meta-item">
              <strong>時間:</strong> ${formatDuration(transcript.duration)}
            </span>
          </div>
          <div class="history-transcript">
            <div class="history-transcript-header">
              <div class="history-transcript-title">文字起こし</div>
              <button class="btn btn-small btn-text history-copy-transcript" data-id="${transcript.id}">
                <span class="btn-icon">📋</span>
                コピー
              </button>
            </div>
            <div class="history-transcript-text">${escapeHtml(transcript.transcript || '文字起こし結果がありません')}</div>
          </div>
          ${summaryHtml}
          <div class="history-item-actions">
            ${retryButton}
            ${downloadAudioButton}
            <button class="btn btn-small history-download" data-id="${transcript.id}">
              <span class="btn-icon">💾</span>
              文字起こしDL
            </button>
            <button class="btn btn-small btn-danger history-delete" data-id="${transcript.id}">
              <span class="btn-icon">🗑️</span>
              削除
            </button>
          </div>
        </div>
      </div>
    `;
  }).join('');

  // マークダウンをレンダリング
  if (typeof marked !== 'undefined') {
    // marked.jsの設定
    marked.setOptions({
      breaks: false,  // 単一改行を<br>に変換しない
      gfm: true       // GitHub Flavored Markdownを使用
    });

    document.querySelectorAll('.history-summary-text').forEach(elem => {
      const summaryMarkdown = elem.dataset.summary;
      if (summaryMarkdown) {
        elem.innerHTML = marked.parse(summaryMarkdown);
      }
    });
  }

  // 履歴アイテムのヘッダークリックイベント（トグル）
  document.querySelectorAll('.history-item-header').forEach(header => {
    header.addEventListener('click', () => {
      const item = header.closest('.history-item');
      const id = item.dataset.id;
      const transcript = transcripts.find(t => t.id === id);

      if (transcript) {
        toggleHistoryItem(item, transcript);
      }
    });
  });

  // 履歴内のアクションボタン
  setupHistoryActions(transcripts);

  // 最新のアイテムを自動展開（currentTranscriptが設定されている場合）
  if (currentTranscript && transcripts.length > 0) {
    const newestItem = document.querySelector(`.history-item[data-id="${currentTranscript.id}"]`);
    if (newestItem) {
      newestItem.classList.add('active');
      // スクロールして表示
      setTimeout(() => {
        newestItem.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }, 100);
    }
  }
}

// 履歴アイテムのトグル
function toggleHistoryItem(item, transcript) {
  const isActive = item.classList.contains('active');

  // すべての履歴アイテムを閉じる
  document.querySelectorAll('.history-item').forEach(i => {
    i.classList.remove('active');
  });

  // クリックされたアイテムをトグル
  if (!isActive) {
    item.classList.add('active');
    currentTranscript = transcript;
    // スクロールして表示
    setTimeout(() => {
      item.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }, 100);
  } else {
    currentTranscript = null;
  }
}

// 履歴内のアクションボタンをセットアップ
function setupHistoryActions(transcripts) {
  // 文字起こしコピー
  document.querySelectorAll('.history-copy-transcript').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation(); // 親のクリックイベントを防ぐ
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript) {
        navigator.clipboard.writeText(transcript.transcript).then(() => {
          showNotification('文字起こしをコピーしました');
        }).catch(error => {
          console.error('Failed to copy:', error);
          showError('コピーに失敗しました');
        });
      }
    });
  });

  // 要約コピー
  document.querySelectorAll('.history-copy-summary').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript && transcript.summary) {
        navigator.clipboard.writeText(transcript.summary).then(() => {
          showNotification('AI要約をコピーしました');
        }).catch(error => {
          console.error('Failed to copy:', error);
          showError('コピーに失敗しました');
        });
      }
    });
  });

  // ダウンロード
  document.querySelectorAll('.history-download').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript) {
        downloadTranscript(transcript);
      }
    });
  });

  // 削除
  document.querySelectorAll('.history-delete').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript && confirm(`「${transcript.title}」を削除しますか？`)) {
        await deleteTranscript(id);
      }
    });
  });

  // タイトル編集
  document.querySelectorAll('.edit-title-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const titleElement = btn.closest('.history-item__title');
      const id = titleElement.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript) {
        startEditingTitle(titleElement, transcript);
      }
    });
  });

  // 再処理
  document.querySelectorAll('.history-retry').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript && confirm(`「${transcript.title}」を音声ファイルから再処理しますか？`)) {
        await retryTranscription(id);
      }
    });
  });

  // 音声ダウンロード
  document.querySelectorAll('.history-download-audio').forEach(btn => {
    btn.addEventListener('click', async (e) => {
      e.stopPropagation();
      const id = btn.dataset.id;
      const transcript = transcripts.find(t => t.id === id);
      if (transcript) {
        await downloadAudio(id, transcript);
      }
    });
  });
}

// タイトル編集開始
function startEditingTitle(titleElement, transcript) {
  const titleText = titleElement.querySelector('.title-text');
  const editBtn = titleElement.querySelector('.edit-title-btn');
  const currentTitle = titleText.textContent;

  // 入力フィールドを作成
  const input = document.createElement('input');
  input.type = 'text';
  input.className = 'title-input';
  input.value = currentTitle;

  // テキストとボタンを非表示にして入力フィールドを表示
  titleText.style.display = 'none';
  editBtn.style.display = 'none';
  titleElement.insertBefore(input, titleText);

  // フォーカスして全選択
  input.focus();
  input.select();

  // 保存処理
  const saveTitle = async () => {
    const newTitle = input.value.trim();
    if (newTitle && newTitle !== currentTitle) {
      try {
        const response = await chrome.runtime.sendMessage({
          action: 'updateTranscriptTitle',
          id: transcript.id,
          title: newTitle
        });

        if (response.success) {
          titleText.textContent = newTitle;
          transcript.title = newTitle;
          showNotification('タイトルを更新しました');
        } else {
          throw new Error(response.error || 'タイトルの更新に失敗しました');
        }
      } catch (error) {
        console.error('Failed to update title:', error);
        showError('タイトルの更新に失敗しました');
      }
    }

    // 入力フィールドを削除して元の表示に戻す
    input.remove();
    titleText.style.display = '';
    editBtn.style.display = '';
  };

  // キャンセル処理
  const cancelEdit = () => {
    input.remove();
    titleText.style.display = '';
    editBtn.style.display = '';
  };

  // イベントリスナー
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      saveTitle();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      cancelEdit();
    }
  });

  input.addEventListener('blur', () => {
    // 少し遅延させてクリックイベントが処理されるようにする
    setTimeout(saveTitle, 100);
  });

  // クリックイベントの伝播を止める
  input.addEventListener('click', (e) => {
    e.stopPropagation();
  });
}

// ファイル名として安全な文字列に変換
function sanitizeFilename(filename) {
  // ファイル名として使用できない文字を置換
  return filename
    .replace(/[/\\?%*:|"<>]/g, '-')  // 特殊文字をハイフンに
    .replace(/\s+/g, '_')             // スペースをアンダースコアに
    .replace(/\.+$/, '')              // 末尾のドットを削除
    .trim();
}

// ダウンロード処理
function downloadTranscript(transcript) {
  try {
    let text = `# ${transcript.title}\n\n`;
    text += `日時: ${formatDate(transcript.timestamp)}\n`;
    text += `時間: ${formatDuration(transcript.duration)}\n\n`;
    text += `## 文字起こし\n\n${transcript.transcript}\n\n`;

    if (transcript.summary) {
      text += `## AI要約\n\n${transcript.summary}\n`;
    }

    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    // タイトルをファイル名に使用
    const filename = sanitizeFilename(transcript.title || 'transcript');
    a.download = `${filename}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('ダウンロードしました');
  } catch (error) {
    console.error('Failed to download:', error);
    showError('ダウンロードに失敗しました');
  }
}

// 削除処理
async function deleteTranscript(id) {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'deleteTranscript',
      id: id
    });

    if (response.success) {
      if (currentTranscript && currentTranscript.id === id) {
        currentTranscript = null;
      }
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

// すべて削除処理
async function handleDeleteAll() {
  try {
    // 確認ダイアログを表示
    if (!confirm('すべての履歴を削除しますか？この操作は取り消せません。')) {
      return;
    }

    const response = await chrome.runtime.sendMessage({
      action: 'deleteAllTranscripts'
    });

    if (response.success) {
      currentTranscript = null;
      await loadHistory();
      showNotification('すべての履歴を削除しました');
    } else {
      throw new Error(response.error || 'すべての履歴の削除に失敗しました');
    }
  } catch (error) {
    console.error('Failed to delete all:', error);
    showError('すべての履歴の削除に失敗しました');
  }
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

  // 履歴を更新（最新アイテムが自動展開される）
  loadHistory();

  statusText.textContent = '文字起こし完了';
}

// 要約完了
function handleSummaryComplete(data) {
  if (currentTranscript && currentTranscript.id === data.id) {
    currentTranscript.summary = data.summary;
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
  alert(`エラー: ${message}`);
  statusText.textContent = '準備完了';
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

// 文字起こしを再試行
async function retryTranscription(transcriptId) {
  try {
    showNotification('再処理を開始しています...');

    const response = await chrome.runtime.sendMessage({
      action: 'retryTranscription',
      transcriptId: transcriptId
    });

    if (response.success) {
      showNotification('再処理を開始しました');
      await loadHistory();
    } else {
      throw new Error(response.error || '再処理の開始に失敗しました');
    }
  } catch (error) {
    console.error('Failed to retry transcription:', error);
    showError('再処理に失敗しました: ' + error.message);
  }
}

// 音声ファイルをダウンロード
async function downloadAudio(transcriptId, transcript) {
  try {
    showNotification('音声ファイルを取得中...');

    // 音声データを取得
    const response = await chrome.runtime.sendMessage({
      action: 'getAudioBlob',
      transcriptId: transcriptId
    });

    if (!response.success) {
      throw new Error(response.error || '音声ファイルの取得に失敗しました');
    }

    // Base64からBlobに変換
    const byteCharacters = atob(response.audioData);
    const byteNumbers = new Array(byteCharacters.length);
    for (let i = 0; i < byteCharacters.length; i++) {
      byteNumbers[i] = byteCharacters.charCodeAt(i);
    }
    const byteArray = new Uint8Array(byteNumbers);
    const audioBlob = new Blob([byteArray], { type: 'audio/webm' });

    // Blob URLを作成してダウンロード
    const url = URL.createObjectURL(audioBlob);
    const a = document.createElement('a');
    a.href = url;

    // ファイル名を生成
    const filename = sanitizeFilename(transcript.title || 'audio');
    a.download = `${filename}_audio.webm`;

    a.click();
    URL.revokeObjectURL(url);

    showNotification('音声ファイルをダウンロードしました');
  } catch (error) {
    console.error('Failed to download audio:', error);
    showError('音声ファイルのダウンロードに失敗しました: ' + error.message);
  }
}
