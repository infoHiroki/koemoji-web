// settings.js - 設定画面制御

// DOM要素の取得
const apiKeyInput = document.getElementById('apiKey');
const recordingDeviceSelect = document.getElementById('recordingDevice');
const languageSelect = document.getElementById('language');
const autoSummarizeCheckbox = document.getElementById('autoSummarize');
const summaryModelSelect = document.getElementById('summaryModel');
const summaryPromptTextarea = document.getElementById('summaryPrompt');
const audioRetentionHoursSelect = document.getElementById('audioRetentionHours');
const maxAudioCountSelect = document.getElementById('maxAudioCount');
const testBtn = document.getElementById('testBtn');
const saveBtn = document.getElementById('saveBtn');

// 初期化
document.addEventListener('DOMContentLoaded', async () => {
  console.log('Settings page initialized');
  await loadSettings();
  await loadAudioDevices();
  setupEventListeners();
});

// イベントリスナーの設定
function setupEventListeners() {
  saveBtn.addEventListener('click', handleSave);
  testBtn.addEventListener('click', handleTest);
}

// 設定読み込み
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getSettings'
    });

    if (response.success) {
      const settings = response.settings || {};

      apiKeyInput.value = settings.apiKey || '';
      languageSelect.value = settings.language || 'ja';
      autoSummarizeCheckbox.checked = settings.autoSummarize !== false;
      summaryModelSelect.value = settings.summaryModel || 'gpt-4o-mini';
      summaryPromptTextarea.value = settings.summaryPrompt || '';
      audioRetentionHoursSelect.value = String(settings.audioRetentionHours || 24);
      maxAudioCountSelect.value = String(settings.maxAudioCount || 20);

      // 録音デバイスは後で設定
      if (settings.recordingDevice) {
        recordingDeviceSelect.dataset.selectedDevice = settings.recordingDevice;
      }
    }
  } catch (error) {
    console.error('Failed to load settings:', error);
    showStatus('設定の読み込みに失敗しました', 'error');
  }
}

// 音声デバイス読み込み
async function loadAudioDevices() {
  try {
    // マイク権限を要求
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => track.stop());

    // デバイス一覧を取得
    const devices = await navigator.mediaDevices.enumerateDevices();
    const audioInputs = devices.filter(device => device.kind === 'audioinput');

    // セレクトボックスに追加
    recordingDeviceSelect.innerHTML = '<option value="">デバイスを選択...</option>';

    audioInputs.forEach(device => {
      const option = document.createElement('option');
      option.value = device.deviceId;
      option.textContent = device.label || `デバイス ${device.deviceId.slice(0, 8)}...`;
      recordingDeviceSelect.appendChild(option);
    });

    // 保存されているデバイスを選択
    const selectedDevice = recordingDeviceSelect.dataset.selectedDevice;
    if (selectedDevice) {
      recordingDeviceSelect.value = selectedDevice;
    }

    console.log(`Found ${audioInputs.length} audio input devices`);
  } catch (error) {
    console.error('Failed to load audio devices:', error);
    recordingDeviceSelect.innerHTML = '<option value="">マイク権限が必要です</option>';
  }
}

// 設定保存
async function handleSave() {
  try {
    const apiKey = apiKeyInput.value.trim();
    const recordingDevice = recordingDeviceSelect.value;
    const language = languageSelect.value;
    const autoSummarize = autoSummarizeCheckbox.checked;
    const summaryModel = summaryModelSelect.value;
    const summaryPrompt = summaryPromptTextarea.value.trim();
    const audioRetentionHours = parseInt(audioRetentionHoursSelect.value, 10);
    const maxAudioCount = parseInt(maxAudioCountSelect.value, 10);

    console.log('Saving settings:', {
      hasApiKey: !!apiKey,
      recordingDevice,
      language,
      autoSummarize,
      summaryModel,
      hasSummaryPrompt: !!summaryPrompt,
      audioRetentionHours,
      maxAudioCount
    });

    // バリデーション
    if (!apiKey) {
      showStatus('APIキーを入力してください', 'error');
      apiKeyInput.focus();
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      showStatus('APIキーの形式が正しくありません（sk-で始まる必要があります）', 'error');
      apiKeyInput.focus();
      return;
    }

    if (!recordingDevice) {
      showStatus('録音デバイスを選択してください', 'error');
      recordingDeviceSelect.focus();
      return;
    }

    // 保存
    const settingsToSave = {
      apiKey,
      recordingDevice,
      language,
      autoSummarize,
      summaryModel,
      summaryPrompt,
      audioRetentionHours,
      maxAudioCount
    };

    console.log('Sending saveSettings message:', settingsToSave);

    const response = await chrome.runtime.sendMessage({
      action: 'saveSettings',
      settings: settingsToSave
    });

    console.log('Save response:', response);

    if (response.success) {
      showStatus('設定を保存しました', 'success');
      console.log('Settings saved successfully');
    } else {
      throw new Error(response.error || '保存に失敗しました');
    }
  } catch (error) {
    console.error('Failed to save settings:', error);
    showStatus('設定の保存に失敗しました: ' + error.message, 'error');
  }
}

// 接続テスト
async function handleTest() {
  try {
    const apiKey = apiKeyInput.value.trim();

    if (!apiKey) {
      showStatus('APIキーを入力してください', 'error');
      apiKeyInput.focus();
      return;
    }

    // ボタンを無効化
    testBtn.disabled = true;
    testBtn.textContent = 'テスト中...';

    // テストリクエスト
    const response = await fetch('https://api.openai.com/v1/models', {
      method: 'GET',
      headers: {
        'Authorization': `Bearer ${apiKey}`
      }
    });

    if (response.ok) {
      showStatus('接続成功！APIキーは有効です', 'success');
    } else if (response.status === 401) {
      showStatus('APIキーが無効です', 'error');
    } else if (response.status === 429) {
      showStatus('レート制限に達しています', 'error');
    } else {
      showStatus(`接続エラー: ${response.status}`, 'error');
    }
  } catch (error) {
    console.error('Connection test failed:', error);
    showStatus('接続テストに失敗しました: ' + error.message, 'error');
  } finally {
    // ボタンを元に戻す
    testBtn.disabled = false;
    testBtn.innerHTML = '<span>🧪</span> 接続テスト';
  }
}

// ステータスメッセージ表示
function showStatus(message, type = 'success') {
  // 既存のメッセージを削除
  const existing = document.querySelector('.status-message');
  if (existing) {
    existing.remove();
  }

  // 新しいメッセージを作成
  const statusDiv = document.createElement('div');
  statusDiv.className = `status-message ${type}`;
  statusDiv.textContent = message;
  document.body.appendChild(statusDiv);

  // 3秒後に自動で削除
  setTimeout(() => {
    statusDiv.remove();
  }, 3000);
}
