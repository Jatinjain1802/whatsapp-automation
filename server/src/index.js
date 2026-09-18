import { createApp } from './app.js';
import { connectDb, disconnectDb } from './db.js';
import { redisConnection } from './queue/connection.js';
import { config } from './config.js';

async function main() {
  await connectDb();
  const app = createApp();
  const server = app.listen(config.port, config.host, () => {
    console.log(`[server] API listening on http://${config.host}:${config.port}`);
  });

  // Graceful shutdown: stop accepting requests, drain, close connections.
  async function shutdown(signal) {
    console.log(`[server] ${signal} received, shutting down`);
    server.close(async () => {
      await disconnectDb();
      await redisConnection.quit();
      process.exit(0);
    });
    // Never hang on a stuck connection.
    setTimeout(() => process.exit(1), 10_000).unref();
  }
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err) => {
  console.error('[server] fatal startup error', err);
  process.exit(1);
});
