module.exports = {
  testEnvironment: 'jsdom',
  testMatch: ['**/__tests__/**/*.test.js'],
  collectCoverageFrom: [
    'lib/**/*.js',
    'background.js',
    'offscreen.js',
    '!lib/marked.min.js',
    '!**/__tests__/**'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 70,
      statements: 70
    }
  },
  setupFiles: ['<rootDir>/__tests__/setup.js']
};
