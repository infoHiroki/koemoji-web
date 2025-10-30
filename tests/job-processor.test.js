// job-processor.test.js - JobProcessorクラスのテスト

const JobProcessor = require('../lib/job-processor');
const JobQueue = require('../lib/job-queue');
const OpenAIClient = require('../lib/openai-client');
const Storage = require('../lib/storage');

// OpenAIClientとStorageをモック
jest.mock('../lib/openai-client');
jest.mock('../lib/storage');

describe('JobProcessor', () => {
  // 各テストの前にキューをクリア、モックをリセット
  beforeEach(async () => {
    await JobQueue.clearQueue();
    jest.clearAllMocks();
    JobProcessor.isRunning = false;
    JobProcessor.currentJobId = null;

    // テスト用に依存関係を注入
    JobProcessor._dependencies = {
      JobQueue,
      OpenAIClient,
      Storage
    };
  });

  // 各テスト後にクリーンアップ
  afterEach(() => {
    // 依存関係の注入をクリア
    JobProcessor._dependencies = null;
  });

  // テスト後もクリーンアップ
  afterAll(async () => {
    await JobQueue.clearQueue();
  });

  describe('limitedParallel', () => {
    test('並列数が制限される（最大3並列）', async () => {
      let maxConcurrent = 0;
      let currentConcurrent = 0;

      const createTask = (delay) => async () => {
        currentConcurrent++;
        maxConcurrent = Math.max(maxConcurrent, currentConcurrent);
        await new Promise(resolve => setTimeout(resolve, delay));
        currentConcurrent--;
        return delay;
      };

      const tasks = [
        createTask(50),
        createTask(50),
        createTask(50),
        createTask(50),
        createTask(50)
      ];

      await JobProcessor.limitedParallel(tasks, 3);

      expect(maxConcurrent).toBeLessThanOrEqual(3);
      expect(maxConcurrent).toBeGreaterThan(0);
    });

    test('すべてのタスクが実行される', async () => {
      const results = [];

      const createTask = (value) => async () => {
        results.push(value);
        return value;
      };

      const tasks = [createTask(1), createTask(2), createTask(3), createTask(4), createTask(5)];

      await JobProcessor.limitedParallel(tasks, 3);

      expect(results).toHaveLength(5);
      expect(results).toEqual([1, 2, 3, 4, 5]);
    });

    test('タスクが失敗した場合もPromiseが返される', async () => {
      const createTask = (shouldFail) => async () => {
        if (shouldFail) {
          throw new Error('Task failed');
        }
        return 'success';
      };

      const tasks = [createTask(false), createTask(true), createTask(false)];

      await expect(JobProcessor.limitedParallel(tasks, 3)).rejects.toThrow('Task failed');
    });
  });

  describe('base64ToBlob', () => {
    test('Base64文字列をBlobに変換できる', async () => {
      const base64 = 'data:audio/wav;base64,AAAA';

      // fetchをモック
      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      const blob = await JobProcessor.base64ToBlob(base64);

      expect(blob).toBeInstanceOf(Blob);
      expect(blob.type).toBe('audio/wav');
      expect(global.fetch).toHaveBeenCalledWith(base64);
    });
  });

  describe('transcribeChunks', () => {
    test('複数チャンクを文字起こしして結合できる', async () => {
      const chunks = [
        { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 },
        { index: 1, audioBlob: 'data:audio/wav;base64,BBBB', startTime: 180000, duration: 180000 }
      ];

      const job = {
        id: 'test-job',
        transcriptId: 'test-transcript',
        chunks: chunks
      };

      const settings = {
        apiKey: 'sk-test',
        language: 'ja'
      };

      // OpenAIClient.transcribeをモック
      OpenAIClient.prototype.transcribe = jest.fn()
        .mockResolvedValueOnce({ text: 'First chunk text' })
        .mockResolvedValueOnce({ text: 'Second chunk text' });

      // fetchをモック（base64ToBlob用）
      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      const result = await JobProcessor.transcribeChunks(chunks, job, settings);

      expect(result).toBe('First chunk text\n\nSecond chunk text');
      expect(OpenAIClient.prototype.transcribe).toHaveBeenCalledTimes(2);
    });

    test('チャンクの順序が保証される', async () => {
      const chunks = [
        { index: 1, audioBlob: 'data:audio/wav;base64,BBBB', startTime: 180000, duration: 180000 },
        { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
      ];

      const job = {
        id: 'test-job',
        transcriptId: 'test-transcript',
        chunks: chunks
      };

      const settings = {
        apiKey: 'sk-test',
        language: 'ja'
      };

      // OpenAIClient.transcribeをモック（順序が逆でも正しく並び替えられる）
      OpenAIClient.prototype.transcribe = jest.fn()
        .mockResolvedValueOnce({ text: 'Second chunk text' })
        .mockResolvedValueOnce({ text: 'First chunk text' });

      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      const result = await JobProcessor.transcribeChunks(chunks, job, settings);

      // index順にソートされるため、First → Second の順番
      expect(result).toBe('First chunk text\n\nSecond chunk text');
    });
  });

  describe('generateSummary', () => {
    test('要約を生成して保存できる', async () => {
      const transcriptId = 'test-transcript';
      const transcriptText = 'This is a test transcript';
      const settings = {
        apiKey: 'sk-test'
      };

      // OpenAIClient.summarizeをモック
      OpenAIClient.prototype.summarize = jest.fn().mockResolvedValue({
        summary: 'Test summary'
      });

      // Storage.updateTranscriptをモック
      Storage.updateTranscript = jest.fn().mockResolvedValue();

      await JobProcessor.generateSummary(transcriptId, transcriptText, settings);

      expect(OpenAIClient.prototype.summarize).toHaveBeenCalledWith(transcriptText, {});
      expect(Storage.updateTranscript).toHaveBeenCalledWith(transcriptId, {
        summary: 'Test summary'
      });
    });

    test('カスタムプロンプトとモデルを使用できる', async () => {
      const transcriptId = 'test-transcript';
      const transcriptText = 'This is a test transcript';
      const settings = {
        apiKey: 'sk-test',
        summaryPrompt: 'Custom prompt',
        summaryModel: 'gpt-4'
      };

      OpenAIClient.prototype.summarize = jest.fn().mockResolvedValue({
        summary: 'Test summary'
      });

      Storage.updateTranscript = jest.fn().mockResolvedValue();

      await JobProcessor.generateSummary(transcriptId, transcriptText, settings);

      expect(OpenAIClient.prototype.summarize).toHaveBeenCalledWith(transcriptText, {
        customPrompt: 'Custom prompt',
        model: 'gpt-4'
      });
    });

    test('要約生成に失敗してもエラーをthrowしない', async () => {
      const transcriptId = 'test-transcript';
      const transcriptText = 'This is a test transcript';
      const settings = {
        apiKey: 'sk-test'
      };

      // OpenAIClient.summarizeがエラーを投げる
      OpenAIClient.prototype.summarize = jest.fn().mockRejectedValue(new Error('API error'));

      // エラーが投げられないことを確認
      await expect(
        JobProcessor.generateSummary(transcriptId, transcriptText, settings)
      ).resolves.not.toThrow();
    });
  });

  describe('processJob', () => {
    test('ジョブを正常に処理できる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: true
      };

      // ジョブをキューに追加
      const jobId = await JobQueue.addJob({
        transcriptId: 'test-transcript',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
        ],
        metadata: {
          title: 'Test',
          duration: 180
        }
      });

      // ジョブを取得
      const job = await JobQueue.getJob(jobId);

      // モックを設定
      OpenAIClient.prototype.transcribe = jest.fn().mockResolvedValue({
        text: 'Test transcript'
      });

      OpenAIClient.prototype.summarize = jest.fn().mockResolvedValue({
        summary: 'Test summary'
      });

      Storage.updateTranscript = jest.fn().mockResolvedValue();

      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // ジョブを処理
      await JobProcessor.processJob(job, settings);

      // ジョブステータスがCOMPLETEDに更新されたか確認
      const processedJob = await JobQueue.getJob(jobId);
      expect(processedJob.status).toBe(JobQueue.STATUS.COMPLETED);

      // Storageが正しく更新されたか確認
      expect(Storage.updateTranscript).toHaveBeenCalledWith('test-transcript', {
        status: 'processing'
      });
      expect(Storage.updateTranscript).toHaveBeenCalledWith('test-transcript', {
        transcript: 'Test transcript',
        status: 'transcribed'
      });
      expect(Storage.updateTranscript).toHaveBeenCalledWith('test-transcript', {
        summary: 'Test summary'
      });
      expect(Storage.updateTranscript).toHaveBeenCalledWith('test-transcript', {
        status: 'completed'
      });
    });

    test('ジョブ処理に失敗した場合、ステータスがFAILEDになる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: false
      };

      // ジョブをキューに追加
      const jobId = await JobQueue.addJob({
        transcriptId: 'test-transcript',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
        ],
        metadata: {
          title: 'Test',
          duration: 180
        }
      });

      // ジョブを取得
      const job = await JobQueue.getJob(jobId);

      // transcribeでエラーを発生させる
      OpenAIClient.prototype.transcribe = jest.fn().mockRejectedValue(new Error('API error'));

      Storage.updateTranscript = jest.fn().mockResolvedValue();

      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // ジョブ処理がエラーになることを確認
      await expect(JobProcessor.processJob(job, settings)).rejects.toThrow('API error');

      // ジョブステータスがFAILEDに更新されたか確認
      const failedJob = await JobQueue.getJob(jobId);
      expect(failedJob.status).toBe(JobQueue.STATUS.FAILED);
      expect(failedJob.error).toBe('API error');

      // エラーメッセージが保存されたか確認
      expect(Storage.updateTranscript).toHaveBeenCalledWith('test-transcript', {
        transcript: 'エラー: API error',
        status: 'failed'
      });
    });
  });

  describe('processQueue', () => {
    test('キューの全ジョブを逐次処理できる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: false
      };

      // 3つのジョブを追加
      await JobQueue.addJob({
        transcriptId: 'job-1',
        chunks: [{ index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }],
        metadata: { title: 'Job 1' }
      });

      await JobQueue.addJob({
        transcriptId: 'job-2',
        chunks: [{ index: 0, audioBlob: 'data:audio/wav;base64,BBBB', startTime: 0, duration: 180000 }],
        metadata: { title: 'Job 2' }
      });

      await JobQueue.addJob({
        transcriptId: 'job-3',
        chunks: [{ index: 0, audioBlob: 'data:audio/wav;base64,CCCC', startTime: 0, duration: 180000 }],
        metadata: { title: 'Job 3' }
      });

      // モックを設定
      OpenAIClient.prototype.transcribe = jest.fn().mockResolvedValue({
        text: 'Test transcript'
      });

      Storage.updateTranscript = jest.fn().mockResolvedValue();

      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // キューを処理
      await JobProcessor.processQueue(settings);

      // すべてのジョブがCOMPLETEDになっているか確認
      const job1 = await JobQueue.getJob('job-1');
      const job2 = await JobQueue.getJob('job-2');
      const job3 = await JobQueue.getJob('job-3');

      expect(job1.status).toBe(JobQueue.STATUS.COMPLETED);
      expect(job2.status).toBe(JobQueue.STATUS.COMPLETED);
      expect(job3.status).toBe(JobQueue.STATUS.COMPLETED);

      // transcribeが3回呼ばれたか確認
      expect(OpenAIClient.prototype.transcribe).toHaveBeenCalledTimes(3);
    });

    test('1つのジョブが失敗しても、次のジョブを処理する', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: false
      };

      // 2つのジョブを追加
      await JobQueue.addJob({
        transcriptId: 'job-1',
        chunks: [{ index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }],
        metadata: { title: 'Job 1' }
      });

      await JobQueue.addJob({
        transcriptId: 'job-2',
        chunks: [{ index: 0, audioBlob: 'data:audio/wav;base64,BBBB', startTime: 0, duration: 180000 }],
        metadata: { title: 'Job 2' }
      });

      // 1回目は失敗、2回目は成功
      OpenAIClient.prototype.transcribe = jest.fn()
        .mockRejectedValueOnce(new Error('API error'))
        .mockResolvedValueOnce({ text: 'Test transcript' });

      Storage.updateTranscript = jest.fn().mockResolvedValue();

      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // キューを処理
      await JobProcessor.processQueue(settings);

      // job-1はFAILED、job-2はCOMPLETED
      const job1 = await JobQueue.getJob('job-1');
      const job2 = await JobQueue.getJob('job-2');

      expect(job1.status).toBe(JobQueue.STATUS.FAILED);
      expect(job2.status).toBe(JobQueue.STATUS.COMPLETED);
    });
  });

  describe('完了通知フラグ（lastCompletedTranscriptId）', () => {
    beforeEach(() => {
      // chrome.storage.local.setのモックを初期化
      global.chrome.storage.local.set = jest.fn().mockResolvedValue();
    });

    test('文字起こし完了時にlastCompletedTranscriptIdが書き込まれる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: false
      };

      const jobId = await JobQueue.addJob({
        transcriptId: 'test-transcript-001',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
        ],
        metadata: {
          title: 'Test',
          duration: 180
        }
      });

      const job = await JobQueue.getJob(jobId);

      // モックの設定
      OpenAIClient.prototype.transcribe = jest.fn().mockResolvedValue({ text: 'テスト文字起こし' });
      Storage.updateTranscript = jest.fn().mockResolvedValue();
      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // ジョブ処理を実行
      await JobProcessor.processJob(job, settings);

      // lastCompletedTranscriptIdが書き込まれたか確認
      expect(global.chrome.storage.local.set).toHaveBeenCalledWith(
        expect.objectContaining({
          lastCompletedTranscriptId: 'test-transcript-001',
          lastCompletedTimestamp: expect.any(Number)
        })
      );
    });

    test('要約完了時にlastCompletedTranscriptIdが書き込まれる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: true,
        summaryModel: 'gpt-4',
        summaryPrompt: 'カスタムプロンプト'
      };

      const jobId = await JobQueue.addJob({
        transcriptId: 'test-transcript-002',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
        ],
        metadata: {
          title: 'Test',
          duration: 180
        }
      });

      const job = await JobQueue.getJob(jobId);

      // モックの設定
      OpenAIClient.prototype.transcribe = jest.fn().mockResolvedValue({ text: 'テスト文字起こし' });
      OpenAIClient.prototype.summarize = jest.fn().mockResolvedValue({ summary: 'テスト要約' });
      Storage.updateTranscript = jest.fn().mockResolvedValue();
      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // ジョブ処理を実行
      await JobProcessor.processJob(job, settings);

      // lastCompletedTranscriptIdが要約完了時にも書き込まれたか確認
      const calls = global.chrome.storage.local.set.mock.calls;
      const hasSummaryFlag = calls.some(call =>
        call[0].lastCompletedTranscriptId === 'test-transcript-002'
      );
      expect(hasSummaryFlag).toBe(true);
    });

    test('ジョブ完了時にlastCompletedTranscriptIdが最終的に書き込まれる', async () => {
      const settings = {
        apiKey: 'sk-test',
        language: 'ja',
        autoSummarize: false
      };

      const jobId = await JobQueue.addJob({
        transcriptId: 'test-transcript-003',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000 }
        ],
        metadata: {
          title: 'Test',
          duration: 180
        }
      });

      const job = await JobQueue.getJob(jobId);

      // モックの設定
      OpenAIClient.prototype.transcribe = jest.fn().mockResolvedValue({ text: 'テスト文字起こし' });
      Storage.updateTranscript = jest.fn().mockResolvedValue();
      global.fetch = jest.fn(() =>
        Promise.resolve({
          blob: () => Promise.resolve(new Blob(['test'], { type: 'audio/wav' }))
        })
      );

      // ジョブ処理を実行
      await JobProcessor.processJob(job, settings);

      // lastCompletedTranscriptIdが少なくとも2回書き込まれたか確認
      // （文字起こし完了時 + ジョブ完了時）
      const setCallsWithFlag = global.chrome.storage.local.set.mock.calls.filter(call =>
        call[0].lastCompletedTranscriptId === 'test-transcript-003'
      );
      expect(setCallsWithFlag.length).toBeGreaterThanOrEqual(2);
    });
  });
});
