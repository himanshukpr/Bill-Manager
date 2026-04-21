import { db } from './db';
import { getAuthHeader } from './auth';

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? '/api';

class SyncEngine {
  private syncing = false;

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.processQueue());
      
      // Attempt generic polling fallback
      setInterval(() => {
        if (navigator.onLine) this.processQueue();
      }, 30000); // every 30s
    }
  }

  async enqueue(url: string, method: 'POST' | 'PATCH' | 'DELETE', body?: unknown) {
    await db.syncQueue.add({
      url,
      method,
      body,
      createdAt: Date.now(),
    });
    
    if (navigator.onLine) {
      this.processQueue();
    }
  }

  async processQueue() {
    if (this.syncing) return;
    this.syncing = true;

    try {
      const actions = await db.syncQueue.orderBy('createdAt').toArray();
      
      for (const action of actions) {
        if (!navigator.onLine) break; // Lost connection midway
        
        try {
          const res = await fetch(`${BASE_URL}${action.url}`, {
            method: action.method,
            headers: { 'Content-Type': 'application/json', ...getAuthHeader() },
            body: action.body ? JSON.stringify(action.body) : undefined,
          });

          // If success or a 4xx error (excluding Auth 401), we consider it processed/failed-permanently
          // If 5xx or network fail, it remains in queue
          if (res.ok || (res.status >= 400 && res.status < 500 && res.status !== 401)) {
            await db.syncQueue.delete(action.id!);
          } else if (res.status === 401) {
            // Unauthorized, must halt queue
            break;
          }
        } catch (err) {
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
