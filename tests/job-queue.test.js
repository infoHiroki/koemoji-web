// job-queue.test.js - JobQueueクラスのテスト

const JobQueue = require('../lib/job-queue');

describe('JobQueue', () => {
  // 各テストの前にキューをクリア
  beforeEach(async () => {
    await JobQueue.clearQueue();
  });

  // テスト後もクリーンアップ
  afterAll(async () => {
    await JobQueue.clearQueue();
  });

  describe('addJob', () => {
    test('ジョブをキューに追加できる', async () => {
      const jobData = {
        transcriptId: 'test-id-1',
        chunks: [
          { index: 0, audioBlob: 'data:audio/wav;base64,AAAA', startTime: 0, duration: 180000, size: 1000 }
        ],
        metadata: {
          title: 'Test Recording',
          duration: 180,
          platform: 'test'
        }
      };

      const jobId = await JobQueue.addJob(jobData);
      expect(jobId).toBe('test-id-1');

      const job = await JobQueue.getJob(jobId);
      expect(job).not.toBeNull();
      expect(job.id).toBe('test-id-1');
      expect(job.status).toBe(JobQueue.STATUS.QUEUED);
      expect(job.transcriptId).toBe('test-id-1');
      expect(job.chunks).toHaveLength(1);
      expect(job.createdAt).toBeGreaterThan(0);
    });

    test('同じIDのジョブを追加するとエラーが発生する', async () => {
      const jobData = {
        transcriptId: 'duplicate-id',
        chunks: [],
        metadata: {}
      };

      await JobQueue.addJob(jobData);

      await expect(JobQueue.addJob(jobData)).rejects.toThrow('Job with ID duplicate-id already exists');
    });

    test('不正なデータでジョブ追加するとエラーが発生する', async () => {
      await expect(JobQueue.addJob({})).rejects.toThrow('Invalid job data');
      await expect(JobQueue.addJob({ transcriptId: 'test' })).rejects.toThrow('Invalid job data');
      await expect(JobQueue.addJob({ transcriptId: 'test', chunks: [] })).rejects.toThrow('Invalid job data');
    });
  });

  describe('getNextJob', () => {
    test('QUEUEDステータスのジョブを古い順に取得できる', async () => {
      // 3つのジョブを追加
      await JobQueue.addJob({
        transcriptId: 'job-1',
        chunks: [],
        metadata: { title: 'Job 1' }
      });

      // わずかに遅延して追加（createdAtが異なるように）
      await new Promise(resolve => setTimeout(resolve, 10));

      await JobQueue.addJob({
        transcriptId: 'job-2',
        chunks: [],
        metadata: { title: 'Job 2' }
      });

      await new Promise(resolve => setTimeout(resolve, 10));

      await JobQueue.addJob({
        transcriptId: 'job-3',
        chunks: [],
        metadata: { title: 'Job 3' }
      });

      // 最初のジョブ（最も古い）を取得
      const nextJob = await JobQueue.getNextJob();
      expect(nextJob).not.toBeNull();
      expect(nextJob.id).toBe('job-1');
    });

    test('QUEUEDジョブがない場合はnullを返す', async () => {
      const nextJob = await JobQueue.getNextJob();
      expect(nextJob).toBeNull();
    });

    test('PROCESSINGステータスのジョブはスキップされる', async () => {
      await JobQueue.addJob({
        transcriptId: 'job-processing',
        chunks: [],
        metadata: {}
      });

      await JobQueue.addJob({
        transcriptId: 'job-queued',
        chunks: [],
        metadata: {}
      });

      // 最初のジョブをPROCESSINGに変更
      await JobQueue.updateJobStatus('job-processing', JobQueue.STATUS.PROCESSING);

      // 次のジョブはQUEUEDの方が取得される
      const nextJob = await JobQueue.getNextJob();
      expect(nextJob.id).toBe('job-queued');
    });
  });

  describe('updateJobStatus', () => {
    test('ジョブステータスを更新できる', async () => {
      await JobQueue.addJob({
        transcriptId: 'test-job',
        chunks: [],
        metadata: {}
      });

      await JobQueue.updateJobStatus('test-job', JobQueue.STATUS.PROCESSING);

      const job = await JobQueue.getJob('test-job');
      expect(job.status).toBe(JobQueue.STATUS.PROCESSING);
      expect(job.startedAt).toBeGreaterThan(0);
    });

    test('COMPLETEDステータスに更新すると completedAt が設定される', async () => {
      await JobQueue.addJob({
        transcriptId: 'test-job',
        chunks: [],
        metadata: {}
      });

      await JobQueue.updateJobStatus('test-job', JobQueue.STATUS.COMPLETED);

      const job = await JobQueue.getJob('test-job');
      expect(job.status).toBe(JobQueue.STATUS.COMPLETED);
      expect(job.completedAt).toBeGreaterThan(0);
    });

    test('FAILEDステータスに更新するとエラーメッセージを保存できる', async () => {
      await JobQueue.addJob({
        transcriptId: 'test-job',
        chunks: [],
        metadata: {}
      });

      await JobQueue.updateJobStatus('test-job', JobQueue.STATUS.FAILED, {
        error: 'Test error message'
      });

      const job = await JobQueue.getJob('test-job');
      expect(job.status).toBe(JobQueue.STATUS.FAILED);
      expect(job.error).toBe('Test error message');
      expect(job.completedAt).toBeGreaterThan(0);
    });

    test('存在しないジョブIDでエラーが発生する', async () => {
      await expect(
        JobQueue.updateJobStatus('non-existent', JobQueue.STATUS.PROCESSING)
      ).rejects.toThrow('Job not found: non-existent');
    });

    test('不正なステータスでエラーが発生する', async () => {
      await JobQueue.addJob({
        transcriptId: 'test-job',
        chunks: [],
        metadata: {}
      });

      await expect(
        JobQueue.updateJobStatus('test-job', 'invalid-status')
      ).rejects.toThrow('Invalid status: invalid-status');
    });
  });

  describe('getJob', () => {
    test('特定のジョブを取得できる', async () => {
      await JobQueue.addJob({
        transcriptId: 'target-job',
        chunks: [],
        metadata: { title: 'Target' }
      });

      const job = await JobQueue.getJob('target-job');
      expect(job).not.toBeNull();
      expect(job.id).toBe('target-job');
      expect(job.metadata.title).toBe('Target');
    });

    test('存在しないジョブIDの場合はnullを返す', async () => {
      const job = await JobQueue.getJob('non-existent');
      expect(job).toBeNull();
    });
  });

  describe('getAllJobs', () => {
    test('すべてのジョブを取得できる', async () => {
      await JobQueue.addJob({
        transcriptId: 'job-1',
        chunks: [],
        metadata: {}
      });

      await JobQueue.addJob({
        transcriptId: 'job-2',
        chunks: [],
        metadata: {}
      });

      await JobQueue.addJob({
        transcriptId: 'job-3',
        chunks: [],
        metadata: {}
      });

      const allJobs = await JobQueue.getAllJobs();
      expect(allJobs).toHaveLength(3);
      expect(allJobs.map(j => j.id)).toEqual(['job-1', 'job-2', 'job-3']);
    });

    test('ジョブがない場合は空配列を返す', async () => {
      const allJobs = await JobQueue.getAllJobs();
      expect(allJobs).toEqual([]);
    });
  });

  describe('deleteJob', () => {
    test('ジョブを削除できる', async () => {
      await JobQueue.addJob({
        transcriptId: 'to-delete',
        chunks: [],
        metadata: {}
      });

      await JobQueue.deleteJob('to-delete');

      const job = await JobQueue.getJob('to-delete');
      expect(job).toBeNull();
    });

    test('存在しないジョブを削除してもエラーにならない', async () => {
      await expect(JobQueue.deleteJob('non-existent')).resolves.not.toThrow();
    });
  });

  describe('getProcessingJobs', () => {
    test('処理中のジョブのみ取得できる', async () => {
      await JobQueue.addJob({ transcriptId: 'job-1', chunks: [], metadata: {} });
      await JobQueue.addJob({ transcriptId: 'job-2', chunks: [], metadata: {} });
      await JobQueue.addJob({ transcriptId: 'job-3', chunks: [], metadata: {} });

      await JobQueue.updateJobStatus('job-1', JobQueue.STATUS.PROCESSING);
      await JobQueue.updateJobStatus('job-2', JobQueue.STATUS.PROCESSING);
      await JobQueue.updateJobStatus('job-3', JobQueue.STATUS.COMPLETED);

      const processingJobs = await JobQueue.getProcessingJobs();
      expect(processingJobs).toHaveLength(2);
      expect(processingJobs.map(j => j.id)).toEqual(['job-1', 'job-2']);
    });

    test('処理中のジョブがない場合は空配列を返す', async () => {
      const processingJobs = await JobQueue.getProcessingJobs();
      expect(processingJobs).toEqual([]);
    });
  });

  describe('recoverProcessingJobs', () => {
    test('処理中のジョブをQUEUEDに戻せる', async () => {
      await JobQueue.addJob({ transcriptId: 'job-1', chunks: [], metadata: {} });
      await JobQueue.addJob({ transcriptId: 'job-2', chunks: [], metadata: {} });

      await JobQueue.updateJobStatus('job-1', JobQueue.STATUS.PROCESSING);
      await JobQueue.updateJobStatus('job-2', JobQueue.STATUS.PROCESSING);

      const recoveredCount = await JobQueue.recoverProcessingJobs();
      expect(recoveredCount).toBe(2);

      const job1 = await JobQueue.getJob('job-1');
      const job2 = await JobQueue.getJob('job-2');

      expect(job1.status).toBe(JobQueue.STATUS.QUEUED);
      expect(job1.startedAt).toBeNull();
      expect(job2.status).toBe(JobQueue.STATUS.QUEUED);
      expect(job2.startedAt).toBeNull();
    });

    test('復旧するジョブがない場合は0を返す', async () => {
      const recoveredCount = await JobQueue.recoverProcessingJobs();
      expect(recoveredCount).toBe(0);
    });
  });

  describe('cleanupCompletedJobs', () => {
    test('古い完了済みジョブを削除できる', async () => {
      // 古いジョブを追加（24時間以上前）
      await JobQueue.addJob({ transcriptId: 'old-job', chunks: [], metadata: {} });
      await JobQueue.updateJobStatus('old-job', JobQueue.STATUS.COMPLETED);

      // completedAtを24時間以上前に設定
      const queue = await JobQueue.getQueue();
      queue[0].completedAt = Date.now() - (25 * 60 * 60 * 1000); // 25時間前
      await JobQueue.saveQueue(queue);

      // 新しいジョブを追加（1時間前）
      await JobQueue.addJob({ transcriptId: 'new-job', chunks: [], metadata: {} });
      await JobQueue.updateJobStatus('new-job', JobQueue.STATUS.COMPLETED);

      // クリーンアップ実行
      const deletedCount = await JobQueue.cleanupCompletedJobs();
      expect(deletedCount).toBe(1);

      // 古いジョブが削除され、新しいジョブは残る
      const oldJob = await JobQueue.getJob('old-job');
      const newJob = await JobQueue.getJob('new-job');

      expect(oldJob).toBeNull();
      expect(newJob).not.toBeNull();
    });

    test('クリーンアップするジョブがない場合は0を返す', async () => {
      const deletedCount = await JobQueue.cleanupCompletedJobs();
      expect(deletedCount).toBe(0);
    });
  });
});
