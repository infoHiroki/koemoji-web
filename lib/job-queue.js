// job-queue.js - ジョブキュー管理
// データロスを防ぐため、すべてのジョブをchrome.storage.localに永続化

class JobQueue {
  /**
   * ジョブステータスの定義
   */
  static STATUS = {
    QUEUED: 'queued',        // キューに追加済み、未処理
    PROCESSING: 'processing', // 処理中
    COMPLETED: 'completed',   // 完了
    FAILED: 'failed'          // 失敗
  };

  /**
   * ストレージキー
   */
  static STORAGE_KEY = 'jobQueue';

  /**
   * ジョブをキューに追加
   * @param {Object} jobData - ジョブデータ
   * @param {string} jobData.transcriptId - transcript ID
   * @param {Array} jobData.chunks - 音声チャンク（Base64エンコード済み）
   * @param {Object} jobData.metadata - 録音メタデータ
   * @returns {Promise<string>} ジョブID
   */
  static async addJob(jobData) {
    try {
      const { transcriptId, chunks, metadata } = jobData;

      if (!transcriptId || !chunks || !metadata) {
        throw new Error('Invalid job data: transcriptId, chunks, and metadata are required');
      }

      // ジョブオブジェクトを作成
      const job = {
        id: transcriptId, // ジョブIDはtranscriptIDと同じ
        status: JobQueue.STATUS.QUEUED,
        transcriptId: transcriptId,
        chunks: chunks,
        metadata: metadata,
        createdAt: Date.now(),
        startedAt: null,
        completedAt: null,
        error: null
      };

      // 既存のキューを取得
      const queue = await this.getQueue();

      // 同じIDのジョブが既に存在する場合はエラー
      const existingJob = queue.find(j => j.id === job.id);
      if (existingJob) {
        throw new Error(`Job with ID ${job.id} already exists`);
      }

      // キューに追加
      queue.push(job);

      // 保存
      await this.saveQueue(queue);

      console.log('Job added to queue:', job.id);
      return job.id;
    } catch (error) {
      console.error('Failed to add job to queue:', error);
      throw error;
    }
  }

  /**
   * 次の処理対象ジョブを取得
   * @returns {Promise<Object|null>} ジョブオブジェクト、または null
   */
  static async getNextJob() {
    try {
      const queue = await this.getQueue();

      // QUEUEDステータスのジョブを古い順に取得
      const queuedJobs = queue
        .filter(job => job.status === JobQueue.STATUS.QUEUED)
        .sort((a, b) => a.createdAt - b.createdAt);

      if (queuedJobs.length === 0) {
        return null;
      }

      return queuedJobs[0];
    } catch (error) {
      console.error('Failed to get next job:', error);
      throw error;
    }
  }

  /**
   * ジョブのステータスを更新
   * @param {string} jobId - ジョブID
   * @param {string} status - 新しいステータス
   * @param {Object} data - 追加データ（error、結果など）
   * @returns {Promise<void>}
   */
  static async updateJobStatus(jobId, status, data = {}) {
    try {
      if (!Object.values(JobQueue.STATUS).includes(status)) {
        throw new Error(`Invalid status: ${status}`);
      }

      const queue = await this.getQueue();
      const jobIndex = queue.findIndex(job => job.id === jobId);

      if (jobIndex === -1) {
        throw new Error(`Job not found: ${jobId}`);
      }

      // ステータスを更新
      queue[jobIndex].status = status;

      // ステータスに応じてタイムスタンプを更新
      if (status === JobQueue.STATUS.PROCESSING) {
        queue[jobIndex].startedAt = Date.now();
      } else if (status === JobQueue.STATUS.COMPLETED || status === JobQueue.STATUS.FAILED) {
        queue[jobIndex].completedAt = Date.now();
      }

      // 追加データをマージ
      Object.assign(queue[jobIndex], data);

      // 保存
      await this.saveQueue(queue);

      console.log(`Job ${jobId} status updated to ${status}`);
    } catch (error) {
      console.error('Failed to update job status:', error);
      throw error;
    }
  }

  /**
   * 特定のジョブを取得
   * @param {string} jobId - ジョブID
   * @returns {Promise<Object|null>} ジョブオブジェクト、または null
   */
  static async getJob(jobId) {
    try {
      const queue = await this.getQueue();
      const job = queue.find(j => j.id === jobId);
      return job || null;
    } catch (error) {
      console.error('Failed to get job:', error);
      throw error;
    }
  }

  /**
   * すべてのジョブを取得
   * @returns {Promise<Array>} ジョブの配列
   */
  static async getAllJobs() {
    try {
      return await this.getQueue();
    } catch (error) {
      console.error('Failed to get all jobs:', error);
      throw error;
    }
  }

  /**
   * ジョブを削除
   * @param {string} jobId - ジョブID
   * @returns {Promise<void>}
   */
  static async deleteJob(jobId) {
    try {
      const queue = await this.getQueue();
      const filteredQueue = queue.filter(job => job.id !== jobId);

      await this.saveQueue(filteredQueue);

      console.log('Job deleted:', jobId);
    } catch (error) {
      console.error('Failed to delete job:', error);
      throw error;
    }
  }

  /**
   * 処理中のジョブを取得（Service Worker再起動時の復旧用）
   * @returns {Promise<Array>} 処理中のジョブの配列
   */
  static async getProcessingJobs() {
    try {
      const queue = await this.getQueue();
      return queue.filter(job => job.status === JobQueue.STATUS.PROCESSING);
    } catch (error) {
      console.error('Failed to get processing jobs:', error);
      throw error;
    }
  }

  /**
   * 処理中のジョブをキューに戻す（Service Worker再起動時の復旧用）
   * @returns {Promise<number>} 復旧したジョブ数
   */
  static async recoverProcessingJobs() {
    try {
      const processingJobs = await this.getProcessingJobs();

      if (processingJobs.length === 0) {
        console.log('No processing jobs to recover');
        return 0;
      }

      console.log(`Recovering ${processingJobs.length} processing jobs...`);

      // すべての処理中ジョブをQUEUEDに戻す
      for (const job of processingJobs) {
        await this.updateJobStatus(job.id, JobQueue.STATUS.QUEUED, {
          startedAt: null,
          error: null
        });
        console.log(`Job ${job.id} recovered to QUEUED status`);
      }

      return processingJobs.length;
    } catch (error) {
      console.error('Failed to recover processing jobs:', error);
      throw error;
    }
  }

  /**
   * 完了済みジョブをクリーンアップ（古いジョブを削除）
   * @param {number} maxAge - 保持期間（ミリ秒）、デフォルト24時間
   * @returns {Promise<number>} 削除したジョブ数
   */
  static async cleanupCompletedJobs(maxAge = 24 * 60 * 60 * 1000) {
    try {
      const queue = await this.getQueue();
      const now = Date.now();

      const oldCompletedJobs = queue.filter(job =>
        (job.status === JobQueue.STATUS.COMPLETED || job.status === JobQueue.STATUS.FAILED) &&
        job.completedAt &&
        (now - job.completedAt) > maxAge
      );

      if (oldCompletedJobs.length === 0) {
        return 0;
      }

      console.log(`Cleaning up ${oldCompletedJobs.length} old completed jobs...`);

      const filteredQueue = queue.filter(job => !oldCompletedJobs.includes(job));
      await this.saveQueue(filteredQueue);

      return oldCompletedJobs.length;
    } catch (error) {
      console.error('Failed to cleanup completed jobs:', error);
      throw error;
    }
  }

  /**
   * キューをストレージから取得
   * @private
   * @returns {Promise<Array>} ジョブの配列
   */
  static async getQueue() {
    try {
      const result = await chrome.storage.local.get(JobQueue.STORAGE_KEY);
      return result[JobQueue.STORAGE_KEY] || [];
    } catch (error) {
      console.error('Failed to get queue from storage:', error);
      throw error;
    }
  }

  /**
   * キューをストレージに保存
   * @private
   * @param {Array} queue - ジョブの配列
   * @returns {Promise<void>}
   */
  static async saveQueue(queue) {
    try {
      await chrome.storage.local.set({ [JobQueue.STORAGE_KEY]: queue });
    } catch (error) {
      console.error('Failed to save queue to storage:', error);
      throw error;
    }
  }

  /**
   * キュー全体をクリア（テスト用、本番では使用しない）
   * @returns {Promise<void>}
   */
  static async clearQueue() {
    try {
      await this.saveQueue([]);
      console.log('Queue cleared');
    } catch (error) {
      console.error('Failed to clear queue:', error);
      throw error;
    }
  }
}

// エクスポート（Chrome拡張用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = JobQueue;
}

// ブラウザ環境用（グローバルに公開）
if (typeof window !== 'undefined') {
  window.JobQueue = JobQueue;
}
