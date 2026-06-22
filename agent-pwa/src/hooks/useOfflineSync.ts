import { useCallback } from 'react';
import { openDB, DBSchema, IDBPDatabase } from 'idb';

interface PaymentQueue {
  id?: number;
  orderId: string;
  amountXaf: number;
  confirmedAt: string;
  attempts: number;
}

interface GasBotDB extends DBSchema {
  'pending-payments': {
    key: number;
    value: PaymentQueue;
    indexes: { 'by-order': 'orderId' };
  };
}

let dbPromise: Promise<IDBPDatabase<GasBotDB>> | null = null;

const getDB = async (): Promise<IDBPDatabase<GasBotDB>> => {
  if (!dbPromise) {
    dbPromise = openDB<GasBotDB>('gasbot-agent-db', 1, {
      upgrade(db) {
        const store = db.createObjectStore('pending-payments', {
          keyPath: 'id',
          autoIncrement: true,
        });
        store.createIndex('by-order', 'orderId', { unique: false });
      },
    });
  }
  return dbPromise;
};

export const useOfflineSync = () => {
  const queuePaymentConfirmation = useCallback(async (payload: Omit<PaymentQueue, 'id' | 'attempts'>) => {
    const db = await getDB();
    await db.add('pending-payments', {
      ...payload,
      attempts: 0,
    });

    // Register background sync if supported
    if ('serviceWorker' in navigator && 'SyncManager' in window) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.sync.register('sync-payments');
        console.log('[OfflineSync] Background sync registered for payments');
      } catch (err) {
        console.warn('[OfflineSync] Background sync not available, will retry on next online event');
      }
    }
  }, []);

  const flushQueue = useCallback(async () => {
    const db = await getDB();
    const all = await db.getAll('pending-payments');

    if (all.length === 0) return;

    console.log(`[OfflineSync] Flushing ${all.length} pending payments...`);

    for (const item of all) {
      try {
        const res = await fetch('http://localhost:3000/api/v1/payments/agent-confirm', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer ' + (localStorage.getItem('agentToken') || 'demo-token'),
          },
          body: JSON.stringify({ orderId: item.orderId }),
        });

        if (res.ok) {
          await db.delete('pending-payments', item.id!);
          console.log(`[OfflineSync] Synced payment for order ${item.orderId}`);
        } else {
          // increment attempts
          await db.put('pending-payments', { ...item, attempts: item.attempts + 1 });
        }
      } catch (err) {
        console.error('Sync attempt failed for', item.orderId, err);
      }
    }
  }, []);

  // Auto flush when coming back online
  if (typeof window !== 'undefined') {
    window.addEventListener('online', () => {
      flushQueue();
    });
  }

  return { queuePaymentConfirmation, flushQueue };
};
