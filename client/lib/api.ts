import { DAIRY_STORAGE_KEY, getAuthHeader, getSessionAuth, getDairyIdFromCookie } from './auth';
import { db } from './db';
import { syncEngine } from './sync-engine';
import { fetchApi } from './api-base';
import {
  readHouseConfigSessionCache,
  writeHouseConfigSessionCache,
  clearHouseConfigSessionCache,
  removeHouseConfigSessionCacheByHouseId,
} from './house-config-cache';
import { DEFAULT_CACHE_FRESH_MS, GLOBAL_SYNC_INTERVAL_MS } from '@/lib/timing';

const LOCAL_STORAGE_PRESERVE_KEYS = new Set(['bill-manager-auth', 'bill-manager-profiles', DAIRY_STORAGE_KEY, 'theme', 'next-theme']);
const SESSION_STORAGE_PRESERVE_KEYS = new Set(['bill-manager-auth', 'adminSession']);
const revalidationLocks = new Map<string, Promise<void>>();
const activeGetQueries = new Map<
  string,
  { path: string; onData?: (data: unknown) => Promise<void> | void }
>();
const lastOnDataPayloadByCacheKey = new Map<string, WeakMap<object, string>>();
let globalSyncStarted = false;
let clientSessionInit: Promise<void> | null = null;

const CACHE_INVALIDATION: Record<string, string[]> = {
  houses: ['/houses', '/house-config', '/house-balance', '/bills', '/delivery-logs'],
  'house-config': ['/house-config', '/houses'],
  'house-balance': ['/house-balance', '/houses', '/bills'],
  bills: ['/bills', '/house-balance', '/houses'],
  users: ['/users', '/house-config'],
  'product-rates': ['/product-rates', '/delivery-logs', '/bills'],
  'delivery-logs': ['/delivery-logs', '/house-balance', '/bills', '/houses'],
  'delivery-plans': ['/delivery-plans'],
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function isOnline() {
  return isBrowser() && navigator.onLine;
}

export async function ensureClientSessionStoragePolicy(): Promise<void> {
  if (!isBrowser()) return;
  if (clientSessionInit) {
    await clientSessionInit;
    return;
  }

  clientSessionInit = (async () => {
    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.localStorage.length; i += 1) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        if (!LOCAL_STORAGE_PRESERVE_KEYS.has(key)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Ignore storage cleanup failures.
    }

    try {
      const keysToRemove: string[] = [];
      for (let i = 0; i < window.sessionStorage.length; i += 1) {
        const key = window.sessionStorage.key(i);
        if (!key) continue;
        if (!SESSION_STORAGE_PRESERVE_KEYS.has(key)) {
          keysToRemove.push(key);
        }
      }

      for (const key of keysToRemove) {
        window.sessionStorage.removeItem(key);
      }
    } catch {
      // Ignore storage cleanup failures.
    }

    try {
      // Clean up stale query cache entries older than 1 hour,
      // but keep the data so offline-first works across page loads.
      const staleThreshold = Date.now() - 60 * 60 * 1000;
      await db.queryCache.where('updatedAt').below(staleThreshold).delete();
    } catch {
      // Ignore IndexedDB cleanup failures.
    }
  })();

  await clientSessionInit;
}

function startGlobalGetSyncLoop() {
  if (!isBrowser() || globalSyncStarted) return;

  globalSyncStarted = true;

  window.setInterval(() => {
    if (!navigator.onLine) return;
    if (document.visibilityState !== 'visible') return;

    for (const [cacheKey, query] of activeGetQueries.entries()) {
      void revalidateGet<unknown>(query.path, cacheKey, query.onData);
    }
  }, GLOBAL_SYNC_INTERVAL_MS);
}

function getResource(path: string): string {
  const clean = path.split('?')[0] ?? path;
  const [first = ''] = clean.split('/').filter(Boolean);
  return first;
}

async function readCache<T>(cacheKey: string): Promise<T | null> {
  if (!isBrowser()) return null;

  const entry = await db.queryCache.get(cacheKey);
  if (!entry) return null;

  try {
    return JSON.parse(entry.payload) as T;
  } catch {
    await db.queryCache.delete(cacheKey);
    return null;
  }
}

async function writeCache<T>(cacheKey: string, data: T): Promise<void> {
  if (!isBrowser()) return;

  qcWriteQueue = qcWriteQueue.then(async () => {
    await db.queryCache.put({
      key: cacheKey,
      payload: JSON.stringify(data),
      updatedAt: Date.now(),
    });
  });
  return qcWriteQueue;
}

async function applyOnDataIfChanged<T>(
  cacheKey: string,
  data: T,
  onData?: (data: T) => Promise<void> | void,
): Promise<void> {
  if (!onData) return;

  let serialized: string;
  try {
    serialized = JSON.stringify(data);
  } catch {
    await onData(data);
    return;
  }

  const handlerKey = onData as unknown as object;
  let payloadByHandler = lastOnDataPayloadByCacheKey.get(cacheKey);
  if (!payloadByHandler) {
    payloadByHandler = new WeakMap<object, string>();
    lastOnDataPayloadByCacheKey.set(cacheKey, payloadByHandler);
  }

  const previous = payloadByHandler.get(handlerKey);
  if (previous === serialized) return;

  payloadByHandler.set(handlerKey, serialized);
  await onData(data);
}

export async function invalidateCache(path: string): Promise<void> {
  if (!isBrowser()) return;

  const resource = getResource(path);
  const prefixes = CACHE_INVALIDATION[resource] ?? [`/${resource}`];
  const activeRefreshes: Array<Promise<void>> = [];

  // Serialize on the same queue as queryCache writes to prevent race conditions
  qcWriteQueue = qcWriteQueue.then(async () => {
    for (const prefix of prefixes) {
      await db.queryCache.where('key').startsWith(`GET:${prefix}`).delete();

      for (const [cacheKey, query] of activeGetQueries.entries()) {
        if (!cacheKey.startsWith(`GET:${prefix}`) && !query.path.startsWith(prefix)) continue;
        activeRefreshes.push(revalidateGet<unknown>(query.path, cacheKey, query.onData));
      }
    }
  });
  await qcWriteQueue;

  await Promise.all(activeRefreshes);
}

/**
 * Reset in-memory and IndexedDB query state when the active account changes.
 * Domain tables are intentionally preserved; callers scope reads by dairy.
 */
export async function resetAccountQueryState(): Promise<void> {
  if (!isBrowser()) return;
  activeGetQueries.clear();
  lastOnDataPayloadByCacheKey.clear();
  await db.queryCache.clear();
  clearHouseConfigSessionCache();
}

// ─── Serialized queryCache updates ────────────────────────────────────────────
let qcWriteQueue: Promise<void> = Promise.resolve();

/** Must be awaited before any queryCache write to avoid race conditions. */
export function awaitQCWriteQueue(): Promise<void> {
  return qcWriteQueue;
}

async function enqueueQCUpdate<T>(
  matches: (cacheKey: string) => boolean,
  update: (data: T) => T | null,
): Promise<void> {
  qcWriteQueue = qcWriteQueue.then(async () => {
    const entries = await db.queryCache.toArray();
    const targets = entries.filter((entry) => entry.key.startsWith('GET:') && matches(entry.key));

    await Promise.all(
      targets.map(async (entry) => {
        try {
          const data = JSON.parse(entry.payload) as T;
          const next = update(data);
          if (next === null) {
            await db.queryCache.delete(entry.key);
            return;
          }

          await db.queryCache.put({
            key: entry.key,
            payload: JSON.stringify(next),
            updatedAt: Date.now(),
          });
        } catch {
          await db.queryCache.delete(entry.key);
        }
      }),
    );
  });
  return qcWriteQueue;
}

async function updateCachedQueries<T>(
  matches: (cacheKey: string) => boolean,
  update: (data: T) => T | null,
): Promise<void> {
  if (!isBrowser()) return;
  return enqueueQCUpdate(matches, update);
}

// ─── Generic fetch helpers ────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const rawBody = await res.text().catch(() => '');
  let body: { message?: string | string[] } & Record<string, unknown> = {};

  if (rawBody) {
    try {
      body = JSON.parse(rawBody) as { message?: string | string[] } & Record<string, unknown>;
    } catch {
      body = { message: rawBody };
    }
  }

  if (!res.ok) {
    const message = Array.isArray(body.message) ? body.message[0] : body.message;
    const fallback = `${res.status} ${res.statusText}`.trim() || 'Unknown error';
    const msg = typeof message === 'string' && message.trim().length > 0 ? message : fallback;

    if (msg === 'PLAN_EXPIRED') {
      if (typeof window !== 'undefined' && !window.location.search.includes('plan-expired=1')) {
        const { handleExpiredDairySession } = await import('./auth');
        handleExpiredDairySession();
        window.location.replace('/?plan-expired=1');
      }
      throw new Error('PLAN_EXPIRED');
    }

    throw new Error(msg);
  }

  return body as T;
}

async function requestGet<T>(path: string): Promise<T> {
  await ensureClientSessionStoragePolicy();
  const res = await fetchApi(path, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return handleResponse<T>(res);
}

async function revalidateGet<T>(
  path: string,
  cacheKey: string,
  onData?: (data: T) => Promise<void> | void,
): Promise<void> {
  if (!isOnline()) return;
  if (revalidationLocks.has(cacheKey)) return;

  const pending = (async () => {
    try {
      const latest = await requestGet<T>(path);
      const serializedLatest = JSON.stringify(latest);
      const existing = await db.queryCache.get(cacheKey);

      if (existing?.payload !== serializedLatest) {
        await db.queryCache.put({
          key: cacheKey,
          payload: serializedLatest,
          updatedAt: Date.now(),
        });
      }

      await applyOnDataIfChanged(cacheKey, latest, onData);
    } catch {
      // Keep stale cache on background fetch failures.
    } finally {
      revalidationLocks.delete(cacheKey);
    }
  })();

  revalidationLocks.set(cacheKey, pending);
  await pending;
}

async function apiGet<T>(
  path: string,
  options?: {
    cacheKey?: string;
    freshMs?: number;
    onData?: (data: T) => Promise<void> | void;
  },
): Promise<T> {
  if (!isBrowser()) {
    return requestGet<T>(path);
  }

  await ensureClientSessionStoragePolicy();
  startGlobalGetSyncLoop();

  const cacheKey = options?.cacheKey ?? `GET:${path}`;
  const freshMs = options?.freshMs ?? DEFAULT_CACHE_FRESH_MS;
  activeGetQueries.set(cacheKey, {
    path,
    onData: options?.onData as ((data: unknown) => Promise<void> | void) | undefined,
  });

  const cached = await readCache<T>(cacheKey);
  if (cached !== null) {
    const entry = await db.queryCache.get(cacheKey);
    await applyOnDataIfChanged(cacheKey, cached, options?.onData);

    if ((Date.now() - (entry?.updatedAt ?? 0) > freshMs) && isOnline()) {
      void revalidateGet(path, cacheKey, options?.onData);
    }

    return cached;
  }

  const latest = await requestGet<T>(path);
  await writeCache(cacheKey, latest);
  await applyOnDataIfChanged(cacheKey, latest, options?.onData);
  return latest;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  await ensureClientSessionStoragePolicy();
  const res = await fetchApi(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  await ensureClientSessionStoragePolicy();
  const res = await fetchApi(path, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function apiDelete<T>(path: string): Promise<T> {
  await ensureClientSessionStoragePolicy();
  const res = await fetchApi(path, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return handleResponse<T>(res);
}

// ─── Types ────────────────────────────────────────────────────────────────────

export type House = {
  id: number;
  houseNo: string;
  area?: string;
  location?: string;
  phoneNo: string;
  alternativePhone?: string;
  description?: string;
  rate1Type?: string;
  rate1?: string;
  rate2Type?: string;
  rate2?: string;
  createdAt: string;
  active: boolean;
  dairyId?: number;
  balance?: HouseBalance;
  configs?: HouseConfig[];
  bills?: Bill[];
};

export type HouseConfig = {
  id: number;
  houseId: number;
  shift: 'morning' | 'evening' | 'shop';
  supplierId?: string;
  position: number;
  dailyAlerts?: string;
  updatedAt?: string;
  house?: House;
  supplier?: { uuid: string; username: string };
};

function normalizeHouseConfigs(configs: unknown): HouseConfig[] | undefined {
  if (Array.isArray(configs)) return configs as HouseConfig[];
  if (configs && typeof configs === 'object') return [configs as HouseConfig];
  return undefined;
}

function normalizeHouseRecord<T extends { configs?: unknown }>(house: T): Omit<T, 'configs'> & { configs?: HouseConfig[] } {
  const { configs, ...rest } = house;
  return {
    ...rest,
    configs: normalizeHouseConfigs(configs),
  };
}

function normalizeHouseCollection<T extends { configs?: unknown }>(houses: T[]): Array<Omit<T, 'configs'> & { configs?: HouseConfig[] }> {
  return houses.map((house) => normalizeHouseRecord(house));
}

/** Read locally cached houses without leaking another signed-in dairy's rows. */
export function queryHousesForActiveDairy(): Promise<House[]> {
  const dairyId = getSessionAuth()?.dairyId ?? getDairyIdFromCookie() ?? null;
  return db.houses.toArray().then((houses) =>
    houses.filter((house) => dairyId === null || house.dairyId == null || house.dairyId === dairyId),
  );
}

function mergeHouseConfigCaches(existing: HouseConfig[], incoming: HouseConfig[]): HouseConfig[] {
  const merged = new Map<number, HouseConfig>()

  for (const config of existing) {
    merged.set(config.houseId, config)
  }

  for (const config of incoming) {
    const previous = merged.get(config.houseId)

    if (!previous) {
      merged.set(config.houseId, config)
      continue
    }

    const previousUpdatedAt = previous.updatedAt ? Date.parse(previous.updatedAt) : Number.NEGATIVE_INFINITY
    const incomingUpdatedAt = config.updatedAt ? Date.parse(config.updatedAt) : Number.NEGATIVE_INFINITY

    if (incomingUpdatedAt >= previousUpdatedAt) {
      merged.set(config.houseId, config)
    }
  }

  return Array.from(merged.values())
}

export type HouseBalance = {
  id: number;
  houseId: number;
  previousBalance: string;
  currentBalance: string;
  updatedAt?: string;
  payments?: PaymentHistory[];
};

export type PaymentHistory = {
  id: number;
  balanceRef: number;
  amount: string;
  discount?: number;
  note?: string;
  recordedBy?: string;
  createdAt: string;
  paidAt: string;
  paymentMethod?: string;
  billIds?: number[];
  balance?: { house?: { id: number; houseNo: string; area?: string } };
};

export type BillItem = {
  name: string;
  qty: number;
  rate: number;
  amount: number;
};

export type Bill = {
  id: number;
  houseId: number;
  month: number;
  year: number;
  fromDate?: string;
  toDate?: string;
  totalAmount: string;
  items: BillItem[];
  previousBalance: string;
  generatedDate: string;
  isClosed?: boolean;
  outstandingAmount?: string | null;
  note?: string;
  house?: { id: number; houseNo: string; area?: string; phoneNo?: string };
  pendingAmount?: number;
  _shiftLabel?: string;
};

export type GenerateAllBillsResult = {
  date: string;
  totalHouses: number;
  generatedCount: number;
  skippedCount: number;
  generated: Array<{ houseId: number; houseNo: string; billId: number }>;
  skipped: Array<{ houseId: number; houseNo: string; reason: string }>;
};

export type BillPreview = {
  totalAmount: number;
  previousBalance: number;
  grandTotal: number;
  logCount: number;
  existingBillId: number | null;
  lastNote: string | null;
  isAlreadyClosed: boolean;
  alreadyClosedMessage: string | null;
  isDurationAlreadyCreated: boolean;
  durationAlreadyCreatedMessage: string | null;
  adjustedFromDate?: string;
  adjustedToDate?: string;
  skippedToDate?: string | null;
};

export type User = {
  uuid: string;
  username: string;
  email: string;
  role: 'admin' | 'supplier';
  isVerified: boolean;
  createdAt: string;
  permissions?: Record<string, boolean>;
  dairyId?: number;
};

export type HouseStats = {
  totalHouses: number;
  totalPreviousBalance: string;
  totalCurrentBalance: string;
};

export type DashboardStats = {
  totalBills: number;
  billsThisMonth: number;
  totalPendingBalance: string;
};

export type ProductRate = {
  id: number;
  name: string;
  unit: string;
  rate: string;
  isActive: boolean;
  sortOrder?: number;
  createdAt: string;
  updatedAt: string;
};

export type DeliveryLogItem = {
  milkType: string;
  name?: string;
  qty: number;
  rate: number;
  amount: number;
};

export type DeliveryLog = {
  id: number;
  houseId: number;
  dairyId?: number;
  supplierId?: string;
  shift: 'morning' | 'evening' | 'shop';
  billGenerated: boolean;
  isClosed: boolean;
  items: DeliveryLogItem[];
  totalAmount: string;
  openingBalance: string;
  closingBalance: string;
  note?: string;
  deliveredAt: string;
  createdAt: string;
  house?: { id: number; houseNo: string; area?: string };
  supplier?: { uuid: string; username: string };
};

export type DeliveryPlanItem = {
  product: string;
  quantity: number;
};

export type DeliveryPlan = {
  id: number;
  supplier_id: string;
  product_name: string;
  quantity_per_go: number;
  number_of_goes: number;
  total_quantity: number;
  created_at: string;
  updated_at: string;
  unit?: string;
  users?: { uuid: string; username: string };
};

// ─── Houses ───────────────────────────────────────────────────────────────────

export const housesApi = {
  list: async () =>
    apiGet<House[]>('/houses', {
      onData: async (data) => {
        const normalized = normalizeHouseCollection(data as House[]);
        if (isBrowser()) {
          const serverIds = new Set(normalized.map((h) => h.id));
          const activeDairyId = getSessionAuth()?.dairyId ?? getDairyIdFromCookie() ?? null;
          const staleIds = await db.houses
            .where('id')
            .above(0)
            .filter((house) =>
              !serverIds.has(house.id) &&
              (activeDairyId === null || house.dairyId == null || house.dairyId === activeDairyId),
            )
            .primaryKeys();
          await db.transaction('rw', db.houses, async () => {
            if (staleIds.length > 0) await db.houses.bulkDelete(staleIds);
            await db.houses.where('id').below(0).delete();
            await db.houses.bulkPut(normalized);
          });
        }
      },
    }).then((data) => normalizeHouseCollection(data as House[])),
  get: async (id: number) =>
    apiGet<House>(`/houses/${id}`, {
      onData: async (data) => {
        if (isBrowser()) await db.houses.put(normalizeHouseRecord(data as House));
      },
    }).then((data) => normalizeHouseRecord(data as House)),
  stats: () => apiGet<HouseStats>('/houses/stats'),
  create: async (data: Partial<House>) => {
    // Optimistic update: create temporary house with negative ID
    const tempId = -Math.floor(Math.random() * 100000);
    const tempHouse: House = {
      id: tempId,
      houseNo: data.houseNo ?? '',
      area: data.area,
      phoneNo: data.phoneNo ?? '',
      alternativePhone: data.alternativePhone,
      description: data.description,
      rate1Type: data.rate1Type,
      rate1: data.rate1,
      rate2Type: data.rate2Type,
      rate2: data.rate2,
      location: data.location,
      active: true,
      createdAt: new Date().toISOString(),
    };

    // Store optimistically in DB and cache immediately
    if (isBrowser()) {
      await db.houses.put(tempHouse);

      // Update all cached queries to include the temp house
      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return [...cached, tempHouse];
        },
      );
    }

    // Sync in background without blocking UI
    if (isOnline()) {
      // Don't await - let it happen in background
      (async () => {
        try {
          const res = normalizeHouseRecord(await apiPost<House>('/houses', data));
          if (isBrowser()) {
            // Replace temp ID with real ID
            await db.houses.delete(tempId);
            await db.houses.put(res);

            // Update all caches to replace temp with real house
            await updateCachedQueries<House[]>(
              (cacheKey) => cacheKey === 'GET:/houses',
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.map((h) => (h.id === tempId ? res : h));
              },
            );
          }
        } catch (error: unknown) {
          // On error, remove temp house from UI/cache
          if (isBrowser()) {
            await db.houses.delete(tempId);
            await updateCachedQueries<House[]>(
              (cacheKey) => cacheKey === 'GET:/houses',
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.filter((h) => h.id !== tempId);
              },
            );
          }
          const msg = error instanceof Error ? error.message : 'Failed to create house'
          const { toast } = await import('sonner')
          toast.error(msg)
        }
      })();
    } else {
      // Offline: enqueue for later sync
      void syncEngine.enqueue('/houses', 'POST', data);
    }

    // Return temp house immediately (optimistic)
    return tempHouse;
  },
  createSync: async (data: Partial<House>) => {
    const result = normalizeHouseRecord(await apiPost<House>('/houses', data));
    if (isBrowser()) {
      await db.houses.put(result);
      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          const idx = cached.findIndex((h) => h.id === result.id);
          if (idx >= 0) {
            const next = [...cached];
            next[idx] = result;
            return next;
          }
          return [...cached, result];
        },
      );
    }
    return result;
  },
  update: async (id: number, data: Partial<House>) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id);
      const next = existing ? { ...existing, ...data } : ({ id, ...data } as House);

      if (isOnline()) {
        const result = normalizeHouseRecord(await apiPatch<House>(`/houses/${id}`, data));

        await db.houses.put(result);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) {
              return cached.map((item) => (item.id === id ? result : item));
            }

            return (cached as unknown as House)?.id === id ? (result as unknown as House[]) : cached;
          },
        );

        // Invalidate house config session cache when house is updated.
        // This ensures stale cached configs don't persist across page reloads.
        removeHouseConfigSessionCacheByHouseId(id);

        return result;
      } else {
        // Optimistic: update immediately in DB and cache when offline.
        await db.houses.put(next);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) {
              return cached.map((item) => (item.id === id ? next : item));
            }
            return (cached as unknown as House)?.id === id ? (next as unknown as House[]) : cached;
          },
        );

        // Invalidate house config session cache when house is updated.
        // This ensures stale cached configs don't persist across page reloads.
        removeHouseConfigSessionCacheByHouseId(id);

        void syncEngine.enqueue(`/houses/${id}`, 'PATCH', data);
        return next;
      }
    }

    return apiPatch<House>(`/houses/${id}`, data);
  },
  updateLocation: async (id: number, data: { latitude: number; longitude: number }) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id)
      if (existing) {
        const next = {
          ...existing,
          location: `${data.latitude.toFixed(6)},${data.longitude.toFixed(6)}`,
        }

        await db.houses.put(next)

        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) {
              return cached.map((item) => (item.id === id ? next : item));
            }

            return (cached as unknown as House)?.id === id ? (next as unknown as House[]) : cached;
          },
        )
      }

      void syncEngine.enqueue(`/houses/${id}/location`, 'PATCH', data)
      return existing ? { ...existing, location: `${data.latitude.toFixed(6)},${data.longitude.toFixed(6)}` } : null
    }

    return apiPatch<House>(`/houses/${id}/location`, data)
  },
  deactivate: async (id: number) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id);
      if (existing) {
        const next = { ...existing, active: false };
        await db.houses.put(next);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) {
              return cached.map((item) => (item.id === id ? next : item));
            }

            return (cached as unknown as House)?.id === id ? (next as unknown as House[]) : cached;
          },
        );
      }
      void syncEngine.enqueue(`/houses/${id}/deactivate`, 'PATCH', {});
      return existing ? { ...existing, active: false } : null;
    }

    if (isOnline()) {
      return normalizeHouseRecord(await apiPatch<House>(`/houses/${id}/deactivate`, {}));
    }

    return null;
  },
  reactivate: async (id: number) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id);
      if (existing) {
        const next = { ...existing, active: true };
        await db.houses.put(next);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) {
              return cached.map((item) => (item.id === id ? next : item));
            }

            return (cached as unknown as House)?.id === id ? (next as unknown as House[]) : cached;
          },
        );
      }
      void syncEngine.enqueue(`/houses/${id}/reactivate`, 'PATCH', {});
      return existing ? { ...existing, active: true } : null;
    }

    if (isOnline()) {
      return normalizeHouseRecord(await apiPatch<House>(`/houses/${id}/reactivate`, {}));
    }

    return null;
  },
  delete: async (id: number) => {
    if (isBrowser()) {
      await db.transaction('rw', db.houses, db.houseConfigs, db.deliveryLogs, db.bills, async () => {
        await db.houseConfigs.where('houseId').equals(id).delete();
        await db.deliveryLogs.where('houseId').equals(id).delete();
        await db.bills.where('houseId').equals(id).delete();
        await db.houses.delete(id);
      });

      removeHouseConfigSessionCacheByHouseId(id);
      await invalidateCache(`/houses/${id}`);
      void syncEngine.enqueue(`/houses/${id}`, 'DELETE');
      return null;
    }

    if (isOnline()) {
      return apiDelete<House>(`/houses/${id}`);
    }

    return null;
  },
};

// ─── House Config ─────────────────────────────────────────────────────────────

export const houseConfigApi = {
  list: async (supplierId?: string) => {
    const path = `/house-config${supplierId ? `?supplierId=${supplierId}` : ''}`;

    if (!isOnline()) {
      const cached = readHouseConfigSessionCache();
      return supplierId ? cached.filter((item) => item.supplierId === supplierId) : cached;
    }

    const data = await requestGet<HouseConfig[]>(path);
    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      const merged = mergeHouseConfigCaches(cached, data)
      writeHouseConfigSessionCache(merged);
      return supplierId ? merged.filter((item) => item.supplierId === supplierId) : merged;
    }
    return data;
  },
  listForHouse: async (houseId: number) => {
    // Prevent querying for temporary houses (negative IDs)
    if (houseId < 0) {
      const cached = readHouseConfigSessionCache();
      return cached.filter((item) => item.houseId === houseId);
    }

    const path = `/house-config?houseId=${houseId}`;

    if (!isOnline()) {
      const cached = readHouseConfigSessionCache();
      return cached.filter((item) => item.houseId === houseId);
    }

    const data = await requestGet<HouseConfig[]>(path);
    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      const merged = mergeHouseConfigCaches(cached, data)
      writeHouseConfigSessionCache(merged);
      return merged.filter((item) => item.houseId === houseId);
    }
    return data;
  },
  create: async (data: Partial<HouseConfig>) => {
    // Prevent creating configs for temporary houses (negative IDs)
    if (typeof data.houseId === 'number' && data.houseId < 0) {
      // Queue for later when house gets real ID
      const offlineConfig = {
        id: -Math.floor(Math.random() * 100000),
        ...data,
      } as unknown as HouseConfig;
      if (isBrowser()) {
        const cached = readHouseConfigSessionCache();
        writeHouseConfigSessionCache([...cached.filter((item) => item.id !== offlineConfig.id), offlineConfig]);
      }
      return offlineConfig;
    }

    if (isBrowser()) {
      const optimistic = ({
        id: -Math.floor(Math.random() * 100000),
        updatedAt: new Date().toISOString(),
        ...data,
      } as unknown as HouseConfig);
      const cached = readHouseConfigSessionCache();
      writeHouseConfigSessionCache(
        [...cached.filter((item) => item.id !== optimistic.id && item.houseId !== optimistic.houseId), optimistic],
      );

      if (typeof optimistic.houseId === 'number') {
        const existingHouse = await db.houses.get(optimistic.houseId);
        if (existingHouse) {
          await db.houses.put({
            ...existingHouse,
            configs: [optimistic],
          });
        }
      }

      await updateCachedQueries<HouseConfig[]>(
        (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return [...cached.filter((item) => item.id !== optimistic.id && item.houseId !== optimistic.houseId), optimistic];
        },
      );

      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.map((house) =>
            house.id === optimistic.houseId ? { ...house, configs: [optimistic] } : house,
          );
        },
      );

      if (isOnline()) {
        (async () => {
          try {
            const result = await apiPost<HouseConfig>('/house-config', data);

            const nextCached = readHouseConfigSessionCache();
            writeHouseConfigSessionCache(
              nextCached.map((item) => (item.id === optimistic.id ? result : item)),
            );

            if (typeof result.houseId === 'number') {
              const existingHouse = await db.houses.get(result.houseId);
              if (existingHouse) {
                await db.houses.put({
                  ...existingHouse,
                  configs: [result],
                });
              }
            }

            await updateCachedQueries<HouseConfig[]>(
              (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.map((item) => (item.id === optimistic.id ? result : item));
              },
            );

            await updateCachedQueries<House[]>(
              (cacheKey) => cacheKey === 'GET:/houses',
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.map((house) =>
                  house.id === result.houseId ? { ...house, configs: [result] } : house,
                );
              },
            );
          } catch {
            void syncEngine.enqueue('/house-config', 'POST', data);
          }
        })();
      } else {
        void syncEngine.enqueue('/house-config', 'POST', data);
      }

      return optimistic;
    }

    return apiPost<HouseConfig>('/house-config', data);
  },
  update: async (id: number, data: Partial<HouseConfig>) => {
    // Prevent updating configs with negative IDs (temporary)
    if (id < 0 || (typeof data.houseId === 'number' && data.houseId < 0)) {
      if (isBrowser()) {
        const cached = readHouseConfigSessionCache();
        const updated = cached.map((item) => (item.id === id ? { ...item, ...data } : item));
        writeHouseConfigSessionCache(updated);
      }
      return;
    }

    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      const next = cached.map((item) => (item.id === id ? { ...item, ...data, updatedAt: new Date().toISOString() } : item));
      writeHouseConfigSessionCache(next);

      const updated = next.find((item) => item.id === id);
      if (updated && typeof updated.houseId === 'number') {
        const existingHouse = await db.houses.get(updated.houseId);
        if (existingHouse) {
          await db.houses.put({
            ...existingHouse,
            configs: [updated],
          });
        }
      }

      await updateCachedQueries<HouseConfig[]>(
        (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.map((item) => (item.id === id ? ({ ...item, ...data } as HouseConfig) : item));
        },
      );

      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.map((house) =>
            house.id === updated?.houseId ? { ...house, configs: updated ? [updated] : house.configs } : house,
          );
        },
      );

      if (isOnline()) {
        (async () => {
          try {
            const result = await apiPatch<HouseConfig>(`/house-config/${id}`, data);

            writeHouseConfigSessionCache(
              mergeHouseConfigCaches(readHouseConfigSessionCache(), [result]),
            );

            if (typeof result.houseId === 'number') {
              const existingHouse = await db.houses.get(result.houseId);
              if (existingHouse) {
                await db.houses.put({
                  ...existingHouse,
                  configs: [result],
                });
              }
            }

            await updateCachedQueries<HouseConfig[]>(
              (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.map((item) => (item.id === id ? result : item));
              },
            );

            await updateCachedQueries<House[]>(
              (cacheKey) => cacheKey === 'GET:/houses',
              (cached) => {
                if (!Array.isArray(cached)) return cached;
                return cached.map((house) =>
                  house.id === result.houseId ? { ...house, configs: [result] } : house,
                );
              },
            );
          } catch {
            void syncEngine.enqueue(`/house-config/${id}`, 'PATCH', data);
          }
        })();

        return updated ? ({ ...updated, ...data } as HouseConfig) : data;
      }

      void syncEngine.enqueue(`/house-config/${id}`, 'PATCH', data);
      return updated ? ({ ...updated, ...data } as HouseConfig) : data;
    }

    if (isOnline()) {
      return apiPatch<HouseConfig>(`/house-config/${id}`, data);
    }

    return data;
  },
  reorder: async (orderedIds: number[]) => {
    if (isBrowser()) {
      try {
        // Send to server first and wait for response
        if (isOnline()) {
          await apiPatch('/house-config/reorder', { orderedIds });
        } else {
          void syncEngine.enqueue('/house-config/reorder', 'PATCH', { orderedIds });
        }
      } catch (error) {
        throw error;
      }

      // Then clear caches after server confirms the change
      const byId = new Map(orderedIds.map((idValue, index) => [idValue, index]));
      const reorderConfigs = (cached: HouseConfig[]) => {
        if (!Array.isArray(cached)) return cached;

        return [...cached]
          .map((item) => {
            const nextPosition = byId.get(item.id);
            return typeof nextPosition === 'number' ? { ...item, position: nextPosition } : item;
          })
          .sort((left, right) => left.position - right.position);
      };

      await updateCachedQueries<HouseConfig[]>(
        (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
        reorderConfigs,
      );

      clearHouseConfigSessionCache();
      await invalidateCache('/house-config');

      return { orderedIds };
    }

    if (isOnline()) {
      return apiPatch('/house-config/reorder', { orderedIds });
    }

    return { orderedIds };
  },
  delete: async (id: number) => {
    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      const removed = cached.find((item) => item.id === id);
      writeHouseConfigSessionCache(cached.filter((item) => item.id !== id));

      if (removed && typeof removed.houseId === 'number') {
        const existingHouse = await db.houses.get(removed.houseId);
        if (existingHouse) {
          await db.houses.put({
            ...existingHouse,
            configs: [],
          });
        }
      }

      await updateCachedQueries<HouseConfig[]>(
        (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.filter((item) => item.id !== id);
        },
      );

      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.map((house) =>
            house.id === removed?.houseId ? { ...house, configs: [] } : house,
          );
        },
      );

      void syncEngine.enqueue(`/house-config/${id}`, 'DELETE');
      return null;
    }

    if (isOnline()) {
      return apiDelete(`/house-config/${id}`);
    }

    return null;
  },
};

// ─── House Balance ────────────────────────────────────────────────────────────

export const balanceApi = {
  get: (houseId: number) => {
    // Prevent querying balance for temporary houses
    if (houseId < 0) return Promise.resolve({ id: 0, houseId, currentBalance: '0', previousBalance: '0' } as HouseBalance);
    return apiGet<HouseBalance>(`/house-balance/${houseId}`);
  },
  payments: (houseId: number) => {
    // Prevent querying payments for temporary houses
    if (houseId < 0) return Promise.resolve([] as PaymentHistory[]);
    return apiGet<PaymentHistory[]>(`/house-balance/${houseId}/payments`);
  },
  allPayments: () => apiGet<PaymentHistory[]>('/house-balance/payments'),
  updatePrevious: async (houseId: number, previousBalance: number) => {
    // Prevent updating balance for temporary houses
    if (houseId < 0) return null;

    const payload = { previousBalance };

    if (isBrowser()) {
      const existingHouse = await db.houses.get(houseId);
      if (existingHouse) {
        const next = {
          ...existingHouse,
          balance: {
            ...(existingHouse.balance ?? { id: 0, houseId, currentBalance: '0', previousBalance: '0' }),
            houseId,
            previousBalance: String(previousBalance),
          },
        };

        await db.houses.put(next);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${houseId}`,
          (cached) => {
            if (!Array.isArray(cached)) return cached;
            return cached.map((house) => (house.id === houseId ? next : house));
          },
        );

        await updateCachedQueries<HouseBalance>(
          (cacheKey) => cacheKey === `GET:/house-balance/${houseId}`,
          (cached) => ({
            ...(cached ?? { id: 0, houseId, currentBalance: '0', previousBalance: '0' }),
            houseId,
            previousBalance: String(previousBalance),
          }),
        );
      }

      void syncEngine.enqueue(`/house-balance/${houseId}`, 'PATCH', payload);
      return { queued: true };
    }

    if (isOnline()) {
      return apiPatch<HouseBalance>(`/house-balance/${houseId}`, payload);
    }

    return { queued: true };
  },
  updateCurrent: async (houseId: number, currentBalance: number) => {
    // Prevent updating balance for temporary houses
    if (houseId < 0) return null;

    const payload = { currentBalance };

    if (isBrowser()) {
      const existingHouse = await db.houses.get(houseId);
      if (existingHouse) {
        const next = {
          ...existingHouse,
          balance: {
            ...(existingHouse.balance ?? { id: 0, houseId, currentBalance: '0', previousBalance: '0' }),
            houseId,
            currentBalance: String(currentBalance),
          },
        };

        await db.houses.put(next);
        await updateCachedQueries<House[]>(
          (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${houseId}`,
          (cached) => {
            if (!Array.isArray(cached)) return cached;
            return cached.map((house) => (house.id === houseId ? next : house));
          },
        );

        await updateCachedQueries<HouseBalance>(
          (cacheKey) => cacheKey === `GET:/house-balance/${houseId}`,
          (cached) => ({
            ...(cached ?? { id: 0, houseId, currentBalance: '0', previousBalance: '0' }),
            houseId,
            currentBalance: String(currentBalance),
          }),
        );
      }

      void syncEngine.enqueue(`/house-balance/${houseId}/current`, 'PATCH', payload);
      return { queued: true };
    }

    if (isOnline()) {
      return apiPatch<HouseBalance>(`/house-balance/${houseId}/current`, payload);
    }

    return { queued: true };
  },
  record: async (data: { houseId: number; amount: number; note?: string; billIds?: number[]; discount?: number; paidAt?: string; recordedBy?: string; paymentMethod?: string }) => {
    const applyLocalPaymentUpdate = async (payment?: PaymentHistory, balance?: HouseBalance) => {
      if (!isBrowser()) return;

      const totalAmount = data.amount + (data.discount ?? 0);
      const now = new Date().toISOString();
      const existingHouse = await db.houses.get(data.houseId);
      const paymentBase: PaymentHistory = {
        id: payment?.id ?? -Math.floor(Math.random() * 1_000_000_000),
        balanceRef: payment?.balanceRef ?? balance?.id ?? 0,
        amount: String(data.amount),
        note: data.note,
        recordedBy: data.recordedBy,
        paymentMethod: data.paymentMethod ?? 'cash',
        createdAt: payment?.createdAt ?? now,
        paidAt: data.paidAt ?? now,
        balance: payment?.balance ?? (existingHouse ? { house: { id: existingHouse.id, houseNo: existingHouse.houseNo, area: existingHouse.area } } : undefined),
      };

      if (data.billIds?.length) (paymentBase as PaymentHistory & { billIds?: number[] }).billIds = data.billIds;
      if (data.discount) (paymentBase as PaymentHistory & { discount?: number }).discount = data.discount;

      const resolveNextPreviousBalance = (currentPrev: number) => {
        if (balance?.previousBalance !== undefined && balance?.previousBalance !== null) {
          return Number(balance.previousBalance) || 0;
        }
        return Math.round((currentPrev - totalAmount) * 100) / 100;
      };

      if (existingHouse) {
        const currentPrev = Number(existingHouse.balance?.previousBalance ?? 0);
        const nextPrev = resolveNextPreviousBalance(currentPrev);
        await db.houses.put({
          ...existingHouse,
          balance: {
            ...(existingHouse.balance ?? { id: balance?.id ?? 0, houseId: data.houseId, currentBalance: '0', previousBalance: '0' }),
            houseId: data.houseId,
            previousBalance: String(nextPrev),
          },
        });
      }

      await updateCachedQueries<House[] | House>(
        (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${data.houseId}`,
        (cached) => {
          const updateHouse = (house: House) => {
            if (house.id !== data.houseId) return house;
            const currentPrev = Number(house.balance?.previousBalance ?? 0);
            const nextPrev = resolveNextPreviousBalance(currentPrev);
            return {
              ...house,
              balance: {
                ...(house.balance ?? { id: balance?.id ?? 0, houseId: data.houseId, currentBalance: '0', previousBalance: '0' }),
                houseId: data.houseId,
                previousBalance: String(nextPrev),
              },
            };
          };

          if (Array.isArray(cached)) return cached.map(updateHouse);
          if (cached && typeof cached === 'object' && 'id' in cached) return updateHouse(cached as House);
          return cached;
        },
      );

      await updateCachedQueries<HouseBalance>(
        (cacheKey) => cacheKey === `GET:/house-balance/${data.houseId}`,
        (cached) => {
          const currentPrev = Number(cached?.previousBalance ?? 0);
          const nextPrev = resolveNextPreviousBalance(currentPrev);
          const nextPayments = cached?.payments ? [paymentBase, ...cached.payments.filter((p) => p.id !== paymentBase.id)] : [paymentBase];
          return {
            ...(cached ?? { id: balance?.id ?? 0, houseId: data.houseId, currentBalance: '0', previousBalance: '0' }),
            houseId: data.houseId,
            previousBalance: String(nextPrev),
            payments: nextPayments,
          };
        },
      );

      const updatePaymentsList = (cached: PaymentHistory[] | null | undefined): PaymentHistory[] => {
        if (!Array.isArray(cached)) return [];
        return [paymentBase, ...cached.filter((p) => p.id !== paymentBase.id)];
      };

      await updateCachedQueries<PaymentHistory[]>(
        (cacheKey) => cacheKey === `GET:/house-balance/${data.houseId}/payments`,
        (cached) => updatePaymentsList(cached),
      );

      await updateCachedQueries<PaymentHistory[]>(
        (cacheKey) => cacheKey === 'GET:/house-balance/payments',
        (cached) => updatePaymentsList(cached),
      );
    };

    if (isOnline()) {
      const res = await apiPost<{ payment: PaymentHistory; balance: HouseBalance }>('/house-balance/payment', data);
      if (isBrowser()) {
        await applyLocalPaymentUpdate(res.payment, res.balance);
        await invalidateCache('/bills');
      }
      return res;
    }

    if (isBrowser()) {
      await applyLocalPaymentUpdate();
      void syncEngine.enqueue('/house-balance/payment', 'POST', data);
      return { queued: true };
    }

    return { queued: true };
  },
  closePeriod: async (data: { houseId: number; fromDate: string; toDate: string; amount?: number; note?: string }) => {
    if (isOnline()) {
      const res = await apiPost('/house-balance/close-period', data);
      if (isBrowser()) {
        // Invalidate caches that may be affected
        await invalidateCache('/bills');
        await invalidateCache('/delivery-logs');
        await invalidateCache('/house-balance');
      }
      return res;
    }

    if (isBrowser()) {
      void syncEngine.enqueue('/house-balance/close-period', 'POST', data);
    }

    return null;
  },
  updatePayment: async (id: number, data: { note?: string; amount?: number; discount?: number; paidAt?: string; paymentMethod?: string }) => {
    const res = await apiPatch<PaymentHistory>(`/house-balance/payment/${id}`, data);
    if (isBrowser()) {
      await invalidateCache('/house-balance');
      await invalidateCache('/bills');
    }
    return res;
  },
  deletePayment: async (id: number) => {
    const res = await apiDelete(`/house-balance/payment/${id}`);
    if (isBrowser()) {
      await invalidateCache('/house-balance');
      await invalidateCache('/bills');
    }
    return res;
  },
};

// ─── Bills ────────────────────────────────────────────────────────────────────

export const billsApi = {
  list: (params?: { houseId?: number; month?: number; year?: number }) => {
    // Prevent querying bills for temporary houses
    if (params?.houseId && params.houseId < 0) {
      return Promise.resolve([] as Bill[]);
    }
    const q = new URLSearchParams();
    if (params?.houseId) q.set('houseId', String(params.houseId));
    if (params?.month) q.set('month', String(params.month));
    if (params?.year) q.set('year', String(params.year));
    return apiGet<Bill[]>(`/bills${q.toString() ? `?${q}` : ''}`, {
      onData: async (data) => {
        if (isBrowser()) await db.bills.bulkPut(data);
      },
    });
  },
  get: (id: number) =>
    apiGet<Bill>(`/bills/${id}`, {
      onData: async (data) => {
        if (isBrowser()) await db.bills.put(data);
      },
    }),
  dashboardStats: () => apiGet<DashboardStats>('/bills/dashboard-stats'),
  preview: (houseId: number, period: { fromDate: string; toDate: string }) => {
    // Prevent querying bill preview for temporary houses
    if (houseId < 0) {
      return Promise.resolve({
        totalAmount: 0,
        previousBalance: 0,
        grandTotal: 0,
        logCount: 0,
        existingBillId: null,
        lastNote: null,
        isAlreadyClosed: false,
        alreadyClosedMessage: null,
        isDurationAlreadyCreated: false,
        durationAlreadyCreatedMessage: null,
      });
    }
    return apiGet<BillPreview>(
      `/bills/preview?houseId=${houseId}&fromDate=${period.fromDate}&toDate=${period.toDate}`,
    );
  },
  generate: async (data: {
    houseId: number;
    date?: string;
    fromDate: string;
    toDate: string;
    note?: string;
  }) => {
    // Prevent generating bills for temporary houses
    if (data.houseId < 0) {
      return { id: -Math.floor(Math.random() * 100000), ...data, createdAt: new Date().toISOString() } as unknown as Bill;
    }

    const res = await apiPost<Bill>('/bills/generate', data);
    if (isBrowser()) {
      await db.bills.put(res);
      await invalidateCache('/bills');
    }
    return res;
  },
  generateAll: async (data: { date?: string; fromDate: string; toDate: string; note?: string }) => {
    const res = await apiPost<GenerateAllBillsResult>('/bills/generate-all', data);
    if (isBrowser()) {
      await invalidateCache('/bills');
      await invalidateCache('/house-balance');
      await invalidateCache('/houses');
    }
    return res;
  },
  pending: (houseId: number) => {
    // Prevent querying pending bills for temporary houses
    if (houseId < 0) {
      return Promise.resolve([] as Bill[]);
    }
    return apiGet<Bill[]>(`/bills/pending/${houseId}`);
  },
  delete: async (id: number) => {
    if (isOnline()) {
      const res = await apiDelete(`/bills/${id}`);
      if (isBrowser()) {
        await db.bills.delete(id);
        await invalidateCache('/bills');
      }
      return res;
    }

    if (isBrowser()) {
      await db.bills.delete(id);
      await invalidateCache('/bills');
      await syncEngine.enqueue(`/bills/${id}`, 'DELETE');
    }

    return null;
  },
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: async (role?: string, fresh?: boolean) => {
    if (fresh && isBrowser()) {
      const cacheKey = `GET:/users${role ? `?role=${role}` : ''}`;
      await db.queryCache.where('key').equals(cacheKey).delete();
    }
    return apiGet<User[]>(`/users${role ? `?role=${role}` : ''}`, {
      onData: async (data) => {
        if (isBrowser()) await db.users.bulkPut(data);
      },
    });
  },
  create: async (data: { username: string; email?: string; password: string; role?: 'admin' | 'supplier'; isVerified?: boolean }) => {
    if (isBrowser()) {
      await invalidateCache('/users');
    }
    const auth = getSessionAuth();
    const dairyId = auth?.dairyId ?? getDairyIdFromCookie() ?? undefined;
    const user = await apiPost<User>('/auth/register', { ...data, dairyId });
    if (data.isVerified && user?.uuid) {
      await usersApi.verify(user.uuid, true);
    }
    return user;
  },
  verify: async (uuid: string, isVerified: boolean) => {
    if (isBrowser()) {
      await db.users.update(uuid, { isVerified });
      await invalidateCache('/users');
      await syncEngine.enqueue(`/users/${uuid}/verify`, 'PATCH', { isVerified });
    }

    if (isOnline()) {
      return apiPatch(`/users/${uuid}/verify`, { isVerified });
    }

    return { uuid, isVerified };
  },
  changeRole: async (uuid: string, role: 'admin' | 'supplier') => {
    if (isBrowser()) {
      await db.users.update(uuid, { role });
      await invalidateCache('/users');
      await syncEngine.enqueue(`/users/${uuid}/role`, 'PATCH', { role });
    }

    if (isOnline()) {
      return apiPatch(`/users/${uuid}/role`, { role });
    }

    return { uuid, role };
  },
  updatePermissions: async (uuid: string, permissions: Record<string, boolean>) => {
    if (isBrowser()) {
      await db.users.update(uuid, { permissions });
      await invalidateCache('/users');
    }
    return apiPatch(`/users/${uuid}/permissions`, permissions);
  },
  resetPassword: async (uuid: string, password: string) => {
    if (isBrowser()) {
      await invalidateCache('/users');
    }
    return apiPatch(`/users/${uuid}/reset-password`, { password });
  },
  delete: async (uuid: string) => {
    if (isBrowser()) {
      await db.users.delete(uuid);
      await invalidateCache('/users');
    }

    if (isOnline()) {
      return apiDelete(`/users/${uuid}`);
    }

    await syncEngine.enqueue(`/users/${uuid}`, 'DELETE');
    return null;
  },
};

// ─── Dairies ───────────────────────────────────────────────────────────────────

export const dairiesApi = {
  resetPassword: async (id: number, password: string) => {
    return apiPatch(`/dairies/${id}/password`, { password });
  },
  getSettings: () => requestGet<Record<string, unknown>>('/dairies/settings'),
  updateSettings: async (settings: Record<string, unknown>) => {
    const res = await fetchApi('/dairies/settings', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      body: JSON.stringify(settings),
    });
    if (!res.ok) throw new Error('Failed to update settings');
    if (isBrowser()) {
      await invalidateCache('/dairies/settings');
    }
    return res.json();
  },
};

// ─── Product Rates ───────────────────────────────────────────────────────────

export const productRatesApi = {
  list: () => apiGet<ProductRate[]>('/product-rates'),
  create: async (data: { name: string; unit?: string; rate: number; isActive?: boolean }) => {
    const res = await apiPost<ProductRate>('/product-rates', data);
    if (isBrowser()) await invalidateCache('/product-rates');
    return res;
  },
  update: async (
    id: number,
    data: Partial<{ name: string; unit: string; rate: number; isActive: boolean }>,
  ) => {
    const res = await apiPatch<ProductRate>(`/product-rates/${id}`, data);
    if (isBrowser()) await invalidateCache('/product-rates');
    return res;
  },
  reorder: async (ids: number[]) => {
    const res = await apiPost<ProductRate[]>('/product-rates/reorder', { ids });
    if (isBrowser()) await invalidateCache('/product-rates');
    return res;
  },
  delete: async (id: number) => {
    if (isBrowser()) {
      await invalidateCache('/product-rates');
      await syncEngine.enqueue(`/product-rates/${id}`, 'DELETE');
    }

    if (isOnline()) {
      return apiDelete(`/product-rates/${id}`);
    }

    return null;
  },
};

// ─── Delivery Logs (IndexedDB-first) ─────────────────────────────────────────

import {
  getDeliveryLogs as _getDeliveryLogs,
  pullDeliveryLogs as _pullDeliveryLogs,
  forceRefreshDeliveryLogs as _forceRefreshDeliveryLogs,
  createDeliveryLog as _createDeliveryLog,
  updateDeliveryLog as _updateDeliveryLog,
  deleteDeliveryLog as _deleteDeliveryLog,
  processDeliveryQueue,
} from './delivery-storage';

export const deliveryLogsApi = {
   list: (params?: { houseId?: number; dairyId?: number; shift?: 'morning' | 'evening' | 'shop'; fromDate?: string; toDate?: string }, forceFresh = false) => {
    if (params?.houseId && params.houseId < 0) {
      return Promise.resolve([] as DeliveryLog[]);
    }
    if (forceFresh) {
      return _forceRefreshDeliveryLogs(params);
    }
    return _pullDeliveryLogs(params);
  },
  create: async (data: {
    houseId: number;
    shift: 'morning' | 'evening' | 'shop';
    items: DeliveryLogItem[];
    note?: string;
    billGenerated?: boolean;
    deliveredAt?: string;
  }) => {
    const result = await _createDeliveryLog(data);
    return result;
  },
  update: async (
    id: number,
    data: {
      items?: DeliveryLogItem[];
      note?: string;
      billGenerated?: boolean;
    },
  ) => {
    return _updateDeliveryLog(id, data);
  },
  delete: async (id: number) => {
    await _deleteDeliveryLog(id);
    return null;
  },
};

// ─── Delivery Plans ──────────────────────────────────────────────────────────

export const deliveryPlansApi = {
  list: () => apiGet<DeliveryPlan[]>('/delivery-plans'),
  create: async (data: {
    product_name: string;
    quantity_per_go: number;
    number_of_goes: number;
    total_quantity: number;
  }) => {
    const res = await apiPost<DeliveryPlan>('/delivery-plans', data);
    if (isBrowser()) {
      await invalidateCache('/delivery-plans');
    }
    return res;
  },
};

export const geocodeApi = {
  search: async (query: string): Promise<Array<{ lat: number; lon: number }>> => {
    const res = await fetchApi(`/geocode?q=${encodeURIComponent(query)}`, {
      headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    });
    if (!res.ok) throw new Error('Geocoding failed');
    return res.json();
  },
};

// ─── Cash Section (independent: cash_houses / cash_logs / cash_payments) ────

export type CashSupplier = {
  uuid: string;
  username: string;
  email?: string;
};

export type CashHouse = {
  id: number;
  dairyId?: number;
  houseNo: string;
  area?: string;
  phoneNo?: string;
  note?: string;
  supplierId?: string | null;
  supplier?: CashSupplier | null;
  position: number;
  previousBalance: number | string;
  active: boolean;
  createdAt: string;
  updatedAt?: string;
  _count?: { logs: number; payments: number };
  logs?: CashLog[];
  payments?: CashPayment[];
};

export type CashLog = {
  id: number;
  houseId: number;
  dairyId?: number;
  type: string;
  title?: string;
  description?: string;
  amount?: number | string | null;
  balanceChange?: number | string | null;
  balanceAfter?: number | string | null;
  createdBy?: string;
  createdAt: string;
};

export type CashPayment = {
  id: number;
  houseId: number;
  dairyId?: number;
  amount: number | string;
  discount?: number | string;
  note?: string;
  recordedBy?: string;
  paidAt: string;
  createdAt: string;
  house?: { id: number; houseNo: string };
};

export type CashStats = {
  totalHouses: number;
  totalPreviousBalance: number | string;
  totalBalance: number | string;
  totalReceived: number | string;
  totalDiscount: number | string;
};

function cashActiveDairyId(): number | null {
  return getSessionAuth()?.dairyId ?? getDairyIdFromCookie() ?? null;
}

/** Read locally cached cash houses without leaking another signed-in dairy's rows. */
export function queryCashHousesForActiveDairy(): Promise<CashHouse[]> {
  const dairyId = cashActiveDairyId();
  return db.cashHouses.toArray().then((houses) =>
    houses
      .filter((h) => dairyId === null || h.dairyId == null || h.dairyId === dairyId)
      .sort((a, b) => (a.position - b.position) || a.houseNo.localeCompare(b.houseNo)),
  );
}

/** Read locally cached cash logs for one house, newest first. */
export function queryCashLogsForActiveDairy(houseId: number): Promise<CashLog[]> {
  const dairyId = cashActiveDairyId();
  return db.cashLogs
    .where('houseId').equals(houseId).toArray()
    .then((logs) =>
      logs
        .filter((l) => dairyId === null || l.dairyId == null || l.dairyId === dairyId)
        .sort((a, b) => String(b.createdAt ?? '').localeCompare(String(a.createdAt ?? ''))),
    );
}

/** Read locally cached cash payments, newest first (capped at 200 without a house filter). */
export function queryCashPaymentsForActiveDairy(houseId?: number): Promise<CashPayment[]> {
  const dairyId = cashActiveDairyId();
  const query = houseId === undefined
    ? db.cashPayments.toCollection()
    : db.cashPayments.where('houseId').equals(houseId);
  return query.toArray().then((pays) => {
    const rows = pays
      .filter((p) => dairyId === null || p.dairyId == null || p.dairyId === dairyId)
      .sort((a, b) => String(b.paidAt ?? '').localeCompare(String(a.paidAt ?? '')));
    return houseId === undefined ? rows.slice(0, 200) : rows;
  });
}

function cashTempId(): number {
  return -Math.floor(Math.random() * 100000);
}

function cashNowIso(): string {
  return new Date().toISOString();
}

function cashNum(v: unknown): number {
  const n = Number(v ?? 0);
  return Number.isFinite(n) ? n : 0;
}

const SYSTEM_CASH_LOG_TYPES = ['payment', 'payment_update', 'payment_reversed'];

async function patchCashQueryCache<T>(matches: (cacheKey: string) => boolean, update: (data: T) => T): Promise<void> {
  if (!isBrowser()) return;
  await updateCachedQueries<T>(matches, update);
}

function appendCashRow<T extends { id: number }>(row: T, list: T[]): T[] {
  return [...list, row];
}

function removeCashRow<T extends { id: number }>(id: number, list: T[]): T[] {
  return list.filter((item) => item.id !== id);
}

export const cashApi = {
  stats: () => apiGet<CashStats>('/cash/stats'),
  suppliers: () => apiGet<CashSupplier[]>('/cash/suppliers'),
  houses: {
    list: () =>
      apiGet<CashHouse[]>('/cash/houses', {
        onData: async (data) => {
          if (!isBrowser()) return;
          const dairyId = cashActiveDairyId();
          const serverIds = new Set(data.map((h) => h.id));
          const staleIds = await db.cashHouses
            .where('id').above(0)
            .filter((h) => !serverIds.has(h.id) && (dairyId === null || h.dairyId == null || h.dairyId === dairyId))
            .primaryKeys();
          await db.transaction('rw', db.cashHouses, async () => {
            if (staleIds.length > 0) await db.cashHouses.bulkDelete(staleIds);
            await db.cashHouses.where('id').below(0).delete();
            await db.cashHouses.bulkPut(data);
          });
        },
      }),
    get: (id: number) =>
      apiGet<CashHouse>(`/cash/houses/${id}`, {
        onData: async (data) => {
          if (isBrowser()) await db.cashHouses.put(data);
        },
      }),
    create: async (data: Partial<CashHouse>) => {
      const tempHouse: CashHouse = {
        id: cashTempId(),
        dairyId: cashActiveDairyId() ?? undefined,
        houseNo: data.houseNo ?? '',
        area: data.area,
        phoneNo: data.phoneNo,
        note: data.note,
        supplierId: data.supplierId,
        position: data.position ?? 0,
        previousBalance: data.previousBalance ?? 0,
        active: true,
        createdAt: cashNowIso(),
      };
      if (isBrowser()) {
        await db.cashHouses.put(tempHouse);
        await patchCashQueryCache<CashHouse[]>(
          (cacheKey) => cacheKey === 'GET:/cash/houses',
          (cached) => (Array.isArray(cached) ? appendCashRow(tempHouse, cached) : cached),
        );
      }
      if (isOnline()) {
        try {
          const res = await apiPost<CashHouse>('/cash/houses', data);
          if (isBrowser()) {
            await db.cashHouses.delete(tempHouse.id);
            await db.cashHouses.put(res);
            await patchCashQueryCache<CashHouse[]>(
              (cacheKey) => cacheKey === 'GET:/cash/houses',
              (cached) => (Array.isArray(cached) ? [...removeCashRow(tempHouse.id, cached), res] : cached),
            );
            await invalidateCache('/cash');
          }
          return res;
        } catch (error: unknown) {
          if (isBrowser()) {
            await db.cashHouses.delete(tempHouse.id);
            await patchCashQueryCache<CashHouse[]>(
              (cacheKey) => cacheKey === 'GET:/cash/houses',
              (cached) => (Array.isArray(cached) ? removeCashRow(tempHouse.id, cached) : cached),
            );
          }
          throw error;
        }
      }
      if (isBrowser()) await syncEngine.enqueue('/cash/houses', 'POST', data);
      return tempHouse;
    },
    update: async (id: number, data: Partial<CashHouse>) => {
      if (isBrowser()) {
        const existing = await db.cashHouses.get(id);
        const next = existing ? ({ ...existing, ...data } as CashHouse) : ({ id, ...data } as CashHouse);
        if (isOnline()) {
          const res = await apiPatch<CashHouse>(`/cash/houses/${id}`, data);
          await db.cashHouses.put(res);
          await patchCashQueryCache<CashHouse[]>(
            (cacheKey) => cacheKey === 'GET:/cash/houses' || cacheKey === `GET:/cash/houses/${id}`,
            (cached) => {
              if (Array.isArray(cached)) return cached.map((h) => (h.id === id ? res : h));
              return (cached as unknown as CashHouse)?.id === id ? (res as unknown as CashHouse[]) : cached;
            },
          );
          await invalidateCache('/cash');
          return res;
        }
        await db.cashHouses.put(next);
        await patchCashQueryCache<CashHouse[]>(
          (cacheKey) => cacheKey === 'GET:/cash/houses' || cacheKey === `GET:/cash/houses/${id}`,
          (cached) => {
            if (Array.isArray(cached)) return cached.map((h) => (h.id === id ? next : h));
            return (cached as unknown as CashHouse)?.id === id ? (next as unknown as CashHouse[]) : cached;
          },
        );
        await syncEngine.enqueue(`/cash/houses/${id}`, 'PATCH', data);
        return next;
      }
      return apiPatch<CashHouse>(`/cash/houses/${id}`, data);
    },
    reorder: async (ids: number[]) => {
      if (isBrowser() && !isOnline()) {
        await db.transaction('rw', db.cashHouses, async () => {
          for (let index = 0; index < ids.length; index += 1) {
            const house = await db.cashHouses.get(ids[index]!);
            if (house) await db.cashHouses.put({ ...house, position: index });
          }
        });
        await syncEngine.enqueue('/cash/houses/reorder', 'PATCH', { ids });
        return queryCashHousesForActiveDairy();
      }
      const res = await apiPatch<CashHouse[]>('/cash/houses/reorder', { ids });
      if (isBrowser()) {
        await db.cashHouses.bulkPut(res);
        await invalidateCache('/cash');
      }
      return res;
    },
    remove: async (id: number) => {
      if (isBrowser()) {
        await db.transaction('rw', db.cashHouses, db.cashLogs, db.cashPayments, async () => {
          await db.cashLogs.where('houseId').equals(id).delete();
          await db.cashPayments.where('houseId').equals(id).delete();
          await db.cashHouses.delete(id);
        });
        await patchCashQueryCache<CashHouse[]>(
          (cacheKey) => cacheKey === 'GET:/cash/houses' || cacheKey === `GET:/cash/houses/${id}`,
          (cached) => (Array.isArray(cached) ? removeCashRow(id, cached) : cached),
        );
        await invalidateCache('/cash');
      }
      if (isOnline()) return apiDelete(`/cash/houses/${id}`);
      if (isBrowser()) await syncEngine.enqueue(`/cash/houses/${id}`, 'DELETE');
      return null;
    },
  },
  logs: {
    list: (houseId: number) =>
      apiGet<CashLog[]>(`/cash/logs?houseId=${houseId}`, {
        onData: async (data) => {
          if (!isBrowser()) return;
          const dairyId = cashActiveDairyId();
          const serverIds = new Set(data.map((l) => l.id));
          const staleIds = await db.cashLogs
            .where('houseId').equals(houseId)
            .filter((l) => !serverIds.has(l.id) && (dairyId === null || l.dairyId == null || l.dairyId === dairyId))
            .primaryKeys();
          await db.transaction('rw', db.cashLogs, async () => {
            if (staleIds.length > 0) await db.cashLogs.bulkDelete(staleIds);
            await db.cashLogs.where('houseId').equals(houseId).filter((l) => l.id < 0).delete();
            await db.cashLogs.bulkPut(data);
          });
        },
      }),
    create: async (data: { houseId: number; type?: string; title?: string; description?: string; amount?: number; balanceChange?: number }) => {
      const tempLog: CashLog = {
        id: cashTempId(),
        houseId: data.houseId,
        dairyId: cashActiveDairyId() ?? undefined,
        type: data.type ?? 'note',
        title: data.title,
        description: data.description,
        amount: data.amount,
        balanceChange: data.balanceChange,
        createdBy: getSessionAuth()?.username,
        createdAt: cashNowIso(),
      };
      const applyBalanceEffect = async () => {
        if (!data.balanceChange) return;
        const house = await db.cashHouses.get(data.houseId);
        if (house) {
          await db.cashHouses.put({
            ...house,
            previousBalance: String(cashNum(house.previousBalance) + data.balanceChange),
          });
        }
      };
      const reverseBalanceEffect = async () => {
        if (!data.balanceChange) return;
        const house = await db.cashHouses.get(data.houseId);
        if (house) {
          await db.cashHouses.put({
            ...house,
            previousBalance: String(cashNum(house.previousBalance) - data.balanceChange),
          });
        }
      };
      if (isBrowser()) {
        await db.transaction('rw', db.cashLogs, db.cashHouses, async () => {
          await db.cashLogs.put(tempLog);
          await applyBalanceEffect();
        });
        await patchCashQueryCache<CashLog[]>(
          (cacheKey) => cacheKey === `GET:/cash/logs?houseId=${data.houseId}`,
          (cached) => (Array.isArray(cached) ? appendCashRow(tempLog, cached) : cached),
        );
      }
      if (isOnline()) {
        try {
          const res = await apiPost<CashLog>('/cash/logs', data);
          if (isBrowser()) {
            await db.transaction('rw', db.cashLogs, db.cashHouses, async () => {
              await db.cashLogs.delete(tempLog.id);
              await db.cashLogs.put(res);
              // Server applied the same balance effect; re-sync local balance.
              if (data.balanceChange) {
                const house = await db.cashHouses.get(data.houseId);
                if (house) {
                  const serverAfter = res.balanceAfter;
                  await db.cashHouses.put({
                    ...house,
                    previousBalance: serverAfter ?? String(cashNum(house.previousBalance)),
                  });
                }
              }
            });
            await patchCashQueryCache<CashLog[]>(
              (cacheKey) => cacheKey === `GET:/cash/logs?houseId=${data.houseId}`,
              (cached) => (Array.isArray(cached) ? [...removeCashRow(tempLog.id, cached), res] : cached),
            );
            await invalidateCache('/cash');
          }
          return res;
        } catch (error: unknown) {
          if (isBrowser()) {
            await db.transaction('rw', db.cashLogs, db.cashHouses, async () => {
              await db.cashLogs.delete(tempLog.id);
              await reverseBalanceEffect();
            });
            await patchCashQueryCache<CashLog[]>(
              (cacheKey) => cacheKey === `GET:/cash/logs?houseId=${data.houseId}`,
              (cached) => (Array.isArray(cached) ? removeCashRow(tempLog.id, cached) : cached),
            );
          }
          throw error;
        }
      }
      if (isBrowser()) await syncEngine.enqueue('/cash/logs', 'POST', data);
      return tempLog;
    },
    remove: async (id: number) => {
      if (isBrowser()) {
        const existing = await db.cashLogs.get(id);
        const isSystemLog = existing ? SYSTEM_CASH_LOG_TYPES.includes(existing.type) : false;
        if (!isSystemLog) {
          await db.transaction('rw', db.cashLogs, db.cashHouses, async () => {
            await db.cashLogs.delete(id);
            const change = cashNum(existing?.balanceChange);
            if (change !== 0 && existing) {
              const house = await db.cashHouses.get(existing.houseId);
              if (house) {
                await db.cashHouses.put({
                  ...house,
                  previousBalance: String(cashNum(house.previousBalance) - change),
                });
              }
            }
          });
          await patchCashQueryCache<CashLog[]>(
            (cacheKey) => cacheKey.startsWith('GET:/cash/logs'),
            (cached) => (Array.isArray(cached) ? removeCashRow(id, cached) : cached),
          );
        }
        await invalidateCache('/cash');
      }
      if (isOnline()) return apiDelete(`/cash/logs/${id}`);
      if (isBrowser()) {
        const existing = await db.cashLogs.get(id).catch(() => undefined);
        if (!existing || !SYSTEM_CASH_LOG_TYPES.includes(existing.type)) {
          await syncEngine.enqueue(`/cash/logs/${id}`, 'DELETE');
        }
      }
      return null;
    },
  },
  payments: {
    list: (houseId?: number) => {
      const path = houseId ? `/cash/payments?houseId=${houseId}` : '/cash/payments';
      return apiGet<CashPayment[]>(path, {
        onData: async (data) => {
          if (!isBrowser()) return;
          const dairyId = cashActiveDairyId();
          const serverIds = new Set(data.map((p) => p.id));
          const scope = houseId === undefined
            ? db.cashPayments.toCollection()
            : db.cashPayments.where('houseId').equals(houseId);
          const staleIds = await scope
            .filter((p) => !serverIds.has(p.id) && (dairyId === null || p.dairyId == null || p.dairyId === dairyId))
            .primaryKeys();
          await db.transaction('rw', db.cashPayments, async () => {
            if (staleIds.length > 0) await db.cashPayments.bulkDelete(staleIds);
            if (houseId === undefined) {
              await db.cashPayments.filter((p) => p.id < 0).delete();
            } else {
              await db.cashPayments.where('houseId').equals(houseId).filter((p) => p.id < 0).delete();
            }
            await db.cashPayments.bulkPut(data);
          });
        },
      });
    },
    create: async (data: { houseId: number; amount: number; discount?: number; note?: string; paidAt?: string }) => {
      const total = data.amount + (data.discount ?? 0);
      const tempPayment: CashPayment = {
        id: cashTempId(),
        houseId: data.houseId,
        dairyId: cashActiveDairyId() ?? undefined,
        amount: data.amount,
        discount: data.discount ?? 0,
        note: data.note,
        recordedBy: getSessionAuth()?.username,
        paidAt: data.paidAt ?? cashNowIso(),
        createdAt: cashNowIso(),
      };
      if (isBrowser()) {
        await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
          await db.cashPayments.put(tempPayment);
          const house = await db.cashHouses.get(data.houseId);
          if (house) {
            await db.cashHouses.put({
              ...house,
              previousBalance: String(cashNum(house.previousBalance) - total),
            });
          }
        });
        await patchCashQueryCache<CashPayment[]>(
          (cacheKey) => cacheKey === 'GET:/cash/payments' || cacheKey === `GET:/cash/payments?houseId=${data.houseId}`,
          (cached) => (Array.isArray(cached) ? appendCashRow(tempPayment, cached) : cached),
        );
      }
      if (isOnline()) {
        try {
          const res = await apiPost<CashPayment>('/cash/payments', data);
          if (isBrowser()) {
            await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
              await db.cashPayments.delete(tempPayment.id);
              await db.cashPayments.put(res);
            });
            await patchCashQueryCache<CashPayment[]>(
              (cacheKey) => cacheKey === 'GET:/cash/payments' || cacheKey === `GET:/cash/payments?houseId=${data.houseId}`,
              (cached) => (Array.isArray(cached) ? [...removeCashRow(tempPayment.id, cached), res] : cached),
            );
            await invalidateCache('/cash');
          }
          return res;
        } catch (error: unknown) {
          if (isBrowser()) {
            await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
              await db.cashPayments.delete(tempPayment.id);
              const house = await db.cashHouses.get(data.houseId);
              if (house) {
                await db.cashHouses.put({
                  ...house,
                  previousBalance: String(cashNum(house.previousBalance) + total),
                });
              }
            });
            await patchCashQueryCache<CashPayment[]>(
              (cacheKey) => cacheKey === 'GET:/cash/payments' || cacheKey === `GET:/cash/payments?houseId=${data.houseId}`,
              (cached) => (Array.isArray(cached) ? removeCashRow(tempPayment.id, cached) : cached),
            );
          }
          throw error;
        }
      }
      if (isBrowser()) await syncEngine.enqueue('/cash/payments', 'POST', data);
      return tempPayment;
    },
    update: async (id: number, data: Partial<CashPayment>) => {
      if (isBrowser()) {
        const existing = await db.cashPayments.get(id);
        const applyDelta = async (delta: number, houseId: number) => {
          if (delta === 0) return;
          const house = await db.cashHouses.get(houseId);
          if (house) {
            await db.cashHouses.put({
              ...house,
              previousBalance: String(cashNum(house.previousBalance) + delta),
            });
          }
        };
        if (isOnline()) {
          const res = await apiPatch<CashPayment>(`/cash/payments/${id}`, data);
          await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
            await db.cashPayments.put(res);
            if (existing) {
              const oldTotal = cashNum(existing.amount) + cashNum(existing.discount);
              const newTotal = cashNum(res.amount) + cashNum(res.discount);
              await applyDelta(oldTotal - newTotal, existing.houseId);
            }
          });
          await patchCashQueryCache<CashPayment[]>(
            (cacheKey) => cacheKey.startsWith('GET:/cash/payments'),
            (cached) => (Array.isArray(cached) ? cached.map((p) => (p.id === id ? res : p)) : cached),
          );
          await invalidateCache('/cash');
          return res;
        }
        if (existing) {
          const oldTotal = cashNum(existing.amount) + cashNum(existing.discount);
          const next = { ...existing, ...data } as CashPayment;
          const newTotal = cashNum(next.amount) + cashNum(next.discount);
          await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
            await db.cashPayments.put(next);
            await applyDelta(oldTotal - newTotal, existing.houseId);
          });
          await patchCashQueryCache<CashPayment[]>(
            (cacheKey) => cacheKey.startsWith('GET:/cash/payments'),
            (cached) => (Array.isArray(cached) ? cached.map((p) => (p.id === id ? next : p)) : cached),
          );
          await syncEngine.enqueue(`/cash/payments/${id}`, 'PATCH', data);
          return next;
        }
      }
      return apiPatch<CashPayment>(`/cash/payments/${id}`, data);
    },
    remove: async (id: number) => {
      if (isBrowser()) {
        const existing = await db.cashPayments.get(id);
        if (existing) {
          const total = cashNum(existing.amount) + cashNum(existing.discount);
          await db.transaction('rw', db.cashPayments, db.cashHouses, async () => {
            await db.cashPayments.delete(id);
            const house = await db.cashHouses.get(existing.houseId);
            if (house) {
              await db.cashHouses.put({
                ...house,
                previousBalance: String(cashNum(house.previousBalance) + total),
              });
            }
          });
          await patchCashQueryCache<CashPayment[]>(
            (cacheKey) => cacheKey.startsWith('GET:/cash/payments'),
            (cached) => (Array.isArray(cached) ? removeCashRow(id, cached) : cached),
          );
        }
        await invalidateCache('/cash');
      }
      if (isOnline()) return apiDelete(`/cash/payments/${id}`);
      if (isBrowser()) await syncEngine.enqueue(`/cash/payments/${id}`, 'DELETE');
      return null;
    },
  },
};
