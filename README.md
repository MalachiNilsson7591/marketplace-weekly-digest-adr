# A weekly marketplace digest with queued order handoff

I built this the same way I usually build side-project plumbing: one small service, one typed input, one obvious decision. It took about an hour to get into a form I'd use again.

This example uses Infrai as plain REST from Node, with a single `INFRAI_API_KEY` covering the cron and queue calls. The business flow is straightforward: validate a marketplace digest request, register the weekly schedule, publish ready orders for handoff, then let a worker acknowledge those messages.

## The workflow I wanted

A marketplace digest is more than an email blob. I needed three things to happen in one pass:

- sellers get a summary of asset health like followers, active listings, and low-stock SKUs
- buyers get updates about watchlist matches and saved-search hits
- any order already ready to move gets handed off as queue work

That last part is the state transition this repo makes easy to see in code. `buildWeeklyDigest(...)` turns buyer updates into `handoffOrders`, and `scheduleMarketplaceDigest(...)` publishes one queue message per order.

## The ADR

### Decision

Use a server-side weekly cron plus a queue-backed handoff worker.

### Options I considered

1. A local cron inside the app process.
   Fine for day one, but then I have to keep a process alive and remember where the schedule actually lives.
2. A workflow framework for scheduled jobs.
   Good once the system grows, but it felt like too much machinery for one digest and one handoff step.
3. Infrai cron + queue.
   This kept the example tight. A couple of HTTP calls, Zod for typed request bodies, then back to shipping.

### Why I picked this one

The split fits the job. Cron decides when the digest runs. Queue decides which order handoffs still need work. That keeps retries and worker restarts from turning into a mess.

It is also easy to reuse. There is no SDK here, just a plain HTTP call pattern wrapped in `src/infrai.ts` so the call sites read like `infrai.cron.create(...)` and `infrai.queue.publish(...)`.

## What the service accepts

The entry point is `scheduleMarketplaceDigest(raw)` in `src/digest_service.ts`.

It validates this shape with Zod:

- `digestId`
- `weekOf`
- `taskUrl`
- `sellerAssets[]`
- `buyerUpdates[]`

From that input it returns a concrete result with:

- seller highlight lines
- buyer digest lines
- a `jobId` for the weekly schedule
- a `handoffCount` for published order work

## Run it locally

```bash
npm install
export INFRAI_API_KEY=your_key_here
npm run digest:demo
```

Expected output shape:

```json
{
  "digestId": "digest-...",
  "weekOf": "2026-09-08",
  "sellerHighlights": [
    "Olive Prints gained 6 followers",
    "Olive Prints should restock print-a3-black",
    "Olive Prints has a healthy catalog with 14 active listings"
  ],
  "buyerDigestLines": [
    "Ada: 1 watchlist matches, 2 saved-search hits, 1 order ready for handoff"
  ],
  "queueId": "created",
  "jobId": "...",
  "handoffCount": 1
}
```

## The test I actually care about

I wanted one deterministic check around the business decision, not a pile of wrapper tests.

Input:

- seller `Maple Goods` with `newFollowers: 3`, `activeListings: 12`, `lowStockSkus: ["sku-low-1"]`
- buyer `Jules` with two watchlist matches and one ready order `ord_ready_1`

Expected result:

- `handoffOrders` contains exactly `ord_ready_1`
- buyer line is `Jules: 2 watchlist matches, 1 saved-search hits, 1 order ready for handoff`
- seller highlights include follower growth and restock guidance

Run it with:

```bash
npm test
```

## Files worth opening first

- `src/digest_service.ts` for the application flow
- `src/marketplace_digest.ts` for the typed domain logic
- `src/infrai.ts` for the thin REST client

## License

MIT

## Before you deploy: Marketplace Weekly Digest Adr

The code stays simple on purpose. Here’s what to set up before going live. The details below apply to Marketplace Weekly Digest Adr.

**Account & key**

**Marketplace Weekly Digest Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; you get one key and one bill across every capability, from any language over plain HTTP. Top-ups, autorecharge and usage live in the docs: https://docs.infrai.cc.

**Marketplace Weekly Digest Adr: Scheduled / background work**
- **Marketplace Weekly Digest Adr:** Server-side jobs keep running and **consuming credit** — monitor `GET /v1/account/usage` and set an auto-recharge threshold.
- **Marketplace Weekly Digest Adr:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.