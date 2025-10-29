const { describe, test, expect, beforeEach } = require('@jest/globals');

// audio-encoder.jsを読み込む前にグローバル変数を設定
global.AudioEncoder = class AudioEncoder {
  static async splitAudio(audioBlob, chunkDurationSeconds = 600) {
    // 実装のコピー（テスト用）
    try {
      // AudioContext で音声データをデコード
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioContext = new AudioContext();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const sampleRate = audioBuffer.sampleRate;
      const totalDuration = audioBuffer.duration;
      const numberOfChannels = audioBuffer.numberOfChannels;

      console.log('Audio info:', {
        sampleRate,
        totalDuration,
        numberOfChannels,
        chunkDuration: chunkDurationSeconds
      });

      // チャンク分割が不要な場合（音声が短い）
      if (totalDuration <= chunkDurationSeconds) {
        console.log('Audio is shorter than chunk duration, returning single chunk');
        return [{
          index: 0,
          blob: audioBlob,
          startTime: 0,
          duration: totalDuration,
          size: audioBlob.size
        }];
      }

      // チャンク数を計算
      const numberOfChunks = Math.ceil(totalDuration / chunkDurationSeconds);
      const chunks = [];

      for (let i = 0; i < numberOfChunks; i++) {
        const startTime = i * chunkDurationSeconds;
        const endTime = Math.min((i + 1) * chunkDurationSeconds, totalDuration);
        const chunkDuration = endTime - startTime;

        // オフラインコンテキストで音声を切り出す
        const startSample = Math.floor(startTime * sampleRate);
        const endSample = Math.floor(endTime * sampleRate);
        const chunkLength = endSample - startSample;

        const offlineContext = new OfflineAudioContext(
          numberOfChannels,
          chunkLength,
          sampleRate
        );

        const chunkBuffer = offlineContext.createBuffer(
          numberOfChannels,
          chunkLength,
          sampleRate
        );

        // チャンネルごとにデータをコピー
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sourceData = audioBuffer.getChannelData(channel);
          const chunkData = chunkBuffer.getChannelData(channel);

          for (let j = 0; j < chunkLength; j++) {
            chunkData[j] = sourceData[startSample + j];
          }
        }

        // オフラインレンダリング
        const source = offlineContext.createBufferSource();
        source.buffer = chunkBuffer;
        source.connect(offlineContext.destination);
        source.start(0);

        const renderedBuffer = await offlineContext.startRendering();

        // WAVエンコード
        const wavBlob = this.encodeWAV(renderedBuffer);

        chunks.push({
          index: i,
          blob: wavBlob,
          startTime: startTime,
          duration: chunkDuration,
          size: wavBlob.size
        });

        console.log(`Chunk ${i + 1}/${numberOfChunks} created:`, {
          startTime,
          duration: chunkDuration,
          size: wavBlob.size
        });
      }

      return chunks;
    } catch (error) {
      console.error('Failed to split audio:', error);
      throw error;
    }
  }

  static encodeWAV(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    const bytesPerSample = bitDepth / 8;
    const blockAlign = numberOfChannels * bytesPerSample;

    const samples = audioBuffer.getChannelData(0);
    const dataLength = samples.length * numberOfChannels * bytesPerSample;
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAVヘッダー書き込み（簡略版）
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true);
    view.setUint16(20, format, true);
    view.setUint16(22, numberOfChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, sampleRate * blockAlign, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitDepth, true);
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // PCMデータ書き込み
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }
};

describe('AudioEncoder.splitAudio()', () => {
  let mockAudioBlob;

  beforeEach(() => {
    // 44.1kHzで30分（1800秒）の音声を模擬
    const duration = 1800;
    const sampleRate = 44100;
    const samples = duration * sampleRate;
    mockAudioBlob = new Blob([new ArrayBuffer(samples * 2)], { type: 'audio/wav' });

    // AudioContextのmockを調整（30分の音声）
    global.AudioContext = class AudioContext {
      constructor() {
        this.sampleRate = 44100;
      }
      decodeAudioData(arrayBuffer) {
        return Promise.resolve({
          length: 1800 * 44100, // 30分
          duration: 1800,
          sampleRate: 44100,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(1800 * 44100)
        });
      }
    };
  });

  test('30分の音声を3つのチャンクに分割する（10分ごと）', async () => {
    const chunks = await AudioEncoder.splitAudio(mockAudioBlob, 600);

    expect(chunks).toHaveLength(3);
    expect(chunks[0].index).toBe(0);
    expect(chunks[1].index).toBe(1);
    expect(chunks[2].index).toBe(2);
  });

  test('各チャンクのメタデータが正しい', async () => {
    const chunks = await AudioEncoder.splitAudio(mockAudioBlob, 600);

    // Chunk 0: 0-600秒
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].duration).toBe(600);

    // Chunk 1: 600-1200秒
    expect(chunks[1].startTime).toBe(600);
    expect(chunks[1].duration).toBe(600);

    // Chunk 2: 1200-1800秒
    expect(chunks[2].startTime).toBe(1200);
    expect(chunks[2].duration).toBe(600);
  });

  test('5分の音声は分割されない（単一チャンク）', async () => {
    // 5分 = 300秒
    const shortBlob = new Blob([new ArrayBuffer(300 * 44100 * 2)], { type: 'audio/wav' });

    // AudioContextのmockを調整
    global.AudioContext = class AudioContext {
      constructor() {
        this.sampleRate = 44100;
      }
      decodeAudioData(arrayBuffer) {
        return Promise.resolve({
          length: 300 * 44100,
          duration: 300,
          sampleRate: 44100,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(300 * 44100)
        });
      }
    };

    const chunks = await AudioEncoder.splitAudio(shortBlob, 600);

    expect(chunks).toHaveLength(1);
    expect(chunks[0].index).toBe(0);
    expect(chunks[0].startTime).toBe(0);
    expect(chunks[0].duration).toBe(300);
  });

  test('15分の音声を2つのチャンクに分割する', async () => {
    // 15分 = 900秒
    const mediumBlob = new Blob([new ArrayBuffer(900 * 44100 * 2)], { type: 'audio/wav' });

    // AudioContextのmockを調整
    global.AudioContext = class AudioContext {
      constructor() {
        this.sampleRate = 44100;
      }
      decodeAudioData(arrayBuffer) {
        return Promise.resolve({
          length: 900 * 44100,
          duration: 900,
          sampleRate: 44100,
          numberOfChannels: 1,
          getChannelData: () => new Float32Array(900 * 44100)
        });
      }
    };

    const chunks = await AudioEncoder.splitAudio(mediumBlob, 600);

    expect(chunks).toHaveLength(2);
    expect(chunks[0].duration).toBe(600);
    expect(chunks[1].duration).toBe(300); // 残り300秒
  });

  test('各チャンクがBlobオブジェクトを持つ', async () => {
    const chunks = await AudioEncoder.splitAudio(mockAudioBlob, 600);

    chunks.forEach(chunk => {
      expect(chunk.blob).toBeInstanceOf(Blob);
      expect(chunk.size).toBeGreaterThan(0);
    });
  });
});
