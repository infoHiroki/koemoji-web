// Jest setup file - Chrome API mocks and global setup

// Mock Chrome storage - in-memory storage for tests
const chromeStorageData = {
  sync: {},
  local: {}
};

// Mock Chrome APIs
global.chrome = {
  runtime: {
    sendMessage: jest.fn(() => Promise.resolve()),
    onMessage: {
      addListener: jest.fn()
    },
    getContexts: jest.fn(),
    openOptionsPage: jest.fn()
  },
  storage: {
    sync: {
      get: jest.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: chromeStorageData.sync[keys] });
        } else if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = chromeStorageData.sync[key];
          });
          return Promise.resolve(result);
        } else if (keys === null || keys === undefined) {
          return Promise.resolve({ ...chromeStorageData.sync });
        }
        return Promise.resolve({});
      }),
      set: jest.fn((items) => {
        Object.assign(chromeStorageData.sync, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        if (typeof keys === 'string') {
          delete chromeStorageData.sync[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(key => delete chromeStorageData.sync[key]);
        }
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        chromeStorageData.sync = {};
        return Promise.resolve();
      })
    },
    local: {
      get: jest.fn((keys) => {
        if (typeof keys === 'string') {
          return Promise.resolve({ [keys]: chromeStorageData.local[keys] });
        } else if (Array.isArray(keys)) {
          const result = {};
          keys.forEach(key => {
            result[key] = chromeStorageData.local[key];
          });
          return Promise.resolve(result);
        } else if (keys === null || keys === undefined) {
          return Promise.resolve({ ...chromeStorageData.local });
        }
        return Promise.resolve({});
      }),
      set: jest.fn((items) => {
        Object.assign(chromeStorageData.local, items);
        return Promise.resolve();
      }),
      remove: jest.fn((keys) => {
        if (typeof keys === 'string') {
          delete chromeStorageData.local[keys];
        } else if (Array.isArray(keys)) {
          keys.forEach(key => delete chromeStorageData.local[key]);
        }
        return Promise.resolve();
      }),
      clear: jest.fn(() => {
        chromeStorageData.local = {};
        return Promise.resolve();
      })
    }
  },
  offscreen: {
    createDocument: jest.fn(),
    closeDocument: jest.fn()
  },
  tabs: {
    query: jest.fn()
  }
};

// Export storage data for test cleanup
global.chromeStorageData = chromeStorageData;

// Mock Web APIs
global.fetch = jest.fn();
global.FormData = class FormData {
  constructor() {
    this.data = new Map();
  }
  append(key, value) {
    this.data.set(key, value);
  }
  get(key) {
    return this.data.get(key);
  }
};

global.FileReader = class FileReader {
  readAsDataURL(blob) {
    // Simulate async read
    setTimeout(() => {
      this.result = 'data:audio/wav;base64,mockdata';
      this.onloadend && this.onloadend();
    }, 0);
  }
};

global.Blob = class Blob {
  constructor(parts, options) {
    this.parts = parts;
    this.size = parts.reduce((sum, part) => {
      if (part instanceof ArrayBuffer) {
        return sum + part.byteLength;
      }
      return sum + (part.length || 0);
    }, 0);
    this.type = options?.type || '';
  }
  slice(start, end) {
    return new Blob(['sliced'], { type: this.type });
  }
  async arrayBuffer() {
    // Mock implementation
    const buffer = new ArrayBuffer(this.size);
    return buffer;
  }
};

// Mock AudioContext
global.AudioContext = class AudioContext {
  constructor() {
    this.sampleRate = 44100;
  }
  decodeAudioData(arrayBuffer) {
    return Promise.resolve({
      length: 44100,
      duration: 1,
      sampleRate: 44100,
      numberOfChannels: 1,
      getChannelData: () => new Float32Array(44100)
    });
  }
};

// Mock OfflineAudioContext
global.OfflineAudioContext = class OfflineAudioContext {
  constructor(channels, length, sampleRate) {
    this.length = length;
    this.sampleRate = sampleRate;
    this.destination = {};
    this.numberOfChannels = channels;
  }
  createBuffer(channels, length, sampleRate) {
    return {
      length: length,
      duration: length / sampleRate,
      sampleRate: sampleRate,
      numberOfChannels: channels,
      getChannelData: (channel) => new Float32Array(length)
    };
  }
  createBufferSource() {
    return {
      buffer: null,
      connect: jest.fn(),
      start: jest.fn()
    };
  }
  startRendering() {
    return Promise.resolve({
      length: this.length,
      duration: this.length / this.sampleRate,
      sampleRate: this.sampleRate,
      numberOfChannels: this.numberOfChannels,
      getChannelData: () => new Float32Array(this.length)
    });
  }
};
