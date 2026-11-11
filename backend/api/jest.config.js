/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset:              'ts-jest',
  testEnvironment:     'node',
  roots:               ['<rootDir>/src'],
  testMatch:           ['**/*.test.ts', '**/*.spec.ts'],
  moduleNameMapper:    { '^@/(.*)$': '<rootDir>/src/$1' },
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/**/*.d.ts', '!src/test/**'],
  coverageDirectory:   'coverage',
  // Sets the env vars src/config validates on import.
  setupFiles:          ['<rootDir>/src/test/setupEnv.ts'],
  testTimeout:         15_000,
};
