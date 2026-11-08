import { randomUUID, createHash } from 'node:crypto';
import { infrai } from './infrai.js';
import { buildWeeklyDigest, marketplaceDigestRequestSchema, type MarketplaceDigestRequest } from './marketplace_digest.js';

function stablePublishPayload(item: { orderId: string; buyerId: string; sellerId: string; totalCents: number }, digestId: string) {
  const dedupeKey = createHash('sha256')
    .update(`${digestId}:${item.orderId}:${item.buyerId}:${item.sellerId}:${item.totalCents}`)
    .digest('hex');

  return {
    dedupeKey,
    event: 'order_handoff_requested',
    digestId,
    orderId: item.orderId,
    buyerId: item.buyerId,
    sellerId: item.sellerId,
    totalCents: item.totalCents
  };
}

export async function scheduleMarketplaceDigest(raw: unknown) {
  const request = marketplaceDigestRequestSchema.parse(raw);
  const summary = buildWeeklyDigest(request);
  const queueName = request.digestId;
  const queue = await infrai.queue.create({ name: queueName });
  const scheduled = await infrai.cron.create({
    cron_expr: '0 9 * * 1',
    task: request.taskUrl
  });

  for (const order of summary.handoffOrders) {
    await infrai.queue.publish({
      queue: queueName,
      payload: stablePublishPayload(order, request.digestId)
    });
  }

  return {
    digestId: summary.digestId,
    weekOf: summary.weekOf,
    sellerHighlights: summary.sellerHighlights,
    buyerDigestLines: summary.buyerDigestLines,
    queueId: queue.queue_id ?? 'created',
    jobId: scheduled.job_id,
    handoffCount: summary.handoffOrders.length
  };
}

export async function runBuyerHandoffWorker(queue: string) {
  const consumed = await infrai.queue.consume({
    queue,
    max_messages: 10,
    visibility_timeout: 30
  });

  const messages = consumed.messages ?? [];
  const processed: string[] = [];

  for (const message of messages) {
    processed.push(String(message.message_id));
    await infrai.queue.ack({ queue, message_id: message.message_id });
  }

  return processed;
}

const exampleInput: MarketplaceDigestRequest = {
  digestId: `digest-${randomUUID()}`,
  weekOf: '2026-09-08',
  taskUrl: process.env.DIGEST_TASK_URL || 'https://example.com/hooks/marketplace-digest',
  sellerAssets: [
    {
      sellerId: 'seller_olive',
      shopName: 'Olive Prints',
      activeListings: 14,
      newFollowers: 6,
      lowStockSkus: ['print-a3-black']
    },
    {
      sellerId: 'seller_nova',
      shopName: 'Nova Ceramics',
      activeListings: 7,
      newFollowers: 0,
      lowStockSkus: []
    }
  ],
  buyerUpdates: [
    {
      buyerId: 'buyer_ada',
      firstName: 'Ada',
      watchlistMatches: ['Midnight Vase'],
      savedSearchHits: 2,
      readyOrders: [
        {
          orderId: 'ord_1001',
          sellerId: 'seller_nova',
          totalCents: 7200
        }
      ]
    }
  ]
};

async function main() {
  const result = await scheduleMarketplaceDigest(exampleInput);
  console.log(JSON.stringify(result, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('digest_service.ts')) {
  main().catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
}
