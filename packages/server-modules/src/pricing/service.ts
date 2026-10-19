import { ConflictException, Injectable } from '@nestjs/common';
import { AuditService } from '../foundation/audit';
import { transactionClientFor, type TransactionContext } from '../foundation/transaction';
type PriceInput = { id: string; priceMinor: string | null };
type Attribution = { adminId: string; requestId?: string };
@Injectable()
export class PricingService {
  constructor(private readonly audit: AuditService) {}
  async drafts(context: TransactionContext, skuIds: string[]) {
    const rows = await transactionClientFor(context).skuPriceDraft.findMany({ where: { skuId: { in: skuIds } } });
    return new Map(rows.map(row => [row.skuId, row.priceMinor?.toString() ?? null]));
  }
  // Caller owns the Catalog aggregate/version and passes only its verified SKU identities.
  async saveDrafts(context: TransactionContext, productId: string, version: number, inputs: PriceInput[], actor: Attribution) {
    const client = transactionClientFor(context), previous = await this.drafts(context, inputs.map(item => item.id));
    for (const input of [...inputs].sort((a, b) => a.id.localeCompare(b.id))) {
      const priceMinor = input.priceMinor === null ? null : BigInt(input.priceMinor);
      await client.skuPriceDraft.upsert({ where: { skuId: input.id }, create: { skuId: input.id, priceMinor }, update: { priceMinor } });
      if (!previous.has(input.id) || previous.get(input.id) !== input.priceMinor) await this.audit.append(context, {
        actor: { type: 'ADMIN', id: actor.adminId }, action: 'pricing.draft_saved', objectType: 'sku', objectId: input.id, requestId: actor.requestId,
        changes: { productId, version, previousMinor: previous.get(input.id) ?? null, priceMinor: input.priceMinor },
      });
    }
  }
  async publish(context: TransactionContext, productId: string, version: number, skuIds: string[], actor: Attribution) {
    const prices = await this.drafts(context, skuIds), client = transactionClientFor(context);
    for (const skuId of [...skuIds].sort()) {
      const price = prices.get(skuId);
      if (price === undefined || price === null) throw new ConflictException();
      await client.skuPriceVersion.create({ data: { productId, version, skuId, priceMinor: BigInt(price) } });
      await this.audit.append(context, { actor: { type: 'ADMIN', id: actor.adminId }, action: 'pricing.published', objectType: 'sku', objectId: skuId,
        requestId: actor.requestId, changes: { productId, version, priceMinor: price } });
    }
  }
  async published(context: TransactionContext, productId: string, version: number) {
    const rows = await transactionClientFor(context).skuPriceVersion.findMany({ where: { productId, version } });
    return new Map(rows.map(row => [row.skuId, row.priceMinor.toString()]));
  }
}
