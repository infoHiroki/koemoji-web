// storage.js - データ永続化

class Storage {
  /**
   * 設定を保存
   * @param {Object} settings
   * @returns {Promise<void>}
   */
  static async saveSettings(settings) {
    try {
      // chrome.storage.sync に保存（Googleアカウントで同期）
      await chrome.storage.sync.set({ settings });
      console.log('Settings saved:', settings);
    } catch (error) {
      console.error('Failed to save settings:', error);
      throw new Error('設定の保存に失敗しました');
    }
  }

  /**
   * 設定を読み込み
   * @returns {Promise<Object>}
   */
  static async loadSettings() {
    try {
      const result = await chrome.storage.sync.get('settings');
      const settings = result.settings || {
        apiKey: '',
        recordingDevice: '',
        language: 'ja',
        autoSummarize: true,
        summaryModel: 'gpt-4o-mini'
      };
      console.log('Settings loaded');
      return settings;
    } catch (error) {
      console.error('Failed to load settings:', error);
      throw new Error('設定の読み込みに失敗しました');
    }
  }

  /**
   * 文字起こし結果を保存
   * @param {Object} transcript
   * @returns {Promise<void>}
   */
  static async saveTranscript(transcript) {
    try {
      // 既存の文字起こしを取得
      const transcripts = await this.loadTranscripts();

      // 新しい文字起こしを先頭に追加
      transcripts.unshift(transcript);

      // 最新20件のみ保持
      const maxTranscripts = 20;
      if (transcripts.length > maxTranscripts) {
        transcripts.splice(maxTranscripts);
      }

      // chrome.storage.local に保存
      await chrome.storage.local.set({ transcripts });
      console.log('Transcript saved:', transcript.id);
    } catch (error) {
      console.error('Failed to save transcript:', error);
      throw new Error('文字起こし結果の保存に失敗しました');
    }
  }

  /**
   * 文字起こし結果を読み込み
   * @returns {Promise<Array>}
   */
  static async loadTranscripts() {
    try {
      const result = await chrome.storage.local.get('transcripts');
      const transcripts = result.transcripts || [];
      console.log(`Loaded ${transcripts.length} transcripts`);
      return transcripts;
    } catch (error) {
      console.error('Failed to load transcripts:', error);
      throw new Error('文字起こし結果の読み込みに失敗しました');
    }
  }

  /**
   * 文字起こし結果を更新
   * @param {string} id
   * @param {Object} updates
   * @returns {Promise<void>}
   */
  static async updateTranscript(id, updates) {
    try {
      const transcripts = await this.loadTranscripts();
      const index = transcripts.findIndex(t => t.id === id);

      if (index === -1) {
        throw new Error('文字起こし結果が見つかりません');
      }

      // 更新
      transcripts[index] = { ...transcripts[index], ...updates };

      // 保存
      await chrome.storage.local.set({ transcripts });
      console.log('Transcript updated:', id);
    } catch (error) {
      console.error('Failed to update transcript:', error);
      throw error;
    }
  }

  /**
   * 文字起こし結果を削除
   * @param {string} id
   * @returns {Promise<void>}
   */
  static async deleteTranscript(id) {
    try {
      const transcripts = await this.loadTranscripts();
      const filtered = transcripts.filter(t => t.id !== id);

      await chrome.storage.local.set({ transcripts: filtered });
      console.log('Transcript deleted:', id);
    } catch (error) {
      console.error('Failed to delete transcript:', error);
      throw new Error('文字起こし結果の削除に失敗しました');
    }
  }

  /**
   * 特定の文字起こし結果を取得
   * @param {string} id
   * @returns {Promise<Object|null>}
   */
  static async getTranscript(id) {
    try {
      const transcripts = await this.loadTranscripts();
      return transcripts.find(t => t.id === id) || null;
    } catch (error) {
      console.error('Failed to get transcript:', error);
      throw error;
    }
  }

  /**
   * すべてのデータをクリア
   * @returns {Promise<void>}
   */
  static async clearAll() {
    try {
      await chrome.storage.local.clear();
      await chrome.storage.sync.clear();
      console.log('All data cleared');
    } catch (error) {
      console.error('Failed to clear data:', error);
      throw new Error('データのクリアに失敗しました');
    }
  }

  /**
   * ストレージ使用量を取得
   * @returns {Promise<Object>}
   */
  static async getStorageUsage() {
    try {
      const localBytes = await chrome.storage.local.getBytesInUse();
      const syncBytes = await chrome.storage.sync.getBytesInUse();

      return {
        local: {
          bytes: localBytes,
          mb: (localBytes / 1024 / 1024).toFixed(2)
        },
        sync: {
          bytes: syncBytes,
          mb: (syncBytes / 1024 / 1024).toFixed(2)
        }
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      throw error;
    }
  }

  /**
   * UUIDを生成
   * @returns {string}
   */
  static generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  /**
   * 文字起こしオブジェクトを作成
   * @param {Object} data
   * @returns {Object}
   */
  static createTranscript(data) {
    return {
      id: this.generateUUID(),
      timestamp: new Date().toISOString(),
      title: data.title || '無題',
      duration: data.duration || 0,
      transcript: data.transcript || '',
      summary: data.summary || null,
      audioSize: data.audioSize || 0,
      platform: data.platform || 'unknown'
    };
  }
}

// エクスポート（Chrome拡張用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = Storage;
}
