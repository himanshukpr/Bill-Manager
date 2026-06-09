import { db, type DeliveryQueueEntry } from './db';
import { getAuthHeader } from './auth';
import { fetchApi } from './api-base';
import { invalidateCache } from './api';
import { SYNC_DEBOUNCE_MS } from '@/lib/timing';
import type { DeliveryLog, DeliveryLogItem, HouseBalance } from './api';

function isBrowser() {
  return typeof window !== 'undefined';
}

function isOnline() {
  return isBrowser() && navigator.onLine;
}

function tempId() {
  return -Math.floor(Math.random() * 1_000_000_000);
}

// ─── Stale-while-revalidate cache ─────────────────────────────────────────────
// Returns IDB data instantly if fresh enough, fetches server in background.

const STALE_MS = 30_000; // 30 seconds
const lastSyncAt = new Map<string, number>();

function cacheKey(params?: { houseId?: number; shift?: string; fromDate?: string; toDate?: string }): string {
  return `${params?.houseId ?? ''}:${params?.shift ?? ''}:${params?.fromDate ?? ''}:${params?.toDate ?? ''}`;
}

function isFresh(params?: { houseId?: number; shift?: string; fromDate?: string; toDate?: string }): boolean {
  const key = cacheKey(params);
  const ts = lastSyncAt.get(key);
  return ts !== undefined && Date.now() - ts < STALE_MS;
}

function markSynced(params?: { houseId?: number; shift?: string; fromDate?: string; toDate?: string }): void {
  lastSyncAt.set(cacheKey(params), Date.now());
}

function invalidateSyncCache(): void {
  lastSyncAt.clear();
}

// ─── Read from IndexedDB ──────────────────────────────────────────────────────

export async function getDeliveryLogs(params?: {
  houseId?: number;
  shift?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<DeliveryLog[]> {
  let logs: DeliveryLog[];

  if (params?.houseId) {
    logs = await db.deliveryLogs.where('houseId').equals(params.houseId).toArray();
  } else if (params?.shift) {
    logs = await db.deliveryLogs.where('shift').equals(params.shift).toArray();
  } else {
    logs = await db.deliveryLogs.toArray();
  }

  if (params?.fromDate) {
    logs = logs.filter((l) => l.deliveredAt >= params.fromDate!);
  }
  if (params?.toDate) {
    logs = logs.filter((l) => l.deliveredAt <= params.toDate!);
  }

  return logs;
}

// ─── Pull from server into IndexedDB ──────────────────────────────────────────

async function fetchAndMerge(params?: {
  houseId?: number;
  shift?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<void> {
  if (!isOnline()) return;

  const q = new URLSearchParams();
  if (params?.houseId) q.set('houseId', String(params.houseId));
  if (params?.shift) q.set('shift', params.shift);
  if (params?.fromDate) q.set('fromDate', params.fromDate);
  if (params?.toDate) q.set('toDate', params.toDate);

  const path = `/delivery-logs${q.toString() ? `?${q}` : ''}`;
  const res = await fetchApi(path, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });

  if (!res.ok) return;

  const serverLogs: DeliveryLog[] = await res.json();
  await mergeServerLogsIntoIDB(serverLogs, params);
  markSynced(params);
}

export async function pullDeliveryLogs(params?: {
  houseId?: number;
  shift?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<DeliveryLog[]> {
  const idbData = await getDeliveryLogs(params);

  // If IDB has data and it's fresh, return instantly — no server call
  if (idbData.length > 0 && isFresh(params)) {
    return idbData;
  }

  // If IDB has data but is stale, return IDB data now, refresh in background
  if (idbData.length > 0 && isOnline()) {
    void fetchAndMerge(params);
    return idbData;
  }

  // If IDB is empty or offline, do a blocking fetch
  if (!isOnline()) return idbData;

  await fetchAndMerge(params);
  return getDeliveryLogs(params);
}

// Force fresh data - clear IDB and fetch from server
export async function forceRefreshDeliveryLogs(params?: {
  houseId?: number;
  shift?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<DeliveryLog[]> {
  // Clear IDB for the specific query scope
  if (params?.houseId) {
    await db.deliveryLogs.where('houseId').equals(params.houseId).delete();
  } else if (params?.shift) {
    await db.deliveryLogs.where('shift').equals(params.shift).delete();
  } else {
    await db.deliveryLogs.clear();
  }
  
  // Fetch fresh from server
  if (!isOnline()) return [];
  
  const q = new URLSearchParams();
  if (params?.houseId) q.set('houseId', String(params.houseId));
  if (params?.shift) q.set('shift', params.shift);
  if (params?.fromDate) q.set('fromDate', params.fromDate);
  if (params?.toDate) q.set('toDate', params.toDate);

  const path = `/delivery-logs${q.toString() ? `?${q}` : ''}`;
  const res = await fetchApi(path, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });

  if (!res.ok) return [];

  const serverLogs: DeliveryLog[] = await res.json();
  await db.deliveryLogs.bulkPut(serverLogs);
  markSynced(params);
  return serverLogs;
}

async function mergeServerLogsIntoIDB(
  serverLogs: DeliveryLog[],
  params?: { houseId?: number; shift?: string; fromDate?: string; toDate?: string },
): Promise<void> {
  const serverIds = new Set(serverLogs.map((l) => l.id));

  // Put server logs into IDB (creates or updates)
  if (serverLogs.length > 0) {
    await db.deliveryLogs.bulkPut(serverLogs);
  }

  // Collect all pending queue tempIds so we don't delete logs still being synced
  const pendingTempIds = new Set(
    (await db.deliveryQueue.where('status').equals('pending').toArray())
      .map((e) => e.tempId)
      .filter((id): id is number => typeof id === 'number'),
  );

  // Delete ALL IDB logs that are NOT in the server response but match the query scope.
  // These are stale — they were deleted from the server by another user or action.
  // Keep logs outside the query scope (different houseId/shift) and logs with pending queue entries.
  let candidates = db.deliveryLogs.toCollection();

  if (params?.houseId) {
    candidates = db.deliveryLogs.where('houseId').equals(params.houseId) as any;
  } else if (params?.shift) {
    candidates = db.deliveryLogs.where('shift').equals(params.shift) as any;
  }

  const idbLogs = await candidates.toArray();
  const staleIds: number[] = [];

  for (const log of idbLogs) {
    if (serverIds.has(log.id)) continue; // server still has it
    if (log.id < 0 && pendingTempIds.has(log.id)) continue; // tempLog being synced
    staleIds.push(log.id);
  }

  if (staleIds.length > 0) {
    await db.deliveryLogs.bulkDelete(staleIds);
  }
}

// ─── Create ───────────────────────────────────────────────────────────────────

export async function createDeliveryLog(data: {
  houseId: number;
  shift: 'morning' | 'evening' | 'shop';
  items: DeliveryLogItem[];
  note?: string;
  billGenerated?: boolean;
  deliveredAt?: string;
}): Promise<{ log: DeliveryLog; balance: HouseBalance | null }> {
  const now = new Date().toISOString();
  const totalAmount = data.items.reduce((sum, item) => sum + item.amount, 0);

  const tId = tempId();
  const tempLog: DeliveryLog = {
    id: tId,
    houseId: data.houseId,
    shift: data.shift,
    items: data.items,
    totalAmount: String(totalAmount),
    openingBalance: '0',
    closingBalance: '0',
    billGenerated: false,
    isClosed: false,
    note: data.note,
    deliveredAt: data.deliveredAt || now,
    createdAt: now,
  };

  await db.deliveryLogs.put(tempLog);

  if (isOnline()) {
    try {
      const res = await fetchApi('/delivery-logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const body = await res.json();
        const realLog: DeliveryLog = body.log;
        const balance: HouseBalance = body.balance;

        await db.deliveryLogs.delete(tId);
        await db.deliveryLogs.put(realLog);

        await invalidateCache('/delivery-logs');
        invalidateSyncCache();
        return { log: realLog, balance };
      }
    } catch {
      // fall through to enqueue
    }
  }

  await enqueue({ op: 'create', tempId: tId, data, status: 'pending', createdAt: Date.now(), attempts: 0, nextRetryAt: Date.now() });
  return { log: tempLog, balance: null };
}

// ─── Update ───────────────────────────────────────────────────────────────────

export async function updateDeliveryLog(
  id: number,
  data: { items?: DeliveryLogItem[]; note?: string; billGenerated?: boolean },
): Promise<DeliveryLog> {
  const existing = await db.deliveryLogs.get(id);
  if (!existing) throw new Error(`Delivery log ${id} not found`);

  const nextItems = data.items ?? existing.items;
  const nextTotalAmount = nextItems.reduce((sum, item) => sum + Number(item.amount ?? 0), 0);

  const optimistic: DeliveryLog = {
    ...existing,
    ...data,
    items: nextItems,
    totalAmount: String(nextTotalAmount),
    closingBalance: String(Number(existing.openingBalance ?? 0) + nextTotalAmount),
  };

  await db.deliveryLogs.put(optimistic);

  if (id > 0 && isOnline()) {
    try {
      const res = await fetchApi(`/delivery-logs/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
        body: JSON.stringify(data),
      });

      if (res.ok) {
        const realLog: DeliveryLog = await res.json();
        await db.deliveryLogs.put(realLog);
        await invalidateCache('/delivery-logs');
        invalidateSyncCache();
        return realLog;
      }
    } catch {
      // fall through to enqueue
    }
  }

  if (id > 0) {
    await enqueue({ op: 'update', serverId: id, data, status: 'pending', createdAt: Date.now(), attempts: 0, nextRetryAt: Date.now() });
  }

  return optimistic;
}

// ─── Delete ───────────────────────────────────────────────────────────────────

export async function deleteDeliveryLog(id: number): Promise<void> {
  await db.deliveryLogs.delete(id);

  if (id > 0 && isOnline()) {
    try {
      const res = await fetchApi(`/delivery-logs/${id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
      });

      if (res.ok) {
        await invalidateCache('/delivery-logs');
        invalidateSyncCache();
        return;
      }
    } catch {
      // fall through to enqueue
    }
  }

  if (id > 0) {
    await enqueue({ op: 'delete', serverId: id, status: 'pending', createdAt: Date.now(), attempts: 0, nextRetryAt: Date.now() });
  }
}

// ─── Queue ────────────────────────────────────────────────────────────────────

async function enqueue(entry: Omit<DeliveryQueueEntry, 'id'>): Promise<void> {
  await db.deliveryQueue.add(entry as DeliveryQueueEntry);
  scheduleProcessQueue();
}

let processTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleProcessQueue(delayMs = SYNC_DEBOUNCE_MS) {
  if (!isBrowser() || !isOnline()) return;
  if (processTimer) clearTimeout(processTimer);
  processTimer = setTimeout(() => {
    processTimer = null;
    void processDeliveryQueue();
  }, delayMs);
}

let processing = false;

export async function processDeliveryQueue(): Promise<void> {
  if (processing || !isBrowser() || !isOnline()) return;
  processing = true;

  try {
    const now = Date.now();
    const actions = await db.deliveryQueue
      .where('status')
      .equals('pending')
      .filter((a) => a.nextRetryAt <= now)
      .sortBy('createdAt');

    for (const action of actions) {
      if (!isOnline()) break;
      if (!action.id) continue;

      try {
        if (action.op === 'create' && action.data) {
          const res = await fetchApi('/delivery-logs', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(action.data),
          });

          if (res.ok) {
            const body = await res.json();
            const realLog: DeliveryLog = body.log;

            if (action.tempId) {
              await db.deliveryLogs.delete(action.tempId);
            }
            await db.deliveryLogs.put(realLog);
            await db.deliveryQueue.update(action.id, { status: 'completed' });
            await invalidateCache('/delivery-logs');
            invalidateSyncCache();
          } else if (res.status >= 400 && res.status < 500 && res.status !== 401) {
            await db.deliveryQueue.update(action.id, { status: 'failed', lastError: `HTTP ${res.status}` });
          } else {
            await bumpRetry(action);
          }
        } else if (action.op === 'update' && action.serverId && action.data) {
          const res = await fetchApi(`/delivery-logs/${action.serverId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: JSON.stringify(action.data),
          });

          if (res.ok) {
            const realLog: DeliveryLog = await res.json();
            await db.deliveryLogs.put(realLog);
            await db.deliveryQueue.update(action.id, { status: 'completed' });
            await invalidateCache('/delivery-logs');
            invalidateSyncCache();
          } else if (res.status >= 400 && res.status < 500 && res.status !== 401) {
            await db.deliveryQueue.update(action.id, { status: 'failed', lastError: `HTTP ${res.status}` });
          } else {
            await bumpRetry(action);
          }
        } else if (action.op === 'delete' && action.serverId) {
          const res = await fetchApi(`/delivery-logs/${action.serverId}`, {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
          });

          if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
            await db.deliveryQueue.update(action.id, { status: 'completed' });
            if (res.ok) {
              await invalidateCache('/delivery-logs');
              invalidateSyncCache();
            }
          } else {
            await bumpRetry(action);
          }
        } else {
          await db.deliveryQueue.update(action.id, { status: 'failed', lastError: 'invalid-action' });
        }
      } catch {
        await bumpRetry(action);
        break;
      }
    }
  } finally {
    processing = false;
  }
}

async function bumpRetry(action: DeliveryQueueEntry): Promise<void> {
  if (!action.id) return;
  const attempts = (action.attempts ?? 0) + 1;
  const delay = Math.min(3000 * Math.pow(2, attempts), 5 * 60 * 1000);
  await db.deliveryQueue.update(action.id, {
    attempts,
    nextRetryAt: Date.now() + delay,
    lastError: 'retry',
  });
}

// ─── Init ─────────────────────────────────────────────────────────────────────

if (isBrowser()) {
  window.addEventListener('online', () => scheduleProcessQueue(0));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && isOnline()) {
      scheduleProcessQueue(0);
    }
  });
}
