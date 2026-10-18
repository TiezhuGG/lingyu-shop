export interface StoredAppSession {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly accessExpiresAt: string;
  readonly refreshExpiresAt: string;
}

const sessionStorageKey = 'lingyu.app-session.v1';
// T05-C owns the data shape and merge semantics. T02-A deliberately never clears this key.
export const guestCartStorageKey = 'lingyu.guest-cart.v1';

// Local shopping intentions only. Catalog validity, price and login merge belong to T05-C.
export interface GuestCartDraft {
  readonly storeId: string;
  readonly items: ReadonlyArray<{ readonly skuId: string; readonly quantity: number }>;
}

function guestDraft(value: unknown): GuestCartDraft | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
  const draft = value as Record<string, unknown>;
  const id = (input: unknown): input is string => typeof input === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(input);
  if (!id(draft.storeId) || !Array.isArray(draft.items) || draft.items.length > 100) return null;
  const seen = new Set<string>();
  const items: Array<{ skuId: string; quantity: number }> = [];
  for (const value of draft.items) {
    if (value === null || typeof value !== 'object' || Array.isArray(value)) return null;
    const item = value as Record<string, unknown>;
    if (!id(item.skuId) || seen.has(item.skuId) || typeof item.quantity !== 'number' || !Number.isSafeInteger(item.quantity) || item.quantity < 1 || item.quantity > 999) return null;
    seen.add(item.skuId);
    items.push({ skuId: item.skuId, quantity: item.quantity });
  }
  return { storeId: draft.storeId, items };
}

export function readGuestCartDraft(): GuestCartDraft | null {
  return guestDraft(uni.getStorageSync(guestCartStorageKey) as unknown);
}

export function saveGuestCartDraft(draft: GuestCartDraft): void {
  const normalized = guestDraft(draft);
  if (normalized === null) throw new TypeError('Invalid guest cart draft');
  uni.setStorageSync(guestCartStorageKey, normalized);
}

function valid(value: unknown): value is StoredAppSession {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const candidate = value as Record<string, unknown>;
  return ['accessToken', 'refreshToken', 'accessExpiresAt', 'refreshExpiresAt'].every(key => typeof candidate[key] === 'string' && candidate[key].length > 0);
}

export function readStoredAppSession(): StoredAppSession | null {
  const value = uni.getStorageSync(sessionStorageKey) as unknown;
  return valid(value) ? value : null;
}

export function saveStoredAppSession(session: StoredAppSession): void {
  uni.setStorageSync(sessionStorageKey, session);
}

export function clearStoredAppSession(): void {
  uni.removeStorageSync(sessionStorageKey);
}
