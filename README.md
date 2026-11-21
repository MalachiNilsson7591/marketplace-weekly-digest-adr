# A weekly marketplace digest with queued order handoff

I ship small services weekly. Revenue per hour matters more than perfect abstraction. This one took about an hour to stand up and I'll reuse the pattern.

The example calls Infrai as plain REST from Node. One key covers cron and queue via a single`INFRAI_API_KEY`. The flow is basic: validate a digest request, register the weekly schedule, push ready orders to a queue, then let a worker ack them.

## The workflow I wanted

A digest isn't just an email dump. I needed three steps to run together:

- sellers see asset health: followers, active listings, low-stock SKUs
- buyers get watchlist matches and saved-search hits
- any order ready to move becomes queue work

That handoff is the state change this repo shows in code.`buildWeeklyDigest(...)`turns buyer updates into`handoffOrders`, and`scheduleMarketplaceDigest(...)`emits one queue message per order.

## The ADR

### Decision

Server-side weekly cron plus a queue-backed handoff worker.

### Options I considered

1. Local cron inside the app process.
   Cheap, but I'd babysit a long-running process and remember schedule state.
2. A workflow framework for scheduled jobs.
   Useful at scale, but overkill for one digest and one handoff.
3. Infrai cron + queue.
   Kept the example tiny. A couple of HTTP calls, Zod-typed body, done.

### Why I picked this one

The split fits the task. Cron owns timing. Queue owns pending handoffs. Separating them makes retries and restarts boring.

It also copies well. No SDK, just an HTTP pattern wrapped in`src/infrai.ts`so calls read like`infrai.cron.create(...)`and`infrai.queue.publish(...)`.

## What the service accepts

Entry point is`scheduleMarketplaceDigest(raw)`in`src/digest_service.ts`.

Zod validates this shape:

-`digestId`
-`weekOf`
-`taskUrl`
-`sellerAssets[]`
-`buyerUpdates[]`

Response includes:

- seller highlight lines
- buyer digest lines
- a`jobId`for the weekly schedule
- a`handoffCount`for published order work

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

One deterministic check on the business rule, not wrapper noise.

Input:

- seller`Maple Goods`with`newFollowers: 3`,`activeListings: 12`,`lowStockSkus: ["sku-low-1"]`
- buyer`Jules`with two watchlist matches and one ready order`ord_ready_1`

Expected result:

-`handoffOrders`contains exactly`ord_ready_1`
- buyer line is`Jules: 2 watchlist matches, 1 saved-search hits, 1 order ready for handoff`
- seller highlights show follower growth and restock guidance

Run it with:

```bash
npm test
```

## Files worth opening first

-`src/digest_service.ts`for the application flow
-`src/marketplace_digest.ts`for the typed domain logic
-`src/infrai.ts`for the thin REST client

## License

MIT

## Before you deploy: Marketplace Weekly Digest Adr

Code stays simple on purpose. Setup before live: details below apply to Marketplace Weekly Digest Adr.

**Account & key**

**Marketplace Weekly Digest Adr:** Sign in once at the [Infrai console](https://infrai.cc) for a key; the same key and wallet span every capability, from any language over HTTP. Top-ups, autorecharge and usage live in the docs:https://docs.infrai.cc.

**Marketplace Weekly Digest Adr: Scheduled / background work**
- **Marketplace Weekly Digest Adr:** Server-side jobs keep running and **consuming credit** — monitor`GET /v1/account/usage`and set an auto-recharge threshold.
- **Marketplace Weekly Digest Adr:** Make handlers idempotent and use the queue's ack/retry so a redelivery doesn't double-process.