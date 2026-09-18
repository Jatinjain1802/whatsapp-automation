# Server architecture

Design goal: **large uploads and large campaigns must never take the API down.**
A 100k-row Excel import or a 500k-recipient campaign is normal input, not an
edge case. Every heavy operation is batched, idempotent, and runs outside the
HTTP request that started it.

## Components

```
                        ┌─────────────────────────────────────────────┐
  React dashboard  ───▶ │  API process (Express, src/index.js)         │
                        │  auth · groups · contacts · imports ·        │
                        │  templates · campaigns · /health             │
                        └───────┬─────────────────────┬───────────────┘
                                │ Mongoose (pool)     │ BullMQ producers
                                ▼                     ▼
  Meta webhooks ─────▶ /webhooks/whatsapp      MongoDB            Redis
   (verify + bulk status/inbound processing)    │                  │ queues:
                                                │                  │  whatsapp-send
                        ┌───────────────────────┘                  │  campaign-jobs
                        │                                          ▼
                        │                        Worker process (src/queue/worker.js)
                        │                          · campaign-jobs: prepare-campaign
                        │                          · whatsapp-send: rate-limited Meta calls
                        └──────── per-recipient status writes ◀────────┘
```

Two processes share one codebase and one Redis: the **API** answers requests
fast and never does bulk work inline; the **worker** owns everything heavy.
Scale them independently (more API replicas behind a load balancer, more
worker replicas to raise send throughput).

## Pipeline 1 - Excel/CSV import

1. `POST /api/imports/headers` - read the header row for the mapping UI.
2. `POST /api/imports/preview` - parse + validate the whole file in memory
   (phone normalization to E.164, in-file dedupe, consent parsing), then stage
   the validated rows in the `importrows` collection with batched
   `insertMany` (`IMPORT_BATCH_SIZE`, default 1000). The `ImportJob` document
   keeps only stats, a 10-row sample and up to 500 errors.
   Why staging rows instead of embedding them: a 100k-row upload embedded in
   one document hits MongoDB's 16MB document limit.
3. `POST /api/imports/:id/confirm` - streams staged rows through a cursor and
   upserts `contacts` with **chunked unordered `bulkWrite`**
   (one round trip per 1000 rows instead of one per row). Group names are
   upserted once each and cached. The suppression list always wins over file
   consent. Staging rows are deleted on success.

A failed confirm leaves the job `failed` with staging rows intact, so the
import can be retried without re-uploading.

## Pipeline 2 - Campaign send

1. `POST /api/campaigns/:id/send` - recomputes the recipient snapshot
   (group members with `opted_in` consent, minus the suppression list),
   stamps the campaign `queuing`, and enqueues **one** `prepare-campaign`
   job. The HTTP call returns immediately.
2. Worker `prepare-campaign` - for each chunk (`CAMPAIGN_BATCH_SIZE`,
   default 2000):
   - upsert `messages` rows with `$setOnInsert` on the unique
     `idempotencyKey` (`campaignId:contactId`),
   - read the chunk back and `sendQueue.addBulk()` one job per row with a
     stable `jobId` (`send-<messageId>`).
   Both steps are idempotent: a crash anywhere is recovered by re-running the
   job - existing rows are not duplicated and existing queue jobs are deduped
   by BullMQ. When the last chunk lands the campaign flips to `sending`.
3. Worker `whatsapp-send` - one job = one recipient. Re-checks suppression,
   builds template params, calls the Cloud API. BullMQ `limiter`
   (`SEND_RATE_LIMIT_MAX` per `SEND_RATE_LIMIT_MS`, defaults 20/sec) plus
   `SEND_CONCURRENCY` keep throughput inside Meta's per-number limits.
   - **Permanent** Meta errors (invalid number, no opt-in, template paused)
     are marked `failed` and never retried.
   - **Transient** errors (429, 5xx, network) retry with exponential backoff
     (`attempts: 3`); a job that exhausts retries is marked `failed` so a
     campaign can never hang in `sending` forever.

There is no recipient-id array on the campaign document: the `messages`
collection **is** the frozen snapshot. Later group edits never rewrite
history, and the campaign document stays small at any audience size.

## Pipeline 3 - Webhooks (status + inbound)

Meta batches many status updates per POST and expects a fast ack. The handler
acks first, then processes the batch with three bulk operations: one
`find` over the wamid set, one unordered `bulkWrite` of message transitions,
one `bulkWrite` of aggregated per-campaign `$inc` counters. Statuses are
monotonic per message (`read` never downgrades to `delivered`); duplicates and
out-of-order events are dropped before counting, so counters stay exact.
`GET /api/campaigns/:id` additionally recomputes stats from the `messages`
collection on every read, which heals any missed webhook.

Ownership of counters: webhook owns `sent/delivered/read/failed`, the worker
owns `skipped`, and refresh-on-read owns the final truth. No double counting.

Inbound `STOP` (and synonyms) flips consent to `opted_out` and upserts the
number into `suppressions`, which is checked again inside the worker right
before every send.

## Data model & indexes

| Collection | Key indexes | Why |
| --- | --- | --- |
| `contacts` | `(business, phone)` unique, `(business, groups)` | upsert target + campaign snapshot query |
| `messages` | `idempotencyKey` unique, `(campaign, status)`, `metaMessageId` (sparse) | dedupe, report/stats aggregation, webhook lookup |
| `importrows` | `job` | staged upload rows between preview and confirm |
| `suppressions` | `(business, phone)` unique | pre-send block list |
| `groups` / `templates` | `(business, name)` unique | natural keys |

## Configuration (see server/.env.example)

| Knob | Default | Effect |
| --- | --- | --- |
| `MONGO_MAX_POOL_SIZE` | 50 | Mongo connections per process (API and worker each have their own) |
| `IMPORT_BATCH_SIZE` | 1000 | docs per insert/bulkWrite chunk in imports |
| `CAMPAIGN_BATCH_SIZE` | 2000 | recipients per chunk in prepare-campaign |
| `SEND_RATE_LIMIT_MAX` / `SEND_RATE_LIMIT_MS` | 20 / 1000 | worker send rate (Meta per-number throughput) |
| `SEND_CONCURRENCY` | 10 | parallel send jobs per worker |

## Failure handling

- Every bulk step is idempotent; retries never duplicate messages or contacts.
- Graceful shutdown on SIGTERM/SIGINT in both processes: workers stop picking
  up jobs and let in-flight sends finish, the API drains, then Mongo/Redis close.
- `/health` returns 503 when Mongo is disconnected, so a load balancer can
  route around a sick API process.
- Meta credentials live only in `.env` (gitignored). Nothing in the database
  schema or logs requires a plaintext token.

## Tests

`npm test` (in `server/`) runs:
- unit tests - phone normalization, Excel parse/dedupe/consent, template params
  (plain object and Mongoose Map),
- HTTP smoke - health semantics + auth guard,
- integration - real MongoDB (in-memory, binary downloaded on first run) and
  real Redis: 120-row import with duplicates/invalid/suppression, a
  119-recipient campaign, prepare-job crash-retry dedupe, stats recompute and
  completion detection.

## Known limits (honest list)

- Excel parsing is CPU-bound in the API process; very large files (100k+ rows)
  parse fine but block the event loop briefly. Next step: move parsing into a
  worker queue.
- One Redis instance and one Mongo database; multi-region is out of scope.
- Messaging-limit tiers (250 conversations/24h on new portfolios, scaling with
  quality rating) are enforced by Meta, not this codebase - the queue will
  deliver, Meta will accept/reject.
