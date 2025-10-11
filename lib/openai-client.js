// openai-client.js - OpenAI API統合

class OpenAIClient {
  // 定数
  static MAX_FILE_SIZE = 25 * 1024 * 1024; // 25MB

  constructor(apiKey) {
    this.apiKey = apiKey;
    this.baseURL = 'https://api.openai.com/v1';
  }

  /**
   * 音声を文字起こし（Whisper API）
   * @param {Blob} audioBlob - 音声データ
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 文字起こし結果
   */
  async transcribe(audioBlob, options = {}) {
    try {
      const {
        language = 'ja',
        prompt = '',
        temperature = 0
      } = options;

      console.log('Transcribing audio:', {
        size: audioBlob.size,
        type: audioBlob.type,
        language
      });

      // ファイルサイズチェック（25MB制限）
      if (audioBlob.size > OpenAIClient.MAX_FILE_SIZE) {
        throw new Error(`ファイルサイズが大きすぎます（最大25MB）。現在: ${(audioBlob.size / 1024 / 1024).toFixed(2)}MB`);
      }

      // FormDataを作成
      const formData = new FormData();
      // Blobのtypeから拡張子を取得（例: audio/webm → webm）
      const extension = audioBlob.type.split('/')[1] || 'webm';
      formData.append('file', audioBlob, `audio.${extension}`);
      formData.append('model', 'whisper-1');
      formData.append('language', language);
      formData.append('temperature', temperature);

      if (prompt) {
        formData.append('prompt', prompt);
      }

      // API呼び出し
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
      console.log('Transcription completed:', {
        textLength: data.text.length
      });

      return {
        text: data.text,
        language: language
      };
    } catch (error) {
      console.error('Transcription failed:', error);
      throw error;
    }
  }

  /**
   * テキストを要約（GPT-4 API）
   * @param {string} transcript - 文字起こしテキスト
   * @param {Object} options - オプション
   * @returns {Promise<Object>} 要約結果
   */
  async summarize(transcript, options = {}) {
    try {
      const {
        model = 'gpt-4o-mini',
        maxTokens = 1000,
        temperature = 0.7,
        customPrompt = ''
      } = options;

      console.log('Generating summary:', {
        transcriptLength: transcript.length,
        model,
        hasCustomPrompt: !!customPrompt
      });

      // プロンプト作成（カスタムプロンプトがあれば使用）
      let userPrompt;
      if (customPrompt) {
        // カスタムプロンプトを使用
        userPrompt = `${customPrompt}\n\n以下が会議の文字起こしです：\n\n${transcript}`;
      } else {
        // デフォルトプロンプトを使用
        const defaultPrompt = `以下の会議の文字起こしを要約してください。重要なポイント、決定事項、アクションアイテムを明確に記載してください。`;
        userPrompt = `${defaultPrompt}\n\n${transcript}`;
      }

      const systemPrompt = 'あなたは会議の議事録作成アシスタントです。簡潔で分かりやすい要約を作成してください。';

      // API呼び出し
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          model: model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userPrompt }
          ],
          temperature: temperature,
          max_tokens: maxTokens
        })
      });

      if (!response.ok) {
        await this.handleAPIError(response);
      }

      const data = await response.json();
      const summary = data.choices[0].message.content;

      console.log('Summary generated:', {
        summaryLength: summary.length,
        tokensUsed: data.usage.total_tokens
      });

      return {
        summary: summary,
        tokens: data.usage.total_tokens
      };
    } catch (error) {
      console.error('Summary generation failed:', error);
      throw error;
    }
  }

  /**
   * APIエラーをハンドリング
   * @param {Response} response
   */
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

  /**
   * 処理コストを見積もり
   * @param {number} audioDurationSeconds - 音声の長さ（秒）
   * @param {number} transcriptLength - 文字起こしの長さ（文字数）
   * @returns {Object} コスト見積もり
   */
  estimateCost(audioDurationSeconds, transcriptLength = 0) {
    // Whisper API: $0.006 / 分
    const whisperCost = (audioDurationSeconds / 60) * 0.006;

    // GPT-4 API（概算）
    // 1文字 ≈ 0.5トークン（日本語）
    // Input: $0.01 / 1K tokens, Output: $0.03 / 1K tokens
    let gpt4Cost = 0;
    if (transcriptLength > 0) {
      const inputTokens = transcriptLength * 0.5;
      const outputTokens = 500; // 要約は平均500トークン程度
      gpt4Cost = (inputTokens / 1000) * 0.01 + (outputTokens / 1000) * 0.03;
    }

    return {
      whisper: parseFloat(whisperCost.toFixed(4)),
      gpt4: parseFloat(gpt4Cost.toFixed(4)),
      total: parseFloat((whisperCost + gpt4Cost).toFixed(4))
    };
  }

  /**
   * APIキーが有効かテスト
   * @returns {Promise<boolean>}
   */
  async testConnection() {
    try {
      const response = await fetch(`${this.baseURL}/models`, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`
        }
      });

      return response.ok;
    } catch (error) {
      console.error('Connection test failed:', error);
      return false;
    }
  }
}

// エクスポート（Chrome拡張用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = OpenAIClient;
}
