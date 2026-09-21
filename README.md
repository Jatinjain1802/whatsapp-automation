# WhatsApp Automation

Broadcast CRM for businesses on the **official Meta WhatsApp Business Platform (Cloud API)**.
A business uploads a customer Excel/CSV, organizes customers into dashboard groups, picks a
Meta-approved message template, and sends a broadcast campaign to every opted-in customer in
that group - with live sent / delivered / read / failed tracking.

> **Why the official API, not WhatsApp Web automation?**
> Automating WhatsApp Web (QR session bots, whatsapp-web.js, Baileys, ...) violates the
> WhatsApp Terms of Service and the sender number gets banned under exactly this kind of
> bulk-sending behavior. This project uses only the Cloud API:
> https://developers.facebook.com/docs/whatsapp/cloud-api/overview

## Product rules this build enforces

These are Meta platform rules, not optional features:

1. **Opt-in is mandatory.** Only contacts with recorded consent receive broadcasts. The Excel
   import carries a consent column, contacts can be opted out from the dashboard, and an
   inbound `STOP` message automatically suppresses the number everywhere.
   https://developers.facebook.com/docs/whatsapp/overview/getting-opt-in/
2. **No free-text broadcasts.** Business-initiated messages must use **pre-approved templates**
   (Utility / Marketing / Authentication). Free-form messages are only allowed inside the
   24-hour customer service window that opens when the customer messages the business.
3. **Template approval is part of the flow.** Templates are created as drafts, submitted to
   Meta from the dashboard, and only `APPROVED` templates appear in the campaign wizard.
4. **Messaging limits apply.** New business portfolios start with a cap on business-initiated
   conversations per 24h (250, scaling with quality rating). The send queue rate-limits and
   retries transient errors, and permanent errors (invalid number, no consent) are never retried.

## Stack

- **client/** - React + Vite dashboard
- **server/** - Node.js + Express API, MongoDB (Mongoose), Redis + BullMQ send queue
- **Meta WhatsApp Business Cloud API** - template submission, message sending, status webhooks

## End-to-end flow

1. **Setup** - business registers, connects its Meta app credentials via `.env`
   (WABA ID, Phone Number ID, access token, webhook verify token).
2. **Import** - Excel/CSV upload -> column mapping (name, phone, group, consent) ->
   phone normalization to E.164 (`libphonenumber-js`) -> invalid/duplicate preview -> confirm.
   Validated rows are staged in their own collection and confirmed with chunked
   bulk upserts, so a 100k-row file imports in seconds without blocking the API.
3. **Groups** - imported customers land in dashboard segments (these are CRM segments,
   _not_ WhatsApp groups).
4. **Templates** - business drafts a template (`Hi {{1}}, your order {{2}} has been dispatched.`),
   submits it to Meta, waits for approval.
5. **Campaign** - pick group + approved template -> map `{{1}}`-style variables to customer
   fields -> preview shows recipient count, no-consent exclusions and a rendered sample ->
   confirm send.
6. **Sending** - confirm stamps the campaign `queuing` and returns immediately; a background
   prepare job creates one message record and one BullMQ job per customer in bulk chunks
   (idempotency key `campaignId:contactId` prevents duplicate sends even across crashes),
   then rate-limited workers call the Cloud API.
7. **Tracking** - Meta webhooks update sent/delivered/read/failed per recipient; the report
   page polls live and exports a failed CSV.
8. **Opt-out** - an inbound `STOP` flips consent and adds the number to the suppression list,
   which is checked again inside the worker right before every send.

## Local development

Prereqs: Node 20+, Docker (for Mongo + Redis) or your own instances.

```bash
docker compose up -d            # mongo + redis

cd server
cp .env.example .env            # fill in Meta credentials (MONGODB_URI works with
                                # local Docker Mongo or a MongoDB Atlas SRV string)
npm install
npm run dev                     # API on :4000
npm run worker                  # second terminal: BullMQ send worker

cd ../client
npm install
npm run dev                     # dashboard on :5173 (proxies /api to :4000)
```

### Getting Meta credentials (free test tier)

1. Create an app at https://developers.facebook.com/apps and add the **WhatsApp** product.
2. In _WhatsApp > API setup_ you get a **test phone number**, a temporary access token,
   the WABA ID and Phone Number ID. Test numbers can message up to 5 verified recipient
   numbers for free - enough to run the whole flow end to end.
3. Webhooks: expose your server (e.g. `ngrok http 4000`) and subscribe
   `https://<host>/webhooks/whatsapp` to the `messages` field with your verify token.

## API surface

| Route                                                                                | Purpose                                   |
| ------------------------------------------------------------------------------------ | ----------------------------------------- | ------------------ |
| `POST /api/auth/register`, `POST /api/auth/login`                                    | JWT auth                                  |
| `POST /api/imports/headers` / `preview` / `:id/confirm`                              | Excel import pipeline                     |
| `GET/POST/DELETE /api/groups`                                                        | Segments                                  |
| `GET /api/contacts`, `POST /api/contacts/:id/opt-in                                  | opt-out`                                  | Contacts + consent |
| `GET/POST /api/templates`, `POST /:id/submit`, `POST /sync`                          | Template lifecycle with Meta              |
| `GET/POST /api/campaigns`, `GET /:id/preview`, `POST /:id/send`, `GET /:id/messages` | Campaigns + reports                       |
| `GET/POST /webhooks/whatsapp`                                                        | Meta verification + status/inbound events |

## Data model

`businesses`, `users`, `contacts` (E.164 phone, opt-in record, groups, custom fields),
`groups`, `templates` (Meta status), `campaigns` (stats; the `messages` collection is the
frozen recipient snapshot), `messages` (per-recipient status + idempotency key),
`importJobs` + `importRows` (staged uploads), `suppressions`.

## Server architecture & scaling

The backend is built for large uploads and large campaigns: heavy work is batched,
idempotent, and runs in a worker process, never inside an HTTP request. See
[docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) for the component diagram, the import /
campaign / webhook pipelines, index list, tuning knobs and the honest known-limits list.

## Tests

```bash
cd server
npm test        # unit + HTTP smoke + integration (real in-memory MongoDB, needs local Redis)
```

The integration test needs a Redis on `REDIS_URL` (default `redis://localhost:6379`);
`docker compose up -d` provides one.

## Roadmap

- [ ] Meta test-number end-to-end run (Phase 1)
- [ ] Multi-business SaaS with Meta Embedded Signup
- [ ] Template analytics + quality-rating monitor
- [ ] Scheduled campaigns (send later)
- [ ] Inbox view for the 24-hour window (free-form replies)
- [ ] Encrypted at-rest storage for Meta access tokens
- [ ] Per-business default country for phone parsing

## Notes

- Never commit `.env` or any real customer list. `.gitignore` covers both.
- Utility vs Marketing templates have different Meta approval bars and per-message pricing -
  pick the category that matches the actual content.

  Email: demo@example.com
  Password: password123
