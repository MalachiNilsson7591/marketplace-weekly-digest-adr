import { z } from 'zod';

export const sellerAssetSchema = z.object({
  sellerId: z.string().min(1),
  shopName: z.string().min(1),
  activeListings: z.number().int().nonnegative(),
  newFollowers: z.number().int().nonnegative(),
  lowStockSkus: z.array(z.string())
});

export const buyerUpdateSchema = z.object({
  buyerId: z.string().min(1),
  firstName: z.string().min(1),
  watchlistMatches: z.array(z.string()),
  savedSearchHits: z.number().int().nonnegative(),
  readyOrders: z.array(z.object({
    orderId: z.string().min(1),
    sellerId: z.string().min(1),
    totalCents: z.number().int().nonnegative()
  }))
});

export const marketplaceDigestRequestSchema = z.object({
  digestId: z.string().min(1),
  weekOf: z.string().min(1),
  taskUrl: z.string().url(),
  sellerAssets: z.array(sellerAssetSchema),
  buyerUpdates: z.array(buyerUpdateSchema)
});

export type MarketplaceDigestRequest = z.infer<typeof marketplaceDigestRequestSchema>;
export type DigestSummary = {
  digestId: string;
  weekOf: string;
  sellerHighlights: string[];
  buyerDigestLines: string[];
  handoffOrders: Array<{ orderId: string; buyerId: string; sellerId: string; totalCents: number }>;
};

export function buildWeeklyDigest(input: MarketplaceDigestRequest): DigestSummary {
  const sellerHighlights = input.sellerAssets.flatMap((asset) => {
    const lines: string[] = [];
    if (asset.newFollowers > 0) {
      lines.push(`${asset.shopName} gained ${asset.newFollowers} follower${asset.newFollowers === 1 ? '' : 's'}`);
    }
    if (asset.lowStockSkus.length > 0) {
      lines.push(`${asset.shopName} should restock ${asset.lowStockSkus.join(', ')}`);
    }
    if (asset.activeListings >= 10) {
      lines.push(`${asset.shopName} has a healthy catalog with ${asset.activeListings} active listings`);
    }
    return lines;
  });

  const buyerDigestLines = input.buyerUpdates.map((buyer) => {
    const orderCount = buyer.readyOrders.length;
    return `${buyer.firstName}: ${buyer.watchlistMatches.length} watchlist matches, ${buyer.savedSearchHits} saved-search hits, ${orderCount} order${orderCount === 1 ? '' : 's'} ready for handoff`;
  });

  const handoffOrders = input.buyerUpdates.flatMap((buyer) =>
    buyer.readyOrders.map((order) => ({
      orderId: order.orderId,
      buyerId: buyer.buyerId,
      sellerId: order.sellerId,
      totalCents: order.totalCents
    }))
  );

  return {
    digestId: input.digestId,
    weekOf: input.weekOf,
    sellerHighlights,
    buyerDigestLines,
    handoffOrders
  };
}
