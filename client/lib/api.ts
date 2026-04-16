import { getAuthHeader } from './auth';
import { db } from './db';
import { syncEngine } from './sync-engine';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL;

// ─── Generic fetch helpers ────────────────────────────────────────────────────

async function handleResponse<T>(res: Response): Promise<T> {
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = Array.isArray(body.message) ? body.message[0] : body.message ?? 'Unknown error';
    throw new Error(msg);
  }
  return body as T;
}

async function apiGet<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });
  return handleResponse<T>(res);
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
  list: async () => {
    const data = await apiGet<House[]>('/houses');
    if (typeof window !== 'undefined') await db.houses.bulkPut(data);
    return data;
  },
  get: async (id: number) => {
    const data = await apiGet<House>(`/houses/${id}`);
    if (typeof window !== 'undefined') await db.houses.put(data);
    return data;
  },
  stats: () => apiGet<HouseStats>('/houses/stats'),
  create: async (data: Partial<House>) => {
    const res = await apiPost<House>('/houses', data);
    if (typeof window !== 'undefined') await db.houses.put(res);
    return res;
  },
  update: async (id: number, data: Partial<House>) => {
    if (typeof window !== 'undefined') {
       await db.houses.update(id, data);
       await syncEngine.enqueue(`/houses/${id}`, 'PATCH', data);
    }
    return apiPatch<House>(`/houses/${id}`, data).catch(console.error);
  },
  delete: async (id: number) => {
    if (typeof window !== 'undefined') {
       await db.houses.delete(id);
       await syncEngine.enqueue(`/houses/${id}`, 'DELETE');
    }
    return apiDelete<House>(`/houses/${id}`).catch(console.error);
  },
};

// ─── House Config ─────────────────────────────────────────────────────────────

export const houseConfigApi = {
  list: async (supplierId?: string) => {
    const data = await apiGet<HouseConfig[]>(`/house-config${supplierId ? `?supplierId=${supplierId}` : ''}`);
    if (typeof window !== 'undefined') await db.houseConfigs.bulkPut(data);
    return data;
  },
  byHouse: async (houseId: number) => {
    const data = await apiGet<HouseConfig[]>(`/house-config/house/${houseId}`);
    if (typeof window !== 'undefined') await db.houseConfigs.bulkPut(data);
    return data;
  },
  create: async (data: Partial<HouseConfig>) => {
    // Attempt rapid optimistic update if possible, otherwise rely on backend first
    if (navigator.onLine) {
        const res = await apiPost<HouseConfig>('/house-config', data);
        if (typeof window !== 'undefined') await db.houseConfigs.put(res);
        return res;
    } else {
        // purely offline creation stub
        const tempId = -Math.floor(Math.random() * 100000);
        const stub = { id: tempId, ...data } as HouseConfig;
        if (typeof window !== 'undefined') {
            await db.houseConfigs.put(stub);
            await syncEngine.enqueue('/house-config', 'POST', data);
        }
        return stub;
    }
  },
  update: async (id: number, data: Partial<HouseConfig>) => {
    if (typeof window !== 'undefined') {
        const existing = await db.houseConfigs.get(id);
        if (existing) await db.houseConfigs.put({ ...existing, ...data });
        await syncEngine.enqueue(`/house-config/${id}`, 'PATCH', data);
    }
    if (navigator.onLine) return apiPatch<HouseConfig>(`/house-config/${id}`, data).catch(console.error);
    return data;
  },
  reorder: (orderedIds: number[]) => apiPatch('/house-config/reorder', { orderedIds }),
  delete: async (id: number) => {
    if (typeof window !== 'undefined') {
        await db.houseConfigs.delete(id);
        await syncEngine.enqueue(`/house-config/${id}`, 'DELETE');
    }
    if (navigator.onLine) return apiDelete(`/house-config/${id}`).catch(console.error);
    return null;
  },
};

// ─── House Balance ────────────────────────────────────────────────────────────

export const balanceApi = {
  get: (houseId: number) => apiGet<HouseBalance>(`/house-balance/${houseId}`),
  payments: (houseId: number) => apiGet<PaymentHistory[]>(`/house-balance/${houseId}/payments`),
  allPayments: () => apiGet<PaymentHistory[]>('/house-balance/payments'),
  update: (houseId: number, data: { previousBalance?: number; currentBalance?: number }) =>
    apiPatch<HouseBalance>(`/house-balance/${houseId}`, data),
  record: (data: { houseId: number; amount: number; note?: string }) =>
    apiPost('/house-balance/payment', data),
};

// ─── Bills ────────────────────────────────────────────────────────────────────

export const billsApi = {
  list: (params?: { houseId?: number; month?: number; year?: number }) => {
    const q = new URLSearchParams();
    if (params?.houseId) q.set('houseId', String(params.houseId));
    if (params?.month) q.set('month', String(params.month));
    if (params?.year) q.set('year', String(params.year));
    return apiGet<Bill[]>(`/bills${q.toString() ? `?${q}` : ''}`);
  },
  get: (id: number) => apiGet<Bill>(`/bills/${id}`),
  dashboardStats: () => apiGet<DashboardStats>('/bills/dashboard-stats'),
  generate: (data: {
    houseId: number;
    month: number;
    year: number;
    items: BillItem[];
    note?: string;
  }) => apiPost<Bill>('/bills/generate', data),
  delete: (id: number) => apiDelete(`/bills/${id}`),
};

// ─── Users ────────────────────────────────────────────────────────────────────

export const usersApi = {
  list: async (role?: string) => {
    const data = await apiGet<User[]>(`/users${role ? `?role=${role}` : ''}`);
    if (typeof window !== 'undefined') await db.users.bulkPut(data);
    return data;
  },
  verify: (uuid: string, isVerified: boolean) =>
    apiPatch(`/users/${uuid}/verify`, { isVerified }),
  delete: (uuid: string) => apiDelete(`/users/${uuid}`),
};

// ─── Product Rates ───────────────────────────────────────────────────────────

export const productRatesApi = {
  list: () => apiGet<ProductRate[]>('/product-rates'),
  create: (data: { name: string; unit?: string; rate: number; isActive?: boolean }) =>
    apiPost<ProductRate>('/product-rates', data),
  update: (
    id: number,
    data: Partial<{ name: string; unit: string; rate: number; isActive: boolean }>,
  ) => apiPatch<ProductRate>(`/product-rates/${id}`, data),
  delete: (id: number) => apiDelete(`/product-rates/${id}`),
};

// ─── Delivery Logs ───────────────────────────────────────────────────────────

export const deliveryLogsApi = {
  list: (params?: { houseId?: number; shift?: 'morning' | 'evening' }) => {
    const q = new URLSearchParams();
    if (params?.houseId) q.set('houseId', String(params.houseId));
    if (params?.shift) q.set('shift', params.shift);
    return apiGet<DeliveryLog[]>(`/delivery-logs${q.toString() ? `?${q}` : ''}`);
  },
  create: (data: {
    houseId: number;
    shift: 'morning' | 'evening';
    items: DeliveryLogItem[];
    currentBalance?: number;
    note?: string;
  }) => apiPost<{ log: DeliveryLog; balance: HouseBalance }>('/delivery-logs', data),
  update: (
    id: number,
    data: {
      items?: DeliveryLogItem[];
      currentBalance?: number;
      note?: string;
    },
  ) => apiPatch<DeliveryLog>(`/delivery-logs/${id}`, data),
  delete: (id: number) => apiDelete(`/delivery-logs/${id}`),
};
