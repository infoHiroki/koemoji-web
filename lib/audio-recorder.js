// audio-recorder.js - 音声録音機能

class AudioRecorder {
  constructor() {
    this.mediaStream = null;
    this.mediaRecorder = null;
    this.audioChunks = [];
    this.startTime = null;
    this.isRecordingFlag = false;
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

      // データが利用可能になったら保存
      this.mediaRecorder.addEventListener('dataavailable', (event) => {
        if (event.data.size > 0) {
          this.audioChunks.push(event.data);
          console.log('Audio chunk received:', event.data.size, 'bytes');
        }
      });

      // 録音開始
      this.mediaRecorder.start(1000);  // 1秒ごとにdataavailableイベント発火
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
   * @returns {Promise<Blob>} 録音された音声データ
   */
  async stop() {
    return new Promise((resolve, reject) => {
      try {
        if (!this.isRecordingFlag) {
          throw new Error('録音が開始されていません');
        }

        console.log('Stopping recording...');

        // 録音停止時の処理
        this.mediaRecorder.addEventListener('stop', () => {
          try {
            // 音声データをBlobにまとめる
            const mimeType = this.mediaRecorder.mimeType || 'audio/webm';
            const audioBlob = new Blob(this.audioChunks, { type: mimeType });

            console.log('Recording stopped. Audio blob size:', audioBlob.size, 'bytes');
            console.log('Recording duration:', this.getDuration(), 'seconds');

            // ストリームを停止
            if (this.mediaStream) {
              this.mediaStream.getTracks().forEach(track => track.stop());
              this.mediaStream = null;
            }

            // 状態をリセット
            this.isRecordingFlag = false;
            this.mediaRecorder = null;

            resolve(audioBlob);
          } catch (error) {
            reject(error);
          }
        });

        // MediaRecorderを停止
        this.mediaRecorder.stop();
      } catch (error) {
        console.error('Failed to stop recording:', error);
        reject(error);
      }
    });
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

    console.log('Recording cancelled');
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
