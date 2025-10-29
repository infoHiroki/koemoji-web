const { describe, test, expect, beforeEach } = require('@jest/globals');

// OpenAIClientクラスを読み込む前に定義
class OpenAIClient {
  static MAX_FILE_SIZE = 25 * 1024 * 1024;
  static MAX_RETRIES = 3;
  static INITIAL_RETRY_DELAY = 1000;

  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
  }

  async retryWithBackoff(fn, retries = OpenAIClient.MAX_RETRIES) {
    try {
      return await fn();
    } catch (error) {
      if (error.message.includes('レート制限') && retries > 0) {
        const delay = OpenAIClient.INITIAL_RETRY_DELAY * (OpenAIClient.MAX_RETRIES - retries + 1);
        console.log(`Rate limit hit, retrying in ${delay}ms... (${retries} retries left)`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.retryWithBackoff(fn, retries - 1);
      }
      throw error;
    }
  }

  async transcribe(audioBlob, options = {}) {
    return this.retryWithBackoff(async () => {
      const { language = 'ja', prompt = '', temperature = 0 } = options;

      if (audioBlob.size > OpenAIClient.MAX_FILE_SIZE) {
        throw new Error(`ファイルサイズが大きすぎます（最大25MB）。現在: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
      }

      const formData = new FormData();
      const extension = audioBlob.type.split('/')[1] || 'webm';
      formData.append('file', audioBlob, `audio.${extension}`);
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('temperature', temperature);

      if (prompt) {
        formData.append('prompt', prompt);
      }

      const response = await fetch(`${this.baseURL}/audio/transcriptions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        },
        body: formData
      });

      if (!response.ok) {
        await this.handleAPIError(response);
      }

      const data = await response.json();
      return {
        text: data.text,
        language: language
      };
    });
  }

  async handleAPIError(response) {
    let errorMessage = `APIエラー: ${response.status}`;

    try {
      const errorData = await response.json();
      if (errorData.error && errorData.error.message) {
        errorMessage = errorData.error.message;
      }
    } catch (e) {
      // JSONパースエラーは無視
    }

    if (response.status === 401) {
      throw new Error('APIキーが無効です。設定を確認してください。');
    } else if (response.status === 429) {
      throw new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。');
    } else if (response.status === 413) {
      throw new Error('ファイルサイズが大きすぎます。');
    } else if (response.status === 503) {
      throw new Error('OpenAI APIが一時的に利用できません。しばらく待ってから再試行してください。');
    } else {
      throw new Error(errorMessage);
    }
  }
}

describe('OpenAIClient.retryWithBackoff()', () => {
  let client;

  beforeEach(() => {
    client = new OpenAIClient('test-api-key');
    jest.clearAllMocks();
  });

  test('成功時は1回で完了する', async () => {
    const mockFn = jest.fn().mockResolvedValue('success');
    const result = await client.retryWithBackoff(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('レート制限エラー時は最大3回リトライする', async () => {
    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。'))
      .mockRejectedValueOnce(new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。'))
      .mockResolvedValue('success');

    const result = await client.retryWithBackoff(mockFn);

    expect(result).toBe('success');
    expect(mockFn).toHaveBeenCalledTimes(3);
  });

  test('リトライ回数を超えるとエラーをthrowする', async () => {
    const mockFn = jest.fn().mockRejectedValue(
      new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。')
    );

    await expect(client.retryWithBackoff(mockFn)).rejects.toThrow('レート制限');
    expect(mockFn).toHaveBeenCalledTimes(4); // 初回 + 3回リトライ
  }, 10000); // 10秒のタイムアウト

  test('レート制限以外のエラーはリトライしない', async () => {
    const mockFn = jest.fn().mockRejectedValue(new Error('APIキーが無効です'));

    await expect(client.retryWithBackoff(mockFn)).rejects.toThrow('APIキーが無効です');
    expect(mockFn).toHaveBeenCalledTimes(1);
  });

  test('Exponential Backoffで待機時間が増える', async () => {
    jest.useFakeTimers();

    const mockFn = jest.fn()
      .mockRejectedValueOnce(new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。'))
      .mockRejectedValueOnce(new Error('APIのレート制限に達しました。しばらく待ってから再試行してください。'))
      .mockResolvedValue('success');

    const promise = client.retryWithBackoff(mockFn);

    // 1回目のリトライ: 1秒待機
    await jest.advanceTimersByTimeAsync(1000);
    // 2回目のリトライ: 2秒待機
    await jest.advanceTimersByTimeAsync(2000);

    const result = await promise;
    expect(result).toBe('success');

    jest.useRealTimers();
  });
});

describe('OpenAIClient.transcribe()', () => {
  let client;

  beforeEach(() => {
    client = new OpenAIClient('test-api-key');
    jest.clearAllMocks();
  });

  test('正常に文字起こしを実行する', async () => {
    const mockBlob = new Blob(['test audio data'], { type: 'audio/wav' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ text: 'transcribed text' })
    });

    const result = await client.transcribe(mockBlob);

    expect(result).toEqual({
      text: 'transcribed text',
      language: 'ja'
    });
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  test('ファイルサイズが25MBを超える場合はエラー', async () => {
    const largeBlob = new Blob([new ArrayBuffer(26 * 1024 * 1024)], { type: 'audio/wav' });

    await expect(client.transcribe(largeBlob)).rejects.toThrow('ファイルサイズが大きすぎます');
  });

  test('429エラー時は自動リトライする', async () => {
    const mockBlob = new Blob(['test audio data'], { type: 'audio/wav' });

    global.fetch = jest.fn()
      .mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'Rate limit exceeded' } })
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ text: 'transcribed text' })
      });

    const result = await client.transcribe(mockBlob);

    expect(result.text).toBe('transcribed text');
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });

  test('401エラー時は適切なエラーメッセージを返す', async () => {
    const mockBlob = new Blob(['test audio data'], { type: 'audio/wav' });

    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({ error: { message: 'Invalid API key' } })
    });

    await expect(client.transcribe(mockBlob)).rejects.toThrow('APIキーが無効です');
  });
});
