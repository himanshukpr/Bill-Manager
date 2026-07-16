import { db } from './db';
import { getAuthHeader } from './auth';
import { fetchApi } from './api-base';
import { SYNC_DEBOUNCE_MS, GLOBAL_SYNC_INTERVAL_MS } from '@/lib/timing';
import { awaitQCWriteQueue } from './api';

const MAX_RETRY_DELAY_MS = 5 * 60 * 1000;

function nextRetryDelay(attempts: number): number {
  const base = 3000;
  const delay = base * Math.pow(2, Math.max(0, attempts));
  return Math.min(delay, MAX_RETRY_DELAY_MS);
}

class SyncEngine {
  private syncing = false;
  private processQueueTimer: ReturnType<typeof setTimeout> | null = null;

  private scheduleProcessQueue(delayMs = SYNC_DEBOUNCE_MS) {
    if (typeof navigator === 'undefined' || !navigator.onLine) return;

    if (this.processQueueTimer) {
      clearTimeout(this.processQueueTimer);
    }

    this.processQueueTimer = setTimeout(() => {
      this.processQueueTimer = null;
      void this.processQueue();
    }, delayMs);
  }

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.scheduleProcessQueue(0));
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible' && navigator.onLine) {
          this.scheduleProcessQueue(0);
        }
      });

      // Periodic fallback flush for queued writes.
      setInterval(() => {
        if (navigator.onLine) this.processQueue();
      }, GLOBAL_SYNC_INTERVAL_MS);
    }
  }

  async enqueue(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    const now = Date.now();
    if (method === 'PATCH') {
      const existing = await db.syncQueue
        .toCollection()
        .filter((entry) => entry.url === url && entry.method === 'PATCH')
        .last();

      if (existing?.id) {
        const mergedBody = {
          ...(typeof existing.body === 'object' && existing.body ? (existing.body as Record<string, unknown>) : {}),
          ...(typeof body === 'object' && body ? (body as Record<string, unknown>) : {}),
        };

        await db.syncQueue.update(existing.id, {
          body: mergedBody,
          nextRetryAt: now,
          lastError: undefined,
        });
      } else {
        await db.syncQueue.add({
          url,
          method,
          body,
          createdAt: now,
          attempts: 0,
          nextRetryAt: now,
        });
      }
    } else if (method === 'DELETE') {
      const existingForUrl = await db.syncQueue
        .toCollection()
        .filter((entry) => entry.url === url)
        .primaryKeys();
      if (existingForUrl.length > 0) {
        await db.syncQueue.bulkDelete(existingForUrl as number[]);
      }
      await db.syncQueue.add({
        url,
        method,
        createdAt: now,
        attempts: 0,
        nextRetryAt: now,
      });
    } else {
      await db.syncQueue.add({
        url,
        method,
        body,
        createdAt: now,
        attempts: 0,
        nextRetryAt: now,
      });
    }
    if (typeof navigator !== 'undefined' && navigator.onLine) {
      this.scheduleProcessQueue();
    }
  }

  async processQueue() {
    if (this.processQueueTimer) {
      clearTimeout(this.processQueueTimer);
      this.processQueueTimer = null;
    }

    if (this.syncing || typeof navigator === 'undefined' || !navigator.onLine) return;
    this.syncing = true;

    try {
      const now = Date.now();
      const actions = await db.syncQueue
        .where('nextRetryAt')
        .belowOrEqual(now)
        .sortBy('createdAt');
      
      for (const action of actions) {
        if (!navigator.onLine) break; // Lost connection midway
        
        // If a DELETE targets a house that no longer exists locally, skip it
        if (action.method === 'DELETE' && (action.url || '').startsWith('/houses/')) {
          const houseId = parseInt(action.url!.split('/')[2], 10);
          if (!Number.isNaN(houseId)) {
            const localHouse = await db.houses.get(houseId);
            if (!localHouse) {
              await db.syncQueue.delete(action.id!);
              continue;
            }
          }
        }

        try {
          const res = await fetchApi(action.url, {
            method: action.method,
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: action.body ? JSON.stringify(action.body) : undefined,
          });

          // If success or a 4xx error (excluding Auth 401), we consider it processed/failed-permanently
          // If 5xx or network fail, it remains in queue
                if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
                  // Serialize all queryCache writes on the same lock as api.ts
                  await awaitQCWriteQueue();

                  // For delivery-log creates, replace tempLog with real log in IndexedDB and queryCache
                  if (action.method === 'POST' && (action.url || '').startsWith('/delivery-logs')) {
                    try {
                      const body = await res.json();
                      const realLog = body?.log;
                      if (realLog?.id && realLog.id > 0) {
                        const datePrefix = realLog.deliveredAt?.slice(0, 10) ?? '';
                        const staleLogs = await db.deliveryLogs
                          .where('houseId')
                          .equals(realLog.houseId)
                          .filter((l) => l.deliveredAt?.startsWith(datePrefix) && l.id < 0)
                          .toArray();
                        if (staleLogs.length > 0) {
                          await db.deliveryLogs.bulkDelete(staleLogs.map((l) => l.id!));
                        }
                        await db.deliveryLogs.put(realLog);
                        const qcEntries = await db.queryCache.toArray();
                        const qcTargets = qcEntries.filter((e) => e.key.startsWith('GET:/delivery-logs'));
                        for (const entry of qcTargets) {
                          try {
                            const cached = JSON.parse(entry.payload) as any[];
                            if (!Array.isArray(cached)) continue;
                            const updated = cached.map((log: any) =>
                              log.houseId === realLog.houseId &&
                              log.deliveredAt?.startsWith(datePrefix) &&
                              log.id < 0
                                ? realLog
                                : log,
                            );
                            await db.queryCache.put({
                              key: entry.key,
                              payload: JSON.stringify(updated),
                              updatedAt: Date.now(),
                            });
                          } catch {
                            await db.queryCache.delete(entry.key);
                          }
                        }
                      }
                    } catch {
                      // ignore response parsing errors
                    }
                  }

                  await db.syncQueue.delete(action.id!);
                  // Invalidate local GET caches affected by this write so UI can re-fetch fresh data
                  try {
                    const url = action.url || '';
                    if (url.startsWith('/house-balance') || url.startsWith('/house-balance/payment')) {
                      await Promise.all([
                        db.queryCache.where('key').startsWith('GET:/bills').delete(),
                        db.queryCache.where('key').startsWith('GET:/house-balance').delete(),
                        db.queryCache.where('key').startsWith('GET:/houses').delete(),
                        db.queryCache.where('key').startsWith('GET:/delivery-logs').delete(),
                      ]);
                    } else if (url.startsWith('/bills')) {
                      await Promise.all([
                        db.queryCache.where('key').startsWith('GET:/bills').delete(),
                        db.queryCache.where('key').startsWith('GET:/house-balance').delete(),
                      ]);
                    } else if (url.startsWith('/houses')) {
                      await db.queryCache.where('key').startsWith('GET:/houses').delete();
                    } else if (url.startsWith('/delivery-logs')) {
                      await Promise.all([
                        db.queryCache.where('key').startsWith('GET:/delivery-logs').delete(),
                        db.queryCache.where('key').startsWith('GET:/house-balance').delete(),
                        db.queryCache.where('key').startsWith('GET:/bills').delete(),
                      ]);
                    }
                  } catch {
                    // ignore cache invalidation errors
                  }
          } else if (res.status === 401) {
            // Unauthorized, must halt queue
            break;
          } else {
            const attempts = (action.attempts ?? 0) + 1;
            await db.syncQueue.update(action.id!, {
              attempts,
              nextRetryAt: Date.now() + nextRetryDelay(attempts),
              lastError: `HTTP ${res.status}`,
            });
          }
        } catch (err: unknown) {
          const attempts = (action.attempts ?? 0) + 1;
          await db.syncQueue.update(action.id!, {
            attempts,
            nextRetryAt: Date.now() + nextRetryDelay(attempts),
            lastError: err instanceof Error ? err.message : 'network-error',
          });
          // Generic network error, halt queue and wait for next online event
          break;
        }
      }

    } finally {
      this.syncing = false;
    }
  }
}

export const syncEngine = new SyncEngine();
