import { getAuthHeader } from './auth';
import { db } from './db';
import { syncEngine } from './sync-engine';
import { fetchApi } from './api-base';
import {
  readHouseConfigSessionCache,
  writeHouseConfigSessionCache,
  clearHouseConfigSessionCache,
} from './house-config-cache';
import { DEFAULT_CACHE_FRESH_MS, GLOBAL_SYNC_INTERVAL_MS } from '@/lib/timing';

const LOCAL_STORAGE_PRESERVE_KEYS = new Set(['bill-manager-auth', 'theme', 'next-theme']);
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

async function ensureClientSessionStoragePolicy(): Promise<void> {
  if (!isBrowser()) return;
  if (clientSessionInit) {
    await clientSessionInit;
    return;
  }

  clientSessionInit = (async () => {
    const markerKey = 'bill-manager-session-started';
    let hasMarker = false;

    try {
      hasMarker = window.sessionStorage.getItem(markerKey) === '1';
    } catch {
      hasMarker = false;
    }

    if (!hasMarker) {
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
        // Keep the Dexie connection open and clear data in-place to avoid
        // transient DatabaseClosedError for active live queries.
        await Promise.all([
          db.houses.clear(),
          db.houseConfigs.clear(),
          db.deliveryLogs.clear(),
          db.bills.clear(),
          db.users.clear(),
          db.syncQueue.clear(),
          db.queryCache.clear(),
        ]);
      } catch {
        // Ignore IndexedDB cleanup failures.
      }

      try {
        window.sessionStorage.setItem(markerKey, '1');
      } catch {
        // Ignore storage marker failures.
      }
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

  await db.queryCache.put({
    key: cacheKey,
    payload: JSON.stringify(data),
    updatedAt: Date.now(),
  });
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

async function invalidateCache(path: string): Promise<void> {
  if (!isBrowser()) return;

  const resource = getResource(path);
  const prefixes = CACHE_INVALIDATION[resource] ?? [`/${resource}`];
  await Promise.all(
    prefixes.map((prefix) => db.queryCache.where('key').startsWith(`GET:${prefix}`).delete()),
  );
}

async function updateCachedQueries<T>(
  matches: (cacheKey: string) => boolean,
  update: (data: T) => T | null,
): Promise<void> {
  if (!isBrowser()) return;

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
  balance?: HouseBalance;
  configs?: HouseConfig[];
  bills?: Bill[];
};

export type HouseConfig = {
  id: number;
  houseId: number;
  shift: 'morning' | 'evening';
  supplierId?: string;
  position: number;
  dailyAlerts?: string;
  house?: House;
  supplier?: { uuid: string; username: string };
};

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
  note?: string;
  createdAt: string;
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
  totalAmount: string;
  items: BillItem[];
  previousBalance: string;
  generatedDate: string;
  note?: string;
  house?: { id: number; houseNo: string; area?: string; phoneNo?: string };
};

export type GenerateAllBillsResult = {
  date: string;
  totalHouses: number;
  generatedCount: number;
  skippedCount: number;
  generated: Array<{ houseId: number; houseNo: string; billId: number }>;
  skipped: Array<{ houseId: number; houseNo: string; reason: string }>;
};

export type User = {
  uuid: string;
  username: string;
  email: string;
  role: 'admin' | 'supplier';
  isVerified: boolean;
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
};

export type DeliveryLogItem = {
  milkType: string;
  qty: number;
  rate: number;
  amount: number;
};

export type DeliveryLog = {
  id: number;
  houseId: number;
  supplierId: string;
  shift: 'morning' | 'evening';
  billGenerated: boolean;
  items: DeliveryLogItem[];
  totalAmount: string;
  openingBalance: string;
  closingBalance: string;
  note?: string;
  deliveredAt: string;
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
        if (isBrowser()) await db.houses.bulkPut(data);
      },
    }),
  get: async (id: number) =>
    apiGet<House>(`/houses/${id}`, {
      onData: async (data) => {
        if (isBrowser()) await db.houses.put(data);
      },
    }),
  stats: () => apiGet<HouseStats>('/houses/stats'),
  create: async (data: Partial<House>) => {
    const res = await apiPost<House>('/houses', data);
    if (isBrowser()) {
      await db.houses.put(res);
      await invalidateCache('/houses');
    }
    return res;
  },
  update: async (id: number, data: Partial<House>) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id);
      const next = existing ? { ...existing, ...data } : ({ id, ...data } as House);
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

      void syncEngine.enqueue(`/houses/${id}`, 'PATCH', data);
      return next;
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
      return apiPatch<House>(`/houses/${id}/deactivate`, {});
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
      return apiPatch<House>(`/houses/${id}/reactivate`, {});
    }

    return null;
  },
  delete: async (id: number) => {
    if (isBrowser()) {
      await db.houses.delete(id);
      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses' || cacheKey === `GET:/houses/${id}`,
        (cached) => {
          if (Array.isArray(cached)) {
            return cached.filter((item) => item.id !== id);
          }

          return null;
        },
      );
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
    if (isBrowser()) writeHouseConfigSessionCache(data);
    return data;
  },
  create: async (data: Partial<HouseConfig>) => {
    const tempId = -Math.floor(Math.random() * 100000);
    const stub = { id: tempId, ...data } as unknown as HouseConfig;
    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      writeHouseConfigSessionCache(
        [...cached.filter((item) => item.id !== stub.id && item.houseId !== stub.houseId), stub],
      );

      if (typeof stub.houseId === 'number') {
        const existingHouse = await db.houses.get(stub.houseId);
        if (existingHouse) {
          await db.houses.put({
            ...existingHouse,
            configs: [stub],
          });
        }
      }

      await updateCachedQueries<HouseConfig[]>(
        (cacheKey) => cacheKey === 'GET:/house-config' || cacheKey.startsWith('GET:/house-config?'),
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return [...cached.filter((item) => item.id !== stub.id && item.houseId !== stub.houseId), stub];
        },
      );

      await updateCachedQueries<House[]>(
        (cacheKey) => cacheKey === 'GET:/houses',
        (cached) => {
          if (!Array.isArray(cached)) return cached;
          return cached.map((house) =>
            house.id === stub.houseId ? { ...house, configs: [stub] } : house,
          );
        },
      );

      void syncEngine.enqueue('/house-config', 'POST', data);
    }
    return stub;
  },
  update: async (id: number, data: Partial<HouseConfig>) => {
    if (isBrowser()) {
      const cached = readHouseConfigSessionCache();
      const next = cached.map((item) => (item.id === id ? { ...item, ...data } : item));
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
  get: (houseId: number) => apiGet<HouseBalance>(`/house-balance/${houseId}`),
  payments: (houseId: number) => apiGet<PaymentHistory[]>(`/house-balance/${houseId}/payments`),
  allPayments: () => apiGet<PaymentHistory[]>('/house-balance/payments'),
  updatePrevious: async (houseId: number, previousBalance: number) => {
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
  record: async (data: { houseId: number; amount: number; note?: string }) => {
    if (isBrowser()) {
      void syncEngine.enqueue('/house-balance/payment', 'POST', data);
      return { queued: true };
    }

    if (isOnline()) {
      return apiPost('/house-balance/payment', data);
    }

    return { queued: true };
  },
};

// ─── Bills ────────────────────────────────────────────────────────────────────

export const billsApi = {
  list: (params?: { houseId?: number; month?: number; year?: number }) => {
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
    preview: (houseId: number, period: { fromDate: string; toDate: string }) =>
      apiGet<{ totalAmount: number; previousBalance: number; grandTotal: number; logCount: number; existingBillId: number | null }>(
        `/bills/preview?houseId=${houseId}&fromDate=${period.fromDate}&toDate=${period.toDate}`,
      ),
  generate: async (data: {
    houseId: number;
      fromDate: string;
      toDate: string;
    note?: string;
  }) => {
    const res = await apiPost<Bill>('/bills/generate', data);
    if (isBrowser()) {
      await db.bills.put(res);
      await invalidateCache('/bills');
    }
    return res;
  },
  generateAll: async (data: { fromDate: string; toDate: string; note?: string }) => {
    const res = await apiPost<GenerateAllBillsResult>('/bills/generate-all', data);
    if (isBrowser()) {
      await invalidateCache('/bills');
      await invalidateCache('/house-balance');
      await invalidateCache('/houses');
    }
    return res;
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
  list: async (role?: string) =>
    apiGet<User[]>(`/users${role ? `?role=${role}` : ''}`, {
      onData: async (data) => {
        if (isBrowser()) await db.users.bulkPut(data);
      },
    }),
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
  delete: async (uuid: string) => {
    if (isBrowser()) {
      await db.users.delete(uuid);
      await invalidateCache('/users');
      await syncEngine.enqueue(`/users/${uuid}`, 'DELETE');
    }

    if (isOnline()) {
      return apiDelete(`/users/${uuid}`);
    }

    return null;
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

// ─── Delivery Logs ───────────────────────────────────────────────────────────

export const deliveryLogsApi = {
  list: (params?: { houseId?: number; shift?: 'morning' | 'evening' }) => {
    const q = new URLSearchParams();
    if (params?.houseId) q.set('houseId', String(params.houseId));
    if (params?.shift) q.set('shift', params.shift);
    return apiGet<DeliveryLog[]>(`/delivery-logs${q.toString() ? `?${q}` : ''}`, {
      onData: async (data) => {
        if (isBrowser()) await db.deliveryLogs.bulkPut(data);
      },
    });
  },
  create: async (data: {
    houseId: number;
    shift: 'morning' | 'evening';
    items: DeliveryLogItem[];
    note?: string;
    billGenerated?: boolean;
  }) => {
    const res = await apiPost<{ log: DeliveryLog; balance: HouseBalance }>('/delivery-logs', data);
    if (isBrowser()) {
      await db.deliveryLogs.put(res.log);
      await invalidateCache('/delivery-logs');
    }
    return res;
  },
  update: async (
    id: number,
    data: {
      items?: DeliveryLogItem[];
      note?: string;
      billGenerated?: boolean;
    },
  ) => {
    if (isOnline()) {
      const res = await apiPatch<DeliveryLog>(`/delivery-logs/${id}`, data);
      if (isBrowser()) {
        await db.deliveryLogs.put(res);
        await invalidateCache('/delivery-logs');
      }
      return res;
    }

    if (isBrowser()) {
      const existing = await db.deliveryLogs.get(id);
      if (existing) await db.deliveryLogs.put({ ...existing, ...data });
      await invalidateCache('/delivery-logs');
      await syncEngine.enqueue(`/delivery-logs/${id}`, 'PATCH', data);
    }

    return { id, ...(data as Record<string, unknown>) } as unknown as DeliveryLog;
  },
  delete: async (id: number) => {
    if (isOnline()) {
      const res = await apiDelete(`/delivery-logs/${id}`);
      if (isBrowser()) {
        await db.deliveryLogs.delete(id);
        await invalidateCache('/delivery-logs');
      }
      return res;
    }

    if (isBrowser()) {
      await db.deliveryLogs.delete(id);
      await invalidateCache('/delivery-logs');
      await syncEngine.enqueue(`/delivery-logs/${id}`, 'DELETE');
    }

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
