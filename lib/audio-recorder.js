// audio-recorder.js - 音声録音機能

class AudioRecorder {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = null;
    this.isRecordingFlag = false;
    this.chunkIndex = 0;  // チャンクの順序管理
    this.flushThreshold = 30000;  // 30秒ごとにフラッシュ
  }

  /**
   * 利用可能な音声入力デバイスを取得
   * @returns {Promise<MediaDeviceInfo[]>}
   */
  async getAudioDevices() {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioInputs = devices.filter(device => device.kind === 'audioinput');
      console.log('Available audio devices:', audioInputs);
      return audioInputs;
    } catch (error) {
      console.error('Failed to get audio devices:', error);
      throw new Error('音声デバイスの取得に失敗しました');
    }
  }

  /**
   * 録音を開始
   * @param {string} deviceId - 録音デバイスID
   * @returns {Promise<void>}
   */
  async start(deviceId) {
    try {
      if (this.isRecordingFlag) {
        throw new Error('すでに録音中です');
      }

      console.log('Starting recording with device:', deviceId);

      // getUserMediaで音声ストリームを取得
      const constraints = {
        audio: {
          deviceId: deviceId ? { exact: deviceId } : undefined,
          echoCancellation: false,  // エコーキャンセルOFF（会議音声をそのまま録音）
          noiseSuppression: false,  // ノイズ抑制OFF
          autoGainControl: false    // 自動ゲインOFF
        }
      };

      this.mediaStream = await navigator.mediaDevices.getUserMedia(constraints);

      // MediaRecorderを作成
      const options = {
        mimeType: 'audio/webm;codecs=opus',
        audioBitsPerSecond: 128000  // 128kbps
      };

      // ブラウザがサポートしているmimeTypeを確認
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        console.warn('audio/webm not supported, using default');
        delete options.mimeType;
      }

      this.mediaRecorder = new MediaRecorder(this.mediaStream, options);

      // データが利用可能になったら保存（30秒ごとに自動発火）
      this.mediaRecorder.addEventListener('dataavailable', async (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log('Audio chunk received:', event.data.size, 'bytes');

          // 30秒分のチャンクが溜まったら background に送信
          await this.flushToBackground();
        }
      });

      // 録音開始（30秒ごとにdataavailableイベント発火）
      this.mediaRecorder.start(this.flushThreshold);  // 30秒ごと
      this.startTime = Date.now();
      this.isRecordingFlag = true;
      this.audioChunks = [];

      console.log('Recording started');
    } catch (error) {
      console.error('Failed to start recording:', error);

      // エラーの種類に応じたメッセージ
      if (error.name === 'NotAllowedError') {
        throw new Error('マイクへのアクセス権限がありません。ブラウザの設定を確認してください。');
      } else if (error.name === 'NotFoundError') {
        throw new Error('指定された録音デバイスが見つかりません。');
      } else if (error.name === 'NotReadableError') {
        throw new Error('録音デバイスが使用中か、アクセスできません。');
      } else {
        throw error;
      }
    }
  }

  /**
   * 録音を停止
   * @returns {Promise<Object>} 録音統計情報
   */
  async stop() {
    try {
      if (!this.isRecordingFlag) {
        throw new Error('録音が開始されていません');
      }

      console.log('Stopping recording...');

      const duration = this.getDuration();

      // MediaRecorderを停止（最後のdataavailableイベントが発火）
      await new Promise((resolve) => {
        this.mediaRecorder.addEventListener('stop', async () => {
          // 最後のチャンクをflush
          await this.flushToBackground();
          resolve();
        });
        this.mediaRecorder.stop();
      });

      console.log('Recording stopped. Duration:', duration, 'seconds');
      console.log('Total chunks sent:', this.chunkIndex);

      // ストリームを停止
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach(track => track.stop());
        this.mediaStream = null;
      }

      // backgroundに完了通知
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'recordingComplete',
        data: {
          totalChunks: this.chunkIndex,
          duration: duration
        }
      });

      // 状態をリセット
      this.isRecordingFlag = false;
      this.mediaRecorder = null;
      this.audioChunks = [];
      this.chunkIndex = 0;

      return {
        success: true,
        totalChunks: this.chunkIndex,
        duration: duration
      };
    } catch (error) {
      console.error('Failed to stop recording:', error);
      throw error;
    }
  }

  /**
   * 録音中かどうか
   * @returns {boolean}
   */
  isRecording() {
    return this.isRecordingFlag;
  }

  /**
   * 録音時間（秒）を取得
   * @returns {number}
   */
  getDuration() {
    if (!this.startTime) {
      return 0;
    }
    return Math.floor((Date.now() - this.startTime) / 1000);
  }

  /**
   * 録音をキャンセル（データを破棄）
   */
  cancel() {
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach(track => track.stop());
      this.mediaStream = null;
    }

    if (this.mediaRecorder && this.isRecordingFlag) {
      this.mediaRecorder.stop();
    }

    this.audioChunks = [];
    this.isRecordingFlag = false;
    this.startTime = null;
    this.mediaRecorder = null;
    this.chunkIndex = 0;

    console.log('Recording cancelled');
  }

  /**
   * 蓄積されたチャンクを background に送信してメモリクリア
   * @returns {Promise<void>}
   */
  async flushToBackground() {
    if (this.audioChunks.length === 0) {
      return;
    }

    try {
      // チャンクをBlobにまとめる
      const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
      const blob = new Blob(this.audioChunks, { type: mimeType });

      console.log(`Flushing chunk ${this.chunkIndex} (${blob.size} bytes) to background`);

      // Base64に変換
      const base64 = await this.blobToBase64(blob);

      // background.js に送信
      chrome.runtime.sendMessage({
        target: 'background',
        action: 'saveRecordingChunk',
        chunkData: {
          audioBlob: base64,
          timestamp: Date.now(),
          size: blob.size,
          index: this.chunkIndex,
          mimeType: mimeType
        }
      });

      // メモリクリア
      this.audioChunks = [];
      this.chunkIndex++;

      console.log(`Chunk ${this.chunkIndex - 1} flushed successfully`);
    } catch (error) {
      console.error('Failed to flush chunk to background:', error);
      // エラーが発生してもクラッシュを避けるため、メモリはクリアする
      this.audioChunks = [];
    }
  }

  /**
   * BlobをBase64に変換
   * @param {Blob} blob
   * @returns {Promise<string>}
   */
  async blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }
}

// エクスポート（Chrome拡張用）
if (typeof module !== 'undefined' && module.exports) {
  module.exports = AudioRecorder;
}

// ブラウザ環境用（グローバルに公開）
if (typeof window !== 'undefined') {
  window.AudioRecorder = AudioRecorder;
}
