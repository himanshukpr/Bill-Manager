import { getAuthHeader } from './auth';
import { db } from './db';
import { syncEngine } from './sync-engine';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';
const DEFAULT_CACHE_FRESH_MS = 20_000;
const revalidationLocks = new Map<string, Promise<void>>();

const CACHE_INVALIDATION: Record<string, string[]> = {
  houses: ['/houses', '/house-config', '/house-balance', '/bills', '/delivery-logs'],
  'house-config': ['/house-config', '/houses'],
  'house-balance': ['/house-balance', '/houses', '/bills'],
  bills: ['/bills', '/house-balance', '/houses'],
  users: ['/users', '/house-config'],
  'product-rates': ['/product-rates', '/delivery-logs', '/bills'],
  'delivery-logs': ['/delivery-logs', '/house-balance', '/bills', '/houses'],
};

function isBrowser() {
  return typeof window !== 'undefined';
}

function isOnline() {
  return isBrowser() && navigator.onLine;
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

async function invalidateCache(path: string): Promise<void> {
  if (!isBrowser()) return;

  const resource = getResource(path);
  const prefixes = CACHE_INVALIDATION[resource] ?? [`/${resource}`];
  await Promise.all(
    prefixes.map((prefix) => db.queryCache.where('key').startsWith(`GET:${prefix}`).delete()),
  );
}

// ─── Generic fetch helpers ────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message[0] : body.message ?? 'Unknown error';
    throw new Error(msg);
  }
  return body as T;
}

async function requestGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
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
      await writeCache(cacheKey, latest);
      if (onData) await onData(latest);
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

  const cacheKey = options?.cacheKey ?? `GET:${path}`;
  const freshMs = options?.freshMs ?? DEFAULT_CACHE_FRESH_MS;

  const cached = await readCache<T>(cacheKey);
  if (cached !== null) {
    const entry = await db.queryCache.get(cacheKey);
    if (options?.onData) await options.onData(cached);

    if ((Date.now() - (entry?.updatedAt ?? 0) > freshMs) && isOnline()) {
      void revalidateGet(path, cacheKey, options?.onData);
    }

    return cached;
  }

  const latest = await requestGet<T>(path);
  await writeCache(cacheKey, latest);
  if (options?.onData) await options.onData(latest);
  return latest;
}

async function apiPost<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function apiPatch<T>(path: string, body: unknown): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
    body: JSON.stringify(body),
  });
  return handleResponse<T>(res);
}

async function apiDelete<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
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
  milkType: 'buffalo' | 'cow';
  qty: number;
  rate: number;
  amount: number;
};

export type DeliveryLog = {
  id: number;
  houseId: number;
  supplierId: string;
  shift: 'morning' | 'evening';
  items: DeliveryLogItem[];
  totalAmount: string;
  openingBalance: string;
  closingBalance: string;
  note?: string;
  deliveredAt: string;
  house?: { id: number; houseNo: string; area?: string };
  supplier?: { uuid: string; username: string };
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
       if (existing) await db.houses.put({ ...existing, ...data });
       await invalidateCache('/houses');
       await syncEngine.enqueue(`/houses/${id}`, 'PATCH', data);
    }
    return apiPatch<House>(`/houses/${id}`, data).catch(console.error);
  },
  updateLocation: async (id: number, data: { latitude: number; longitude: number }) => {
    if (isBrowser()) {
      const existing = await db.houses.get(id)
      if (existing) {
        await db.houses.put({
          ...existing,
          location: `${data.latitude.toFixed(6)},${data.longitude.toFixed(6)}`,
        })
      }
      await invalidateCache('/houses')
      await syncEngine.enqueue(`/houses/${id}/location`, 'PATCH', data)
    }

    return apiPatch<House>(`/houses/${id}/location`, data)
  },
  delete: async (id: number) => {
    if (isBrowser()) {
       await db.houses.delete(id);
       await invalidateCache('/houses');
       await syncEngine.enqueue(`/houses/${id}`, 'DELETE');
    }
    return apiDelete<House>(`/houses/${id}`).catch(console.error);
  },
};

// ─── House Config ─────────────────────────────────────────────────────────────

export const houseConfigApi = {
  list: async (supplierId?: string) =>
    apiGet<HouseConfig[]>(`/house-config${supplierId ? `?supplierId=${supplierId}` : ''}`, {
      onData: async (data) => {
        if (isBrowser()) await db.houseConfigs.bulkPut(data);
      },
    }),
  byHouse: async (houseId: number) =>
    apiGet<HouseConfig[]>(`/house-config/house/${houseId}`, {
      onData: async (data) => {
        if (isBrowser()) await db.houseConfigs.bulkPut(data);
      },
    }),
  create: async (data: Partial<HouseConfig>) => {
    // Attempt rapid optimistic update if possible, otherwise rely on backend first
    if (isOnline()) {
        const res = await apiPost<HouseConfig>('/house-config', data);
        if (isBrowser()) {
          await db.houseConfigs.put(res);
          await invalidateCache('/house-config');
        }
        return res;
    } else {
        // purely offline creation stub
        const tempId = -Math.floor(Math.random() * 100000);
        const stub = { id: tempId, ...data } as HouseConfig;
        if (isBrowser()) {
            await db.houseConfigs.put(stub);
            await invalidateCache('/house-config');
            await syncEngine.enqueue('/house-config', 'POST', data);
        }
        return stub;
    }
  },
  update: async (id: number, data: Partial<HouseConfig>) => {
    if (isBrowser()) {
        const existing = await db.houseConfigs.get(id);
        if (existing) await db.houseConfigs.put({ ...existing, ...data });
        await invalidateCache('/house-config');
        await syncEngine.enqueue(`/house-config/${id}`, 'PATCH', data);
    }
    if (isOnline()) return apiPatch<HouseConfig>(`/house-config/${id}`, data).catch(console.error);
    return data;
  },
  reorder: async (orderedIds: number[]) => {
    if (isBrowser()) {
      await invalidateCache('/house-config');
      await syncEngine.enqueue('/house-config/reorder', 'PATCH', { orderedIds });
    }

    if (isOnline()) {
      return apiPatch('/house-config/reorder', { orderedIds }).catch(console.error);
    }

    return { orderedIds };
  },
  delete: async (id: number) => {
    if (isBrowser()) {
        await db.houseConfigs.delete(id);
        await invalidateCache('/house-config');
        await syncEngine.enqueue(`/house-config/${id}`, 'DELETE');
    }
    if (isOnline()) return apiDelete(`/house-config/${id}`).catch(console.error);
    return null;
  },
};

// ─── House Balance ────────────────────────────────────────────────────────────

export const balanceApi = {
  get: (houseId: number) => apiGet<HouseBalance>(`/house-balance/${houseId}`),
  payments: (houseId: number) => apiGet<PaymentHistory[]>(`/house-balance/${houseId}/payments`),
  allPayments: () => apiGet<PaymentHistory[]>('/house-balance/payments'),
  record: async (data: { houseId: number; amount: number; note?: string }) => {
    if (isBrowser()) {
      await invalidateCache('/house-balance');
      await syncEngine.enqueue('/house-balance/payment', 'POST', data);
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
  preview: (houseId: number, date: string) => 
    apiGet<{ totalAmount: number; previousBalance: number; grandTotal: number; logCount: number; existingBillId: number | null }>(`/bills/preview?houseId=${houseId}&date=${date}`),
  generate: async (data: {
    houseId: number;
    date: string;
    note?: string;
  }) => {
    const res = await apiPost<Bill>('/bills/generate', data);
    if (isBrowser()) {
      await db.bills.put(res);
      await invalidateCache('/bills');
    }
    return res;
  },
  delete: async (id: number) => {
    if (isBrowser()) {
      await db.bills.delete(id);
      await invalidateCache('/bills');
      await syncEngine.enqueue(`/bills/${id}`, 'DELETE');
    }

    if (isOnline()) {
      return apiDelete(`/bills/${id}`).catch(console.error);
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
      return apiDelete(`/users/${uuid}`).catch(console.error);
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
      return apiDelete(`/product-rates/${id}`).catch(console.error);
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
