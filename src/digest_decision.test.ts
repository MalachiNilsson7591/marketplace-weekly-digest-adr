import test from 'node:test';
import assert from 'node:assert/strict';
import { buildWeeklyDigest, marketplaceDigestRequestSchema } from './marketplace_digest.js';

test('buildWeeklyDigest turns buyer-ready orders into handoff work and seller highlights', () => {
  const input = marketplaceDigestRequestSchema.parse({
    digestId: 'digest_test_01',
    weekOf: '2026-09-08',
    taskUrl: 'https://example.com/hooks/marketplace-digest',
    sellerAssets: [
      {
        sellerId: 'seller_maple',
        shopName: 'Maple Goods',
        activeListings: 12,
        newFollowers: 3,
        lowStockSkus: ['sku-low-1']
      }
    ],
    buyerUpdates: [
      {
        buyerId: 'buyer_jules',
        firstName: 'Jules',
        watchlistMatches: ['Studio Lamp', 'Oak Shelf'],
        savedSearchHits: 1,
        readyOrders: [
          {
            orderId: 'ord_ready_1',
            sellerId: 'seller_maple',
            totalCents: 12900
          }
        ]
      }
    ]
  });

  const result = buildWeeklyDigest(input);

  assert.deepEqual(result.handoffOrders, [
    {
      orderId: 'ord_ready_1',
      buyerId: 'buyer_jules',
      sellerId: 'seller_maple',
      totalCents: 12900
    }
  ]);
  assert.equal(result.buyerDigestLines[0], 'Jules: 2 watchlist matches, 1 saved-search hits, 1 order ready for handoff');
  assert.ok(result.sellerHighlights.includes('Maple Goods gained 3 followers'));
  assert.ok(result.sellerHighlights.includes('Maple Goods should restock sku-low-1'));
});
