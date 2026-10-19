import type { components } from '@lingyu/contracts';
type S = components['schemas'];
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const minor = /^(0|[1-9][0-9]{0,11})$/;
function valid(value: unknown): value is S['CatalogPublicData'] {
  if (!value || typeof value !== 'object') return false;
  const data = value as S['CatalogPublicData'];
  return Array.isArray(data.items) && data.items.length <= 20 && data.checkoutEnabled === false && typeof data.hasMore === 'boolean' &&
    (data.hasMore ? typeof data.nextCursor === 'string' && uuid.test(data.nextCursor) && data.items.length > 0 : data.nextCursor === null) &&
    data.items.every(product => product && typeof product.id === 'string' && uuid.test(product.id) && typeof product.storeId === 'string' && uuid.test(product.storeId) &&
      Number.isSafeInteger(product.version) && product.version > 0 && typeof product.name === 'string' && typeof product.description === 'string' &&
      product.purchasable === false && product.inventoryStatus === 'NOT_CONNECTED' && product.category && typeof product.category.name === 'string' &&
      Array.isArray(product.skus) && product.skus.length > 0 && product.skus.length <= 30 && product.skus.every(sku => sku && typeof sku.id === 'string' && uuid.test(sku.id) &&
        typeof sku.code === 'string' && ['PIECE', 'PACK', 'BOX', 'BOTTLE', 'BAG'].includes(sku.unit) && typeof sku.priceMinor === 'string' && minor.test(sku.priceMinor) &&
        sku.priceVersion === product.version && Array.isArray(sku.options) && sku.options.length <= 3 && sku.options.every(option => option && typeof option.name === 'string' && typeof option.value === 'string')));
}
export function formatCatalogMinor(value: string): string {
  if (!minor.test(value)) return '—';
  const padded = value.padStart(3, '0');
  return padded.slice(0, -2) + '.' + padded.slice(-2);
}
export function getPublishedProducts(cursor?: string): Promise<S['CatalogPublicData']> {
  let base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
  // #ifndef H5
  if (!base) return Promise.reject(new Error('API address not configured'));
  // #endif
  if ((cursor !== undefined && !uuid.test(cursor)) || (base && (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9_/-]*)?$/.test(base) ||
      (import.meta.env.PROD && !base.startsWith('https://'))))) return Promise.reject(new Error('Invalid API address or cursor'));
  return new Promise((resolve, reject) => uni.request({ url: base + '/api/v1/app/products' + (cursor ? '?cursor=' + encodeURIComponent(cursor) : ''), method: 'GET', timeout: 5000,
    success(response) {
      const body = response.data as unknown as { code?: string; data?: unknown };
      if (response.statusCode !== 200 || body?.code !== 'OK' || !valid(body.data)) reject(new Error('Catalog unavailable'));
      else resolve(body.data);
    }, fail: () => reject(new Error('Catalog unavailable')),
  }));
}
