module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src'],
  testMatch: ['**/__tests__/**/*.test.ts'],
  // Lets the smoke test `import ... from '@hookflow/node'` resolve to this
  // package's own source without a real install — mirrors what a consumer
  // gets from node_modules after `npm install @hookflow/node`.
  moduleNameMapper: {
    '^@hookflow/node$': '<rootDir>/src/index.ts',
  },
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/__tests__/**',
    '!src/index.ts',
  ],
  coverageThreshold: {
    global: {
      branches: 80,
      functions: 80,
      lines: 80,
      statements: 80,
    },
  },
};
