import type { components } from '@lingyu/contracts';
type S = components['schemas'];
export const textPageLabels: Record<S['CmsPageCode'], string> = { STORY: '品牌故事', TERMS: '服务条款', PRIVACY: '隐私说明' };
export function isTextPageCode(value: unknown): value is S['CmsPageCode'] { return typeof value === 'string' && Object.hasOwn(textPageLabels, value); }
function valid(value: unknown, code: S['CmsPageCode']): value is S['CmsPublicData'] {
  if (!value || typeof value !== 'object') return false;
  const data = value as S['CmsPublicData'], page = data.published;
  return data.pageCode === code && (page === null || (!!page && typeof page.title === 'string' && [...page.title].length <= 80 && typeof page.body === 'string' && [...page.body].length <= 12000 &&
    Number.isSafeInteger(page.version) && page.version > 0 && typeof page.publishedAt === 'string' && Number.isFinite(Date.parse(page.publishedAt)) &&
    (page.sourceVersion === null || (Number.isSafeInteger(page.sourceVersion) && page.sourceVersion > 0 && page.sourceVersion < page.version))));
}
export function getPublishedText(code: S['CmsPageCode']): Promise<S['CmsPublicData']> {
  if (!isTextPageCode(code)) return Promise.reject(new Error('Invalid content page'));
  let base = import.meta.env.VITE_API_BASE_URL?.replace(/\/$/, '') ?? '';
  // #ifndef H5
  if (!base) return Promise.reject(new Error('API address not configured'));
  // #endif
  if (base && (!/^https?:\/\/[A-Za-z0-9.-]+(?::[0-9]{1,5})?(?:\/[A-Za-z0-9_/-]*)?$/.test(base) || (import.meta.env.PROD && !base.startsWith('https://')))) return Promise.reject(new Error('Invalid API address'));
  return new Promise((resolve, reject) => uni.request({ url: base + '/api/v1/app/cms/' + code, method: 'GET', timeout: 5000,
    success(response) { const body = response.data as unknown as { code?: string; data?: unknown };
      if (response.statusCode !== 200 || body?.code !== 'OK' || !valid(body.data, code)) reject(new Error('Content unavailable')); else resolve(body.data);
    }, fail: () => reject(new Error('Content unavailable')),
  }));
}
