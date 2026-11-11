import pino from 'pino';
import { config } from '../config';

export const logger = pino({
  // Silent under test so suite output is just the results.
  level: config.nodeEnv === 'test' ? 'silent' : config.isDev ? 'debug' : 'info',
  base: { service: 'glimms-api' },
  transport: config.isDev
    ? { target: 'pino-pretty', options: { colorize: true, translateTime: 'HH:MM:ss' } }
    : undefined,
  redact: {
    paths: ['req.headers.authorization', 'req.headers.cookie', '*.password', '*.passwordHash'],
    censor: '[REDACTED]',
  },
});
