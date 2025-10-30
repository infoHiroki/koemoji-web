// job-processor.js - ジョブ処理エンジン
// キューからジョブを取得し、文字起こし・要約を実行

(function() {
  'use strict';

  // 既に定義されている場合は早期リターン
  if (typeof self !== 'undefined' && self.JobProcessor) {
    console.log('JobProcessor already defined, skipping');
    return;
  }

  class JobProcessor {
    /**
     * 依存関係をキャッシュ（テスト時にオーバーライド可能）
     */
    static _dependencies = null;

    /**
     * 依存関係を取得（遅延ロード）
     * @returns {Object} - { JobQueue, OpenAIClient, Storage }
     */
    static getDependencies() {
      // テストでオーバーライドされている場合はそれを使用
      if (this._dependencies) {
        return this._dependencies;
      }

      // Chrome拡張環境
      if (typeof self !== 'undefined' && self.JobQueue) {
        return {
          JobQueue: self.JobQueue,
          OpenAIClient: self.OpenAIClient,
          Storage: self.Storage
        };
      }

      // Node.js/テスト環境
      if (typeof require !== 'undefined') {
        return {
          JobQueue: require('./job-queue'),
          OpenAIClient: require('./openai-client'),
          Storage: require('./storage')
        };
      }

      throw new Error('Dependencies not available');
    }
    /**
     * プロセッサーの状態
     */
    static isRunning = false;
    static currentJobId = null;

    /**
     * Keep-Alive interval ID
     */
    static keepAliveIntervalId = null;

    /**
     * プロセッサーを開始
     * @param {Object} settings - OpenAI設定
     * @returns {Promise<void>}
     */
    static async start(settings) {
      if (this.isRunning) {
        console.log('Job processor is already running');
        return;
      }

      this.isRunning = true;
      console.log('Job processor started');

      try {
        const { JobQueue } = this.getDependencies();

        // Service Worker再起動時の復旧
        await JobQueue.recoverProcessingJobs();

        // Keep-Aliveを開始
        this.startKeepAlive();

        // ジョブキューを処理
        await this.processQueue(settings);
      } catch (error) {
        console.error('Job processor error:', error);
      } finally {
        this.isRunning = false;
        this.stopKeepAlive();
        console.log('Job processor stopped');
      }
    }

    /**
     * ジョブキューを処理（逐次実行）
     * @param {Object} settings - OpenAI設定
     * @returns {Promise<void>}
     */
    static async processQueue(settings) {
      const { JobQueue } = this.getDependencies();

      while (true) {
        // 次のジョブを取得
        const job = await JobQueue.getNextJob();

        if (!job) {
          console.log('No more jobs in queue');
          break;
        }

        console.log(`Processing job: ${job.id}`);
        this.currentJobId = job.id;

        try {
          await this.processJob(job, settings);
        } catch (error) {
          console.error(`Job ${job.id} failed:`, error);
          // ジョブは既にFAILEDステータスに更新済み（processJobで処理）
        }

        this.currentJobId = null;
      }
    }

    /**
     * 1つのジョブを処理
     * @param {Object} job - ジョブオブジェクト
     * @param {Object} settings - OpenAI設定
     * @returns {Promise<void>}
     */
    static async processJob(job, settings) {
      const { JobQueue, Storage } = this.getDependencies();

      try {
        // ステータスをPROCESSINGに更新
        await JobQueue.updateJobStatus(job.id, JobQueue.STATUS.PROCESSING);

        // Transcript statusを更新
        await Storage.updateTranscript(job.transcriptId, {
          status: 'processing'
        });

        // 進捗通知
        this.notifyPopup({
          action: 'processingStarted',
          transcriptId: job.transcriptId,
          chunks: job.chunks.length  // popup.jsが期待する形式に修正
        });

        // チャンクを文字起こし
        const fullTranscript = await this.transcribeChunks(job.chunks, job, settings);

        // 文字起こし結果を保存
        await Storage.updateTranscript(job.transcriptId, {
          transcript: fullTranscript,
          status: 'transcribed'
        });

        // 完了通知用のフラグをStorageに書き込み
        await chrome.storage.local.set({
          lastCompletedTranscriptId: job.transcriptId,
          lastCompletedTimestamp: Date.now()
        });

        // 通知
        this.notifyPopup({
          action: 'transcriptionComplete',
          data: {
            id: job.transcriptId,
            transcript: fullTranscript
          }
        });

        // 自動要約が有効な場合
        if (settings.autoSummarize) {
          await this.generateSummary(job.transcriptId, fullTranscript, settings);
        }

        // Transcript statusを更新
        await Storage.updateTranscript(job.transcriptId, {
          status: 'completed'
        });

        // ジョブ完了通知用のフラグをStorageに書き込み
        await chrome.storage.local.set({
          lastCompletedTranscriptId: job.transcriptId,
          lastCompletedTimestamp: Date.now()
        });

        // ジョブステータスをCOMPLETEDに更新
        await JobQueue.updateJobStatus(job.id, JobQueue.STATUS.COMPLETED);

        console.log(`Job ${job.id} completed successfully`);
      } catch (error) {
        console.error(`Job ${job.id} processing failed:`, error);

        // エラーメッセージを保存
        await Storage.updateTranscript(job.transcriptId, {
          transcript: `エラー: ${error.message}`,
          status: 'failed'
        });

        // ジョブステータスをFAILEDに更新
        await JobQueue.updateJobStatus(job.id, JobQueue.STATUS.FAILED, {
          error: error.message
        });

        // エラー通知
        this.notifyPopup({
          action: 'error',
          transcriptId: job.transcriptId,
          error: error.message
        });

        throw error;
      }
    }

    /**
     * チャンクを並列処理して文字起こし
     * @param {Array} chunks - 音声チャンク（Base64エンコード済み）
     * @param {Object} job - ジョブオブジェクト
     * @param {Object} settings - OpenAI設定
     * @returns {Promise<string>} 結合された文字起こし結果
     */
    static async transcribeChunks(chunks, job, settings) {
      console.log(`Starting transcription for ${chunks.length} chunks`);

      const { OpenAIClient } = this.getDependencies();

      // OpenAI Clientを初期化
      const client = new OpenAIClient(settings.apiKey);

      // 各チャンクのBase64をBlobに変換
      const chunksWithBlobs = await Promise.all(
        chunks.map(async (chunk) => ({
          ...chunk,
          blob: await this.base64ToBlob(chunk.audioBlob)
        }))
      );

      // 並列文字起こし処理（最大3並列でレート制限を回避）
      const transcriptionTasks = chunksWithBlobs.map((chunk, index) => async () => {
        try {
          console.log(`Transcribing chunk ${index + 1}/${chunks.length} (${chunk.duration}ms)`);

          // 文字起こし
          const result = await client.transcribe(chunk.blob, {
            language: settings.language
          });

          // 進捗通知
          this.notifyPopup({
            action: 'chunkTranscribed',
            chunk: index + 1,
            total: chunks.length,
            transcriptId: job.transcriptId
          });

          console.log(`Chunk ${index + 1} transcription completed`);

          return {
            index: chunk.index,
            text: result.text,
            startTime: chunk.startTime,
            duration: chunk.duration
          };
        } catch (error) {
          console.error(`Failed to transcribe chunk ${index + 1}:`, error);
          throw error;
        }
      });

      // 並列数を制限して実行（最大3並列）
      const transcribedChunks = await this.limitedParallel(transcriptionTasks, 3);

      // チャンクを時系列順にソート（念のため）
      transcribedChunks.sort((a, b) => a.index - b.index);

      // 文字起こし結果を結合
      const fullTranscript = transcribedChunks.map(chunk => chunk.text).join('\n\n');

      console.log('All chunks transcribed, combined transcript length:', fullTranscript.length);

      return fullTranscript;
    }

    /**
     * 要約を生成
     * @param {string} transcriptId - transcript ID
     * @param {string} transcriptText - 文字起こしテキスト
     * @param {Object} settings - OpenAI設定
     * @returns {Promise<void>}
     */
    static async generateSummary(transcriptId, transcriptText, settings) {
      const { OpenAIClient, Storage } = this.getDependencies();

      try {
        console.log('Generating summary...');

        // OpenAI Clientを初期化
        const client = new OpenAIClient(settings.apiKey);

        // 要約生成（カスタムプロンプトとモデルがあれば使用）
        const options = {};
        if (settings.summaryPrompt) {
          options.customPrompt = settings.summaryPrompt;
        }
        if (settings.summaryModel) {
          options.model = settings.summaryModel;
        }
        const result = await client.summarize(transcriptText, options);

        console.log('Summary generated');

        // 要約を保存
        await Storage.updateTranscript(transcriptId, {
          summary: result.summary
        });

        // 要約完了通知用のフラグをStorageに書き込み
        await chrome.storage.local.set({
          lastCompletedTranscriptId: transcriptId,
          lastCompletedTimestamp: Date.now()
        });

        // 通知
        this.notifyPopup({
          action: 'summaryComplete',
          data: {
            id: transcriptId,
            summary: result.summary
          }
        });
      } catch (error) {
        console.error('Summary generation failed:', error);

        // エラー通知
        this.notifyPopup({
          action: 'error',
          transcriptId: transcriptId,
          error: `要約生成に失敗しました: ${error.message}`
        });

        // 要約失敗はジョブ全体の失敗とはみなさない
        // 文字起こしは成功しているため
      }
    }

    /**
     * 並列数を制限してタスクを実行
     * @param {Array<Function>} tasks - タスク関数の配列
     * @param {number} limit - 最大並列数
     * @returns {Promise<Array>} 実行結果の配列
     */
    static async limitedParallel(tasks, limit = 3) {
      const results = [];
      const executing = [];

      for (const task of tasks) {
        const promise = Promise.resolve().then(() => task()).then(result => {
          executing.splice(executing.indexOf(promise), 1);
          return result;
        });

        results.push(promise);
        executing.push(promise);

        if (executing.length >= limit) {
          await Promise.race(executing);
        }
      }

      return Promise.all(results);
    }

    /**
     * Base64をBlobに変換
     * @param {string} base64 - Base64エンコードされたデータ
     * @returns {Promise<Blob>}
     */
    static async base64ToBlob(base64) {
      const response = await fetch(base64);
      const blob = await response.blob();
      return blob;
    }

    /**
     * Popupに通知
     * @param {Object} message - 通知メッセージ
     */
    static notifyPopup(message) {
      if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.sendMessage) {
        chrome.runtime.sendMessage(message).catch(() => {
          // Popupが開いていない場合はエラーが発生するが、無視する
          console.log('Popup not open, message not sent');
        });
      }
    }

    /**
     * Keep-Aliveを開始（Service Workerを維持）
     */
    static startKeepAlive() {
      if (this.keepAliveIntervalId) {
        return;
      }

      console.log('Starting keep-alive...');

      // 20秒ごとにダミーメッセージを送信してService Workerを維持
      this.keepAliveIntervalId = setInterval(() => {
        console.log('Keep-alive ping');
      }, 20000);
    }

    /**
     * Keep-Aliveを停止
     */
    static stopKeepAlive() {
      if (this.keepAliveIntervalId) {
        clearInterval(this.keepAliveIntervalId);
        this.keepAliveIntervalId = null;
        console.log('Keep-alive stopped');
      }
    }

    /**
     * 現在処理中のジョブIDを取得
     * @returns {string|null}
     */
    static getCurrentJobId() {
      return this.currentJobId;
    }

    /**
     * プロセッサーが実行中かどうか
     * @returns {boolean}
     */
    static isProcessing() {
      return this.isRunning;
    }
  }

  // エクスポート（Node.js/テスト用）
  if (typeof module !== 'undefined' && module.exports) {
    module.exports = JobProcessor;
  }

  // Service Worker/ブラウザ環境用（グローバルに公開）
  if (typeof self !== 'undefined') {
    self.JobProcessor = JobProcessor;
  }
})();
