const { describe, test, expect, beforeEach } = require('@jest/globals');

// limitedParallel関数の実装（テスト用）
async function limitedParallel(tasks, limit = 3) {
  const results = [];
  const executing = [];

  for (const [index, task] of tasks.entries()) {
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

describe('limitedParallel()', () => {
  test('すべてのタスクが実行される', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.resolve(2),
      () => Promise.resolve(3),
      () => Promise.resolve(4),
      () => Promise.resolve(5)
    ];

    const results = await limitedParallel(tasks, 3);

    expect(results).toEqual([1, 2, 3, 4, 5]);
  });

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
      createTask(100),
      createTask(100),
      createTask(100),
      createTask(100),
      createTask(100)
    ];

    await limitedParallel(tasks, 3);

    expect(maxConcurrent).toBeLessThanOrEqual(3);
  });

  test('タスクが順番通りに結果を返す', async () => {
    const tasks = [
      () => new Promise(resolve => setTimeout(() => resolve('first'), 300)),
      () => new Promise(resolve => setTimeout(() => resolve('second'), 100)),
      () => new Promise(resolve => setTimeout(() => resolve('third'), 200))
    ];

    const results = await limitedParallel(tasks, 3);

    expect(results).toEqual(['first', 'second', 'third']);
  });

  test('タスクが失敗した場合はエラーをthrowする', async () => {
    const tasks = [
      () => Promise.resolve(1),
      () => Promise.reject(new Error('Task failed')),
      () => Promise.resolve(3)
    ];

    await expect(limitedParallel(tasks, 3)).rejects.toThrow('Task failed');
  });

  test('limit=1の場合は順次実行される', async () => {
    const executionOrder = [];

    const tasks = [
      async () => {
        executionOrder.push('task1-start');
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push('task1-end');
        return 1;
      },
      async () => {
        executionOrder.push('task2-start');
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push('task2-end');
        return 2;
      },
      async () => {
        executionOrder.push('task3-start');
        await new Promise(resolve => setTimeout(resolve, 50));
        executionOrder.push('task3-end');
        return 3;
      }
    ];

    await limitedParallel(tasks, 1);

    // limit=1なので、task1が完了してからtask2が開始される
    expect(executionOrder).toEqual([
      'task1-start',
      'task1-end',
      'task2-start',
      'task2-end',
      'task3-start',
      'task3-end'
    ]);
  });

  test('空の配列の場合は空の配列を返す', async () => {
    const results = await limitedParallel([], 3);
    expect(results).toEqual([]);
  });

  test('limit以下のタスクの場合はすべて並列実行される', async () => {
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
      createTask(100),
      createTask(100)
    ];

    await limitedParallel(tasks, 5);

    expect(maxConcurrent).toBe(2); // 2つとも同時実行される
  });
});
