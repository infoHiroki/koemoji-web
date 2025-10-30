// audio-encoder.js - 音声エンコード機能

class AudioEncoder {
  /**
   * WebM/Opusをブラウザネイティブで処理
   * Chrome拡張ではFFmpegなどの外部ライブラリは使用できないため、
   * ブラウザがサポートする形式をそのまま使用
   */

  /**
   * 音声Blobを指定形式に変換
   * @param {Blob} audioBlob - 元の音声データ
   * @param {Object} options - エンコードオプション
   * @returns {Promise<Blob>}
   */
  static async encode(audioBlob, options = {}) {
    try {
      const {
        format = 'webm',  // webm, mp3, wav
        quality = 'medium' // low, medium, high
      } = options;

      console.log('Encoding audio:', {
        originalSize: audioBlob.size,
        format,
        quality
      });

      // WebMの場合はそのまま返す（ブラウザネイティブ形式）
      if (format === 'webm' || audioBlob.type.includes('webm')) {
        console.log('Using native WebM format');
        return audioBlob;
      }

      // WAV変換（ブラウザAPIを使用）
      if (format === 'wav') {
        return await this.convertToWAV(audioBlob);
      }

      // その他の形式は未サポート
      console.warn(`Format ${format} not supported, returning original`);
      return audioBlob;
    } catch (error) {
      console.error('Failed to encode audio:', error);
      throw error;
    }
  }

  /**
   * AudioBufferをWAV形式に変換
   * @param {Blob} audioBlob
   * @returns {Promise<Blob>}
   */
  static async convertToWAV(audioBlob) {
    try {
      // AudioContextでデコード
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      // WAVエンコード
      const wavBlob = this.encodeWAV(audioBuffer);

      console.log('Converted to WAV:', {
        channels: audioBuffer.numberOfChannels,
        sampleRate: audioBuffer.sampleRate,
        duration: audioBuffer.duration,
        size: wavBlob.size
      });

      return wavBlob;
    } catch (error) {
      console.error('Failed to convert to WAV:', error);
      throw error;
    }
  }

  /**
   * AudioBufferをWAV形式にエンコード
   * @param {AudioBuffer} audioBuffer
   * @returns {Blob}
   */
  static encodeWAV(audioBuffer) {
    const numberOfChannels = audioBuffer.numberOfChannels;
    const sampleRate = audioBuffer.sampleRate;
    const format = 1; // PCM
    const bitDepth = 16;

    // モノラルに変換（複数チャンネルの場合）
    let samples;
    if (numberOfChannels === 1) {
      samples = audioBuffer.getChannelData(0);
    } else {
      // ステレオをモノラルにミックス
      const left = audioBuffer.getChannelData(0);
      const right = audioBuffer.getChannelData(1);
      samples = new Float32Array(left.length);
      for (let i = 0; i < left.length; i++) {
        samples[i] = (left[i] + right[i]) / 2;
      }
    }

    const dataLength = samples.length * (bitDepth / 8);
    const buffer = new ArrayBuffer(44 + dataLength);
    const view = new DataView(buffer);

    // WAVヘッダーを書き込み
    const writeString = (offset, string) => {
      for (let i = 0; i < string.length; i++) {
        view.setUint8(offset + i, string.charCodeAt(i));
      }
    };

    // RIFFチャンク
    writeString(0, 'RIFF');
    view.setUint32(4, 36 + dataLength, true);
    writeString(8, 'WAVE');

    // fmtチャンク
    writeString(12, 'fmt ');
    view.setUint32(16, 16, true); // fmtチャンクのサイズ
    view.setUint16(20, format, true); // フォーマット（PCM）
    view.setUint16(22, 1, true); // チャンネル数（モノラル）
    view.setUint32(24, sampleRate, true); // サンプリングレート
    view.setUint32(28, sampleRate * (bitDepth / 8), true); // バイトレート
    view.setUint16(32, bitDepth / 8, true); // ブロックアライン
    view.setUint16(34, bitDepth, true); // ビット深度

    // dataチャンク
    writeString(36, 'data');
    view.setUint32(40, dataLength, true);

    // PCMデータを書き込み
    const volume = 0.8;
    let offset = 44;
    for (let i = 0; i < samples.length; i++) {
      const sample = Math.max(-1, Math.min(1, samples[i]));
      view.setInt16(offset, sample < 0 ? sample * 0x8000 : sample * 0x7FFF, true);
      offset += 2;
    }

    return new Blob([buffer], { type: 'audio/wav' });
  }

  /**
   * 音声を複数のチャンクに分割
   * @param {Blob} audioBlob
   * @param {number} chunkDurationSeconds - チャンクの長さ（秒）
   * @returns {Promise<Array<{index: number, blob: Blob, startTime: number, duration: number, size: number}>>}
   */
  static async splitAudio(audioBlob, chunkDurationSeconds = 600) {
    try {
      // AudioContextでデコード
      const audioContext = new (window.AudioContext || window.webkitAudioContext)();
      const arrayBuffer = await audioBlob.arrayBuffer();
      const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);

      const sampleRate = audioBuffer.sampleRate;
      const numberOfChannels = audioBuffer.numberOfChannels;
      const totalDuration = audioBuffer.duration;
      const chunkSamples = chunkDurationSeconds * sampleRate;

      console.log('Splitting audio:', {
        totalDuration,
        chunkDuration: chunkDurationSeconds,
        expectedChunks: Math.ceil(totalDuration / chunkDurationSeconds)
      });

      const chunks = [];
      let offset = 0;
      let chunkIndex = 0;

      while (offset < audioBuffer.length) {
        const remainingSamples = audioBuffer.length - offset;
        const currentChunkSamples = Math.min(chunkSamples, remainingSamples);

        // 新しいAudioBufferを作成
        const chunkBuffer = audioContext.createBuffer(
          numberOfChannels,
          currentChunkSamples,
          sampleRate
        );

        // データをコピー
        for (let channel = 0; channel < numberOfChannels; channel++) {
          const sourceData = audioBuffer.getChannelData(channel);
          const chunkData = chunkBuffer.getChannelData(channel);
          for (let i = 0; i < currentChunkSamples; i++) {
            chunkData[i] = sourceData[offset + i];
          }
        }

        // WAVに変換
        const chunkBlob = this.encodeWAV(chunkBuffer);

        // チャンクメタデータを作成
        const chunkDuration = currentChunkSamples / sampleRate;
        const chunkStartTime = (offset / sampleRate) * 1000; // ミリ秒

        chunks.push({
          index: chunkIndex,
          blob: chunkBlob,
          startTime: chunkStartTime, // 録音開始からの相対時間（ミリ秒）
          duration: chunkDuration * 1000, // ミリ秒
          size: chunkBlob.size
        });

        offset += currentChunkSamples;
        chunkIndex++;
      }

      console.log(`Split into ${chunks.length} chunks`);
      return chunks;
    } catch (error) {
      console.error('Failed to split audio:', error);
      throw error;
    }
  }

  /**
   * ファイルサイズを見積もり
   * @param {number} durationSeconds - 録音時間（秒）
   * @param {number} bitrate - ビットレート（bps）
   * @returns {number} 推定ファイルサイズ（バイト）
   */
  static estimateFileSize(durationSeconds, bitrate = 128000) {
    return Math.ceil((durationSeconds * bitrate) / 8);
  }

  /**
   * ファイルサイズが制限内かチェック
   * @param {number} size - ファイルサイズ（バイト）
   * @param {number} limitMB - 制限（MB）
   * @returns {boolean}
   */
  static isWithinSizeLimit(size, limitMB = 25) {
    const limitBytes = limitMB * 1024 * 1024;
    return size <= limitBytes;
  }
}

// エクスポート（Node.js/テスト用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioEncoder;
}

// Service Worker/ブラウザ環境用（グローバルに公開）
if (typeof self !== 'undefined') {
  self.AudioEncoder = AudioEncoder;
}
