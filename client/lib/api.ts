import { getAuthHeader } from './auth';

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

// ─── Houses ───────────────────────────────────────────────────────────────────

export const housesApi = {
  list: () => apiGet<House[]>('/houses'),
  get: (id: number) => apiGet<House>(`/houses/${id}`),
  stats: () => apiGet<HouseStats>('/houses/stats'),
  create: (data: Partial<House>) => apiPost<House>('/houses', data),
  update: (id: number, data: Partial<House>) => apiPatch<House>(`/houses/${id}`, data),
  delete: (id: number) => apiDelete<House>(`/houses/${id}`),
};

// ─── House Config ─────────────────────────────────────────────────────────────

export const houseConfigApi = {
  list: (supplierId?: string) =>
    apiGet<HouseConfig[]>(`/house-config${supplierId ? `?supplierId=${supplierId}` : ''}`),
  byHouse: (houseId: number) => apiGet<HouseConfig[]>(`/house-config/house/${houseId}`),
  create: (data: Partial<HouseConfig>) => apiPost<HouseConfig>('/house-config', data),
  update: (id: number, data: Partial<HouseConfig>) =>
    apiPatch<HouseConfig>(`/house-config/${id}`, data),
  reorder: (orderedIds: number[]) => apiPatch('/house-config/reorder', { orderedIds }),
  delete: (id: number) => apiDelete(`/house-config/${id}`),
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
  list: (role?: string) => apiGet<User[]>(`/users${role ? `?role=${role}` : ''}`),
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
