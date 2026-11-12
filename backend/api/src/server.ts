import http from 'http';

import { createApp } from './app';
import { config } from './config';
import { logger } from './lib/logger';
import { connectDb, disconnectDb, getDb } from './db';
import { runMigrations } from './db/migrate';
import { accountTokensRepository, refreshTokensRepository, stripeEventsRepository } from './repositories';
import { accountService } from './services/accountDeletion';
import { credoService } from './services/credo.service';
import { connectRedis, redis } from './lib/redis';
import { createWebSocketServer } from './websocket';
import { startDesignWorker, setIO } from './workers/design.worker';

const TOKEN_SWEEP_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Expired refresh tokens are useless but accumulate (Mongo's TTL index used to
 * remove them). Sweep at boot and hourly; failures only cost disk, so just log.
 */
const BILLING_SWEEP_INTERVAL_MS = 5 * 60 * 1000;

/** Ends finished Credo passes and settles payments whose notifications were missed. */
function startBillingSweep(): NodeJS.Timeout {
  const sweep = () => {
    credoService.expirePasses()
      .then((ended) => { if (ended > 0) logger.info({ ended }, 'Credo passes ended'); })
      .catch((err) => logger.warn({ err }, 'Credo pass expiry failed'));
    credoService.reconcilePending()
      .catch((err) => logger.warn({ err }, 'Credo reconcile failed'));
  };
  sweep();
  const timer = setInterval(sweep, BILLING_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

function startRefreshTokenSweep(): NodeJS.Timeout {
  const sweep = () => {
    refreshTokensRepository.deleteExpired()
      .then((removed) => { if (removed > 0) logger.info({ removed }, 'Expired refresh tokens removed'); })
      .catch((err) => logger.warn({ err }, 'Refresh token sweep failed'));
    accountTokensRepository.deleteExpired()
      .catch((err) => logger.warn({ err }, 'Account token sweep failed'));
    // Stripe retries a webhook for up to three days; keep ids well past that.
    stripeEventsRepository.deleteOlderThan(30)
      .catch((err) => logger.warn({ err }, 'Stripe event sweep failed'));
    // Finish erasing the files of deleted accounts whose first attempt failed.
    accountService.sweepErasures()
      .then((done) => { if (done > 0) logger.info({ done }, 'Pending account erasures completed'); })
      .catch((err) => logger.warn({ err }, 'Account erasure sweep failed'));
  };
  sweep();
  const timer = setInterval(sweep, TOKEN_SWEEP_INTERVAL_MS);
  timer.unref();
  return timer;
}

async function bootstrap() {
  // ── 1. Connect to Postgres (Supabase) ─────────────────────────────────────
  await connectDb();
  if (config.database.migrateOnStart) {
    const { applied } = await runMigrations(getDb(), { log: (message) => logger.info(`Migration ${message}`) });
    logger.info({ applied: applied.length }, 'Database migrations up to date');
  }
  const tokenSweep = startRefreshTokenSweep();
  const billingSweep = startBillingSweep();

  // ── 2. Connect to Redis ───────────────────────────────────────────────────
  await connectRedis();

  // ── 3. Build Express app ──────────────────────────────────────────────────
  const app = createApp();

  // ── 4. Wrap in HTTP server so Socket.IO can share the same port ───────────
  const httpServer = http.createServer(app);

  // ── 5. Attach Socket.IO ───────────────────────────────────────────────────
  const io = createWebSocketServer(httpServer);

  // ── 6. Give the BullMQ worker access to the io instance for WS pushes ─────
  setIO(io);

  // ── 7. Start the design pipeline worker ──────────────────────────────────
  const worker = startDesignWorker();

  // ── 8. Start listening ────────────────────────────────────────────────────
  httpServer.listen(config.port, () => {
    logger.info(
      [
        '',
        '╔══════════════════════════════════════════════╗',
        `║            GLIMMS API — running              ║`,
        `║  Port     : ${String(config.port).padEnd(30)}║`,
        `║  Env      : ${config.nodeEnv.padEnd(30)}║`,
        `║  DB       : Postgres (Supabase)              ║`,
        `║  Queue    : BullMQ / Redis                   ║`,
        `║  Realtime : Socket.IO                        ║`,
        '╚══════════════════════════════════════════════╝',
      ].join('\n'),
    );
  });

  // ── 9. Graceful shutdown ──────────────────────────────────────────────────
  async function shutdown(signal: string) {
    logger.info(`${signal} received — shutting down gracefully`);

    // Stop accepting new connections
    httpServer.close(async () => {
      try {
        clearInterval(tokenSweep);
        clearInterval(billingSweep);
        await worker.close();     // drain in-flight jobs
        await disconnectDb();     // close the Postgres pool
        await redis.quit();       // close Redis connection
        logger.info('Server shut down cleanly ✅');
        process.exit(0);
      } catch (err) {
        logger.error({ err }, 'Error during shutdown');
        process.exit(1);
      }
    });

    // Force exit after 15 s if clean shutdown hangs
    setTimeout(() => {
      logger.error('Forced exit after 15 s timeout');
      process.exit(1);
    }, 15_000).unref();
  }

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT',  () => shutdown('SIGINT'));

  // Catch unhandled rejections so the process doesn't silently die
  process.on('unhandledRejection', (reason) => {
    logger.error({ reason }, 'Unhandled promise rejection');
  });
}

bootstrap().catch(err => {
  console.error('Fatal: failed to start server', err);
  process.exit(1);
});
