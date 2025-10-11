// content.js - コンテンツスクリプト（Google Meet / Zoom検出）

console.log('KoeMoji-Go Web content script loaded');

// 現在のページを検出
function detectPlatform() {
  const url = window.location.href;

  if (url.includes('meet.google.com')) {
    return 'google-meet';
  } else if (url.includes('zoom.us')) {
    return 'zoom';
  } else {
    return 'unknown';
  }
}

// ページ読み込み時
window.addEventListener('load', () => {
  const platform = detectPlatform();
  console.log('Platform detected:', platform);

  if (platform === 'google-meet') {
    setupGoogleMeet();
  } else if (platform === 'zoom') {
    setupZoom();
  }
});

// Google Meet用セットアップ
function setupGoogleMeet() {
  console.log('Setting up Google Meet integration');

  // 会議開始を検出
  const observer = new MutationObserver((mutations) => {
    // 会議中かどうかを判定（簡易的な実装）
    const meetingUI = document.querySelector('[data-call-ended]');
    if (meetingUI) {
      console.log('Google Meet session detected');
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// Zoom用セットアップ
function setupZoom() {
  console.log('Setting up Zoom integration');

  // Zoom会議の検出（ブラウザ版）
  const observer = new MutationObserver((mutations) => {
    const zoomApp = document.querySelector('#zoom-app');
    if (zoomApp) {
      console.log('Zoom session detected');
    }
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true
  });
}

// バックグラウンドスクリプトからのメッセージを受信
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  console.log('Content script received message:', message);

  // 将来的な拡張用（話者識別、タイムスタンプなど）
  if (message.action === 'detectSpeakers') {
    // 話者情報を抽出（将来の機能）
    sendResponse({ success: true, speakers: [] });
  }

  return true;
});

// ページアンロード時
window.addEventListener('beforeunload', () => {
  console.log('Page unloading');
});
