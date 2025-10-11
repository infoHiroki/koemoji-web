// settings.js - 設定画面制御

// DOM要素の取得
const apiProviderSelect = document.getElementById('apiProvider');
const apiKeyInput = document.getElementById('apiKey');
const groqApiKeyInput = document.getElementById('groqApiKey');
const openaiSection = document.getElementById('openaiSection');
const groqSection = document.getElementById('groqSection');
const openaiModelGroup = document.getElementById('openaiModelGroup');
const groqModelGroup = document.getElementById('groqModelGroup');
const recordingDeviceSelect = document.getElementById('recordingDevice');
const languageSelect = document.getElementById('language');
const autoSummarizeCheckbox = document.getElementById('autoSummarize');
const summaryModelSelect = document.getElementById('summaryModel');
const groqSummaryModelSelect = document.getElementById('groqSummaryModel');
const summaryPromptTextarea = document.getElementById('summaryPrompt');
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
  apiProviderSelect.addEventListener('change', handleProviderChange);
}

// 設定読み込み
async function loadSettings() {
  try {
    const response = await chrome.runtime.sendMessage({
      action: 'getSettings'
    });

    if (response.success) {
      const settings = response.settings || {};

      apiProviderSelect.value = settings.apiProvider || 'openai';
      apiKeyInput.value = settings.apiKey || '';
      groqApiKeyInput.value = settings.groqApiKey || '';
      languageSelect.value = settings.language || 'ja';
      autoSummarizeCheckbox.checked = settings.autoSummarize !== false;
      summaryModelSelect.value = settings.summaryModel || 'gpt-4o-mini';
      groqSummaryModelSelect.value = settings.summaryModel || 'llama-3.1-70b-versatile';
      summaryPromptTextarea.value = settings.summaryPrompt || '';

      // プロバイダーに応じてUIを切り替え
      handleProviderChange();

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

// プロバイダー変更時の処理
function handleProviderChange() {
  const provider = apiProviderSelect.value;

  if (provider === 'openai') {
    // OpenAI選択時
    groqSection.style.display = 'none';
    groqModelGroup.style.display = 'none';
    openaiModelGroup.style.display = 'block';
  } else if (provider === 'groq') {
    // Groq選択時
    groqSection.style.display = 'block';
    groqModelGroup.style.display = 'block';
    openaiModelGroup.style.display = 'none';
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
    const apiProvider = apiProviderSelect.value;
    const apiKey = apiKeyInput.value.trim();
    const groqApiKey = groqApiKeyInput.value.trim();
    const recordingDevice = recordingDeviceSelect.value;
    const language = languageSelect.value;
    const autoSummarize = autoSummarizeCheckbox.checked;
    const summaryModel = apiProvider === 'groq'
      ? groqSummaryModelSelect.value
      : summaryModelSelect.value;
    const summaryPrompt = summaryPromptTextarea.value.trim();

    console.log('Saving settings:', {
      apiProvider,
      hasApiKey: !!apiKey,
      hasGroqApiKey: !!groqApiKey,
      recordingDevice,
      language,
      autoSummarize,
      summaryModel,
      hasSummaryPrompt: !!summaryPrompt
    });

    // バリデーション
    if (!apiKey) {
      showStatus('OpenAI APIキーを入力してください（Whisper文字起こしに必須）', 'error');
      apiKeyInput.focus();
      return;
    }

    if (!apiKey.startsWith('sk-')) {
      showStatus('OpenAI APIキーの形式が正しくありません（sk-で始まる必要があります）', 'error');
      apiKeyInput.focus();
      return;
    }

    if (apiProvider === 'groq' && !groqApiKey) {
      showStatus('Groq APIキーを入力してください（AI要約に必須）', 'error');
      groqApiKeyInput.focus();
      return;
    }

    if (apiProvider === 'groq' && !groqApiKey.startsWith('gsk_')) {
      showStatus('Groq APIキーの形式が正しくありません（gsk_で始まる必要があります）', 'error');
      groqApiKeyInput.focus();
      return;
    }

    if (!recordingDevice) {
      showStatus('録音デバイスを選択してください', 'error');
      recordingDeviceSelect.focus();
      return;
    }

    // 保存
    const settingsToSave = {
      apiProvider,
      apiKey,
      groqApiKey,
      recordingDevice,
      language,
      autoSummarize,
      summaryModel,
      summaryPrompt
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
