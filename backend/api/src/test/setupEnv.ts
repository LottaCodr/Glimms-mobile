// Runs before each test file is loaded: the config module validates the
// environment at import time, so the required variables must already exist.
process.env.NODE_ENV = 'test';
process.env.JWT_SECRET ??= 'test-jwt-secret-at-least-32-characters-long';
process.env.REFRESH_TOKEN_SECRET ??= 'test-refresh-secret-32-chars-minimum-here';
// Cheap hashing keeps the suite fast; production uses BCRYPT_ROUNDS (default 12).
process.env.BCRYPT_ROUNDS ??= '4';
// Never dialled: every suite that touches the database installs its own via
// setupTestDatabase(). Present because config requires it when a test switches
// NODE_ENV to production.
process.env.DATABASE_URL ??= 'postgresql://unused:unused@localhost:5432/unused';
