// audio-storage.js - IndexedDB音声ストレージ

class AudioStorage {
  // 定数
  static DB_NAME = 'KoeMojiAudioDB';
  static DB_VERSION = 1;
  static STORE_NAME = 'audioRecordings';
  static DEFAULT_RETENTION_HOURS = 24;

  constructor() {
    this.db = null;
  }

  /**
   * データベースを初期化
   * @returns {Promise<IDBDatabase>}
   */
  async init() {
    if (this.db) {
      return this.db;
    }

    return new Promise((resolve, reject) => {
      const request = indexedDB.open(AudioStorage.DB_NAME, AudioStorage.DB_VERSION);

      request.onerror = () => {
        console.error('Failed to open IndexedDB:', request.error);
        reject(new Error('IndexedDBの初期化に失敗しました'));
      };

      request.onsuccess = () => {
        this.db = request.result;
        console.log('IndexedDB initialized successfully');
        resolve(this.db);
      };

      request.onupgradeneeded = (event) => {
        const db = event.target.result;

        // オブジェクトストアを作成
        if (!db.objectStoreNames.contains(AudioStorage.STORE_NAME)) {
          const objectStore = db.createObjectStore(AudioStorage.STORE_NAME, { keyPath: 'id' });

          // インデックスを作成
          objectStore.createIndex('timestamp', 'timestamp', { unique: false });
          objectStore.createIndex('transcriptId', 'transcriptId', { unique: true });

          console.log('Object store created');
        }
      };
    });
  }

  /**
   * 音声を保存
   * @param {string} transcriptId - 文字起こしID
   * @param {Blob} audioBlob - 音声データ
   * @param {Object} metadata - メタデータ
   * @returns {Promise<void>}
   */
  async saveAudio(transcriptId, audioBlob, metadata = {}) {
    try {
      await this.init();

      const record = {
        id: transcriptId,
        transcriptId: transcriptId,
        audioBlob: audioBlob,
        timestamp: new Date().toISOString(),
        size: audioBlob.size,
        type: audioBlob.type,
        duration: metadata.duration || 0,
        expiresAt: this.calculateExpiryDate(metadata.retentionHours),
        ...metadata
      };

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([AudioStorage.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(AudioStorage.STORE_NAME);
        const request = objectStore.put(record);

        request.onsuccess = () => {
          console.log('Audio saved to IndexedDB:', transcriptId, `(${(audioBlob.size / 1024 / 1024).toFixed(2)}MB)`);
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to save audio:', request.error);
          reject(new Error('音声の保存に失敗しました'));
        };
      });
    } catch (error) {
      console.error('Failed to save audio:', error);
      throw error;
    }
  }

  /**
   * 音声を取得
   * @param {string} transcriptId - 文字起こしID
   * @returns {Promise<Object|null>}
   */
  async getAudio(transcriptId) {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([AudioStorage.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(AudioStorage.STORE_NAME);
        const request = objectStore.get(transcriptId);

        request.onsuccess = () => {
          if (request.result) {
            console.log('Audio retrieved from IndexedDB:', transcriptId);
            resolve(request.result);
          } else {
            console.log('Audio not found:', transcriptId);
            resolve(null);
          }
        };

        request.onerror = () => {
          console.error('Failed to get audio:', request.error);
          reject(new Error('音声の取得に失敗しました'));
        };
      });
    } catch (error) {
      console.error('Failed to get audio:', error);
      throw error;
    }
  }

  /**
   * 音声を削除
   * @param {string} transcriptId - 文字起こしID
   * @returns {Promise<void>}
   */
  async deleteAudio(transcriptId) {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([AudioStorage.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(AudioStorage.STORE_NAME);
        const request = objectStore.delete(transcriptId);

        request.onsuccess = () => {
          console.log('Audio deleted from IndexedDB:', transcriptId);
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to delete audio:', request.error);
          reject(new Error('音声の削除に失敗しました'));
        };
      });
    } catch (error) {
      console.error('Failed to delete audio:', error);
      throw error;
    }
  }

  /**
   * すべての音声を取得
   * @returns {Promise<Array>}
   */
  async getAllAudios() {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([AudioStorage.STORE_NAME], 'readonly');
        const objectStore = transaction.objectStore(AudioStorage.STORE_NAME);
        const request = objectStore.getAll();

        request.onsuccess = () => {
          console.log(`Retrieved ${request.result.length} audio recordings`);
          resolve(request.result);
        };

        request.onerror = () => {
          console.error('Failed to get all audios:', request.error);
          reject(new Error('音声一覧の取得に失敗しました'));
        };
      });
    } catch (error) {
      console.error('Failed to get all audios:', error);
      throw error;
    }
  }

  /**
   * 期限切れの音声を削除
   * @returns {Promise<number>} 削除件数
   */
  async cleanupExpiredAudios() {
    try {
      await this.init();

      const audios = await this.getAllAudios();
      const now = new Date();
      let deletedCount = 0;

      for (const audio of audios) {
        if (audio.expiresAt && new Date(audio.expiresAt) < now) {
          await this.deleteAudio(audio.transcriptId);
          deletedCount++;
        }
      }

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} expired audio recordings`);
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup expired audios:', error);
      throw error;
    }
  }

  /**
   * 古い音声を削除（件数制限）
   * @param {number} maxCount - 最大保持件数
   * @returns {Promise<number>} 削除件数
   */
  async cleanupOldAudios(maxCount = 20) {
    try {
      await this.init();

      const audios = await this.getAllAudios();

      if (audios.length <= maxCount) {
        return 0;
      }

      // タイムスタンプでソート（古い順）
      audios.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

      // 超過分を削除
      const toDelete = audios.slice(0, audios.length - maxCount);
      let deletedCount = 0;

      for (const audio of toDelete) {
        await this.deleteAudio(audio.transcriptId);
        deletedCount++;
      }

      if (deletedCount > 0) {
        console.log(`Cleaned up ${deletedCount} old audio recordings (max: ${maxCount})`);
      }

      return deletedCount;
    } catch (error) {
      console.error('Failed to cleanup old audios:', error);
      throw error;
    }
  }

  /**
   * 使用容量を取得
   * @returns {Promise<Object>}
   */
  async getStorageUsage() {
    try {
      const audios = await this.getAllAudios();
      const totalSize = audios.reduce((sum, audio) => sum + (audio.size || 0), 0);

      return {
        count: audios.length,
        totalSize: totalSize,
        totalSizeMB: (totalSize / 1024 / 1024).toFixed(2),
        audios: audios.map(audio => ({
          id: audio.transcriptId,
          size: audio.size,
          sizeMB: (audio.size / 1024 / 1024).toFixed(2),
          timestamp: audio.timestamp,
          expiresAt: audio.expiresAt
        }))
      };
    } catch (error) {
      console.error('Failed to get storage usage:', error);
      throw error;
    }
  }

  /**
   * すべての音声を削除
   * @returns {Promise<void>}
   */
  async clearAll() {
    try {
      await this.init();

      return new Promise((resolve, reject) => {
        const transaction = this.db.transaction([AudioStorage.STORE_NAME], 'readwrite');
        const objectStore = transaction.objectStore(AudioStorage.STORE_NAME);
        const request = objectStore.clear();

        request.onsuccess = () => {
          console.log('All audio recordings cleared');
          resolve();
        };

        request.onerror = () => {
          console.error('Failed to clear audios:', request.error);
          reject(new Error('音声の一括削除に失敗しました'));
        };
      });
    } catch (error) {
      console.error('Failed to clear all audios:', error);
      throw error;
    }
  }

  /**
   * 有効期限を計算
   * @param {number} retentionHours - 保持時間（時間）
   * @returns {string} ISO形式の日時
   */
  calculateExpiryDate(retentionHours) {
    const hours = retentionHours || AudioStorage.DEFAULT_RETENTION_HOURS;
    const expiryDate = new Date();
    expiryDate.setHours(expiryDate.getHours() + hours);
    return expiryDate.toISOString();
  }

  /**
   * データベースを閉じる
   */
  close() {
    if (this.db) {
      this.db.close();
      this.db = null;
      console.log('IndexedDB closed');
    }
  }
}

// エクスポート（Chrome拡張用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioStorage;
}
