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

export async function pullDeliveryLogs(params?: {
  houseId?: number;
  shift?: string;
  fromDate?: string;
  toDate?: string;
}): Promise<DeliveryLog[]> {
  if (!isOnline()) return getDeliveryLogs(params);

  const q = new URLSearchParams();
  if (params?.houseId) q.set('houseId', String(params.houseId));
  if (params?.shift) q.set('shift', params.shift);
  if (params?.fromDate) q.set('fromDate', params.fromDate);
  if (params?.toDate) q.set('toDate', params.toDate);

  const path = `/delivery-logs${q.toString() ? `?${q}` : ''}`;
  const res = await fetchApi(path, {
    headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
  });

  if (!res.ok) return getDeliveryLogs(params);

  const serverLogs: DeliveryLog[] = await res.json();
  await mergeServerLogsIntoIDB(serverLogs);
  return getDeliveryLogs(params);
}

async function mergeServerLogsIntoIDB(serverLogs: DeliveryLog[]): Promise<void> {
  if (serverLogs.length === 0) return;

  await db.deliveryLogs.bulkPut(serverLogs);

  // Delete tempLogs that have a matching server log (server log replaces them)
  const tempIds = await db.deliveryLogs
    .where('id')
    .below(0)
    .filter((l) => {
      const hasServerLog = serverLogs.some(
        (s) => s.houseId === l.houseId && s.shift === l.shift && s.deliveredAt?.slice(0, 10) === l.deliveredAt?.slice(0, 10),
      );
      return hasServerLog;
    })
    .primaryKeys();

  if (tempIds.length > 0) {
    await db.deliveryLogs.bulkDelete(tempIds as number[]);
  }

  // Delete orphaned tempLogs: no matching server log AND no pending queue entry
  const pendingTempIds = new Set(
    (await db.deliveryQueue.where('status').equals('pending').toArray())
      .map((e) => e.tempId)
      .filter((id): id is number => typeof id === 'number'),
  );

  const allTempLogs = await db.deliveryLogs.where('id').below(0).toArray();
  const orphanIds = allTempLogs
    .filter((l) => !pendingTempIds.has(l.id))
    .map((l) => l.id!);

  if (orphanIds.length > 0) {
    await db.deliveryLogs.bulkDelete(orphanIds);
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
            if (res.ok) await invalidateCache('/delivery-logs');
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
