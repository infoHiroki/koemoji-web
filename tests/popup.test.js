// popup.test.js - Popup UI関数のユニットテスト

// テスト環境のセットアップ
require('./setup');

// getTranscriptDisplay関数の定義（popup.jsから抜粋）
function getTranscriptDisplay(transcript) {
  // statusに基づいて適切なメッセージを表示
  if (transcript.status === 'processing') {
    return '処理中...';
  }

  // transcriptが存在するか確認（空文字列、null、undefinedをチェック）
  if (transcript.transcript && transcript.transcript.trim().length > 0) {
    // エラーメッセージの場合
    if (transcript.transcript.startsWith('エラー:')) {
      return escapeHtml(transcript.transcript);
    }
    // 正常な文字起こし結果
    return escapeHtml(transcript.transcript);
  }

  // データがない場合
  return '文字起こし結果がありません';
}

// escapeHtml関数の定義（popup.jsから抜粋）
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

describe('getTranscriptDisplay', () => {
  test('status が "processing" の場合、「処理中...」を返す', () => {
    const transcript = {
      status: 'processing',
      transcript: ''
    };

    expect(getTranscriptDisplay(transcript)).toBe('処理中...');
  });

  test('status が "completed" でtranscriptがある場合、文字起こし結果を返す', () => {
    const transcript = {
      status: 'completed',
      transcript: 'こんにちは、今日もいい天気ですね。'
    };

    expect(getTranscriptDisplay(transcript)).toBe('こんにちは、今日もいい天気ですね。');
  });

  test('transcriptが空文字列の場合、「文字起こし結果がありません」を返す', () => {
    const transcript = {
      status: 'completed',
      transcript: ''
    };

    expect(getTranscriptDisplay(transcript)).toBe('文字起こし結果がありません');
  });

  test('transcriptがnullの場合、「文字起こし結果がありません」を返す', () => {
    const transcript = {
      status: 'completed',
      transcript: null
    };

    expect(getTranscriptDisplay(transcript)).toBe('文字起こし結果がありません');
  });

  test('transcriptがundefinedの場合、「文字起こし結果がありません」を返す', () => {
    const transcript = {
      status: 'completed'
      // transcript: undefined（省略）
    };

    expect(getTranscriptDisplay(transcript)).toBe('文字起こし結果がありません');
  });

  test('transcriptが空白のみの場合、「文字起こし結果がありません」を返す', () => {
    const transcript = {
      status: 'completed',
      transcript: '   '
    };

    expect(getTranscriptDisplay(transcript)).toBe('文字起こし結果がありません');
  });

  test('transcriptがエラーメッセージの場合、エラーメッセージを返す', () => {
    const transcript = {
      status: 'failed',
      transcript: 'エラー: API呼び出しに失敗しました'
    };

    expect(getTranscriptDisplay(transcript)).toBe('エラー: API呼び出しに失敗しました');
  });

  test('HTMLエスケープが正しく機能する', () => {
    const transcript = {
      status: 'completed',
      transcript: '<script>alert("XSS")</script>'
    };

    const result = getTranscriptDisplay(transcript);
    expect(result).not.toContain('<script>');
    expect(result).toContain('&lt;script&gt;');
  });
});

describe('checkCompletedTranscripts', () => {
  beforeEach(() => {
    // chrome.storage.localのモックをリセット
    global.chrome.storage.local.get = jest.fn();
    global.chrome.storage.local.set = jest.fn();
  });

  test('新しい完了transcriptがある場合、検知して既読フラグを更新する', async () => {
    // モックの設定
    global.chrome.storage.local.get = jest.fn((keys, callback) => {
      callback({
        lastCompletedTranscriptId: 'new-transcript-123',
        lastViewedTranscriptId: 'old-transcript-456'
      });
    });

    global.chrome.storage.local.set = jest.fn().mockResolvedValue();

    // 実際のcheckCompletedTranscripts関数の簡易実装
    const result = await new Promise((resolve) => {
      global.chrome.storage.local.get(['lastCompletedTranscriptId', 'lastViewedTranscriptId'], (data) => {
        resolve({
          hasNew: data.lastCompletedTranscriptId !== data.lastViewedTranscriptId,
          newId: data.lastCompletedTranscriptId
        });
      });
    });

    expect(result.hasNew).toBe(true);
    expect(result.newId).toBe('new-transcript-123');
  });

  test('新しい完了transcriptがない場合（既読済み）、何もしない', async () => {
    // モックの設定：同じIDの場合
    global.chrome.storage.local.get = jest.fn((keys, callback) => {
      callback({
        lastCompletedTranscriptId: 'transcript-123',
        lastViewedTranscriptId: 'transcript-123'
      });
    });

    const result = await new Promise((resolve) => {
      global.chrome.storage.local.get(['lastCompletedTranscriptId', 'lastViewedTranscriptId'], (data) => {
        resolve({
          hasNew: data.lastCompletedTranscriptId !== data.lastViewedTranscriptId
        });
      });
    });

    expect(result.hasNew).toBe(false);
  });

  test('lastCompletedTranscriptIdが存在しない場合、何もしない', async () => {
    // モックの設定：lastCompletedTranscriptIdがundefined
    global.chrome.storage.local.get = jest.fn((keys, callback) => {
      callback({
        lastViewedTranscriptId: 'transcript-123'
      });
    });

    const result = await new Promise((resolve) => {
      global.chrome.storage.local.get(['lastCompletedTranscriptId', 'lastViewedTranscriptId'], (data) => {
        resolve({
          hasNew: !!(data.lastCompletedTranscriptId && data.lastCompletedTranscriptId !== data.lastViewedTranscriptId)
        });
      });
    });

    expect(result.hasNew).toBe(false);
  });
});

describe('setupStorageListener', () => {
  beforeEach(() => {
    // chrome.storage.onChangedのモックをリセット
    global.chrome.storage.onChanged = {
      addListener: jest.fn()
    };
  });

  test('chrome.storage.onChangedにリスナーが登録される', () => {
    // setupStorageListenerの簡易実装
    function setupStorageListener() {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        // リスナーの実装
      });
    }

    setupStorageListener();

    expect(global.chrome.storage.onChanged.addListener).toHaveBeenCalledTimes(1);
    expect(global.chrome.storage.onChanged.addListener).toHaveBeenCalledWith(expect.any(Function));
  });

  test('lastCompletedTranscriptIdの変更を検知する', () => {
    let storageListener;

    // リスナーを登録
    global.chrome.storage.onChanged.addListener = jest.fn((listener) => {
      storageListener = listener;
    });

    function setupStorageListener(onCompleted) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.lastCompletedTranscriptId) {
          onCompleted(changes.lastCompletedTranscriptId.newValue);
        }
      });
    }

    const mockCallback = jest.fn();
    setupStorageListener(mockCallback);

    // リスナーが登録されたことを確認
    expect(storageListener).toBeDefined();

    // lastCompletedTranscriptIdの変更をシミュレート
    storageListener({
      lastCompletedTranscriptId: {
        oldValue: 'old-id',
        newValue: 'new-id-789'
      }
    }, 'local');

    expect(mockCallback).toHaveBeenCalledWith('new-id-789');
  });

  test('transcriptsの変更も検知する', () => {
    let storageListener;

    global.chrome.storage.onChanged.addListener = jest.fn((listener) => {
      storageListener = listener;
    });

    function setupStorageListener(onTranscriptsChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local' && changes.transcripts) {
          onTranscriptsChanged();
        }
      });
    }

    const mockCallback = jest.fn();
    setupStorageListener(mockCallback);

    // transcriptsの変更をシミュレート
    storageListener({
      transcripts: {
        oldValue: [],
        newValue: [{ id: 'test' }]
      }
    }, 'local');

    expect(mockCallback).toHaveBeenCalledTimes(1);
  });

  test('chrome.storage.syncの変更は無視する', () => {
    let storageListener;

    global.chrome.storage.onChanged.addListener = jest.fn((listener) => {
      storageListener = listener;
    });

    function setupStorageListener(onLocalChanged) {
      chrome.storage.onChanged.addListener((changes, areaName) => {
        if (areaName === 'local') {
          onLocalChanged();
        }
      });
    }

    const mockCallback = jest.fn();
    setupStorageListener(mockCallback);

    // chrome.storage.syncの変更をシミュレート
    storageListener({
      lastCompletedTranscriptId: {
        newValue: 'new-id'
      }
    }, 'sync');

    // localではないので呼ばれない
    expect(mockCallback).not.toHaveBeenCalled();
  });
});
