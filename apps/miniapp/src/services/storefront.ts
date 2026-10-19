import type { components } from '@lingyu/contracts';
type Storefront = components['schemas']['StorefrontData'];
export function getStorefront(): Promise<Storefront> {
  let base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
  // #ifndef H5
  if (!base) return Promise.reject(new Error('API address not configured'));
  // #endif
  if (base && (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9_/-]*)?$/.test(base) || (import.meta.env.PROD && !base.startsWith('https://')))) return Promise.reject(new Error('Invalid API address'));
  return new Promise((resolve, reject) => uni.request({ url: base + '/api/v1/app/storefront', method: 'GET', timeout: 5000,
    success(response) {
      const body = response.data as unknown as { code?: string; data?: Storefront };
      if (response.statusCode !== 200 || body?.code !== 'OK' || body.data?.mode !== 'ONLINE' ||
          typeof body.data.storeId !== 'string' || typeof body.data.configured !== 'boolean' || !Number.isSafeInteger(body.data.version) ||
          (body.data.displayName !== null && typeof body.data.displayName !== 'string')) reject(new Error('Storefront unavailable'));
      else resolve(body.data);
    }, fail: () => reject(new Error('Storefront unavailable')),
  }));
}
