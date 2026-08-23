// Separate Jest project for contract tests: these hit a REAL API instance
// (see tests/contract/README.md) and must never run as part of the default
// `npm test` unit suite: jest.config.js roots at src/, this config roots at
// tests/contract instead, so the two never mix.
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/tests/contract'],
  testMatch: ['**/*.contract.test.ts'],
  transform: {
    '^.+\\.ts$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.contract.json' }],
  },
  // Contract tests boot real HTTP round trips against a live stack; give
  // them more room than the default 5s unit-test timeout.
  testTimeout: 30000,
};
