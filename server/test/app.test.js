import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';
import { redisConnection } from '../src/queue/connection.js';

// HTTP smoke test: no database needed. The health endpoint reports "not ready"
// (503) while Mongo is down, and protected routes reject missing tokens.
test('health and auth guard wiring', async (t) => {
  const app = createApp();
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  t.after(async () => {
    server.closeAllConnections?.();
    server.close();
    await redisConnection.quit();
  });
  const base = `http://127.0.0.1:${server.address().port}`;

  const health = await fetch(`${base}/health`);
  assert.equal(health.status, 503); // no Mongo in the test environment
  assert.deepEqual(await health.json(), { ok: false, db: 0 });

  const guarded = await fetch(`${base}/api/campaigns`);
  assert.equal(guarded.status, 401);

  const notFound = await fetch(`${base}/nope`);
  assert.equal(notFound.status, 404);
});
