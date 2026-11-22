// IndexedDB (everything stays on the device). One small key-value store plus typed stores.
import { openDB, type DBSchema, type IDBPDatabase } from 'idb';

export interface RecordingRow {
  id: string;
  created: number;
  kind: 'cr' | 'check' | 'calibration' | 'testset' | 'free';
  ref?: string; // e.g. "1:2" or lesson id
  mime: string;
  blob: Blob;
  durationMs: number;
  label?: string;
}

export interface CacheRow {
  key: string;
  ts: number; // fetched at (ms)
  source: 'qf' | 'other';
  value: unknown;
}

interface Schema extends DBSchema {
  kv: { key: string; value: unknown };
  recordings: { key: string; value: RecordingRow; indexes: { byCreated: number } };
  cache: { key: string; value: CacheRow; indexes: { byTs: number } };
  career: { key: string; value: { id: string; type: string; data: unknown; updated: number }; indexes: { byType: string } };
  srs: { key: string; value: { id: string; data: unknown } };
}

let dbp: Promise<IDBPDatabase<Schema>> | null = null;
export function db(): Promise<IDBPDatabase<Schema>> {
  if (!dbp) {
    dbp = openDB<Schema>('tilawa-coach', 1, {
      upgrade(d) {
        d.createObjectStore('kv');
        d.createObjectStore('recordings', { keyPath: 'id' }).createIndex('byCreated', 'created');
        d.createObjectStore('cache', { keyPath: 'key' }).createIndex('byTs', 'ts');
        d.createObjectStore('career', { keyPath: 'id' }).createIndex('byType', 'type');
        d.createObjectStore('srs', { keyPath: 'id' });
      },
    });
  }
  return dbp;
}

export async function kvGet<T>(key: string, fallback: T): Promise<T> {
  try {
    const v = await (await db()).get('kv', key);
    return v === undefined ? fallback : (v as T);
  } catch {
    return fallback;
  }
}
export async function kvSet(key: string, value: unknown): Promise<void> {
  try {
    await (await db()).put('kv', value, key);
  } catch {
    /* storage unavailable (private mode): the app keeps working in memory */
  }
}

/** Quran Foundation data may be cached for at most 7 days (QF Developer Terms). */
export const QF_MAX_AGE_MS = 7 * 24 * 3600 * 1000;

export async function cacheGet<T>(key: string, maxAgeMs: number): Promise<T | undefined> {
  try {
    const row = await (await db()).get('cache', key);
    if (!row) return undefined;
    if (Date.now() - row.ts > maxAgeMs) {
      await (await db()).delete('cache', key);
      return undefined;
    }
    return row.value as T;
  } catch {
    return undefined;
  }
}
export async function cachePut(key: string, value: unknown, source: CacheRow['source']): Promise<void> {
  try {
    await (await db()).put('cache', { key, ts: Date.now(), source, value });
  } catch {
    /* ignore */
  }
}
/** Deletes Quran Foundation rows older than 7 days (also run at start-up). */
export async function purgeExpiredQf(): Promise<number> {
  let n = 0;
  try {
    const d = await db();
    const tx = d.transaction('cache', 'readwrite');
    for await (const cur of tx.store.iterate()) {
      if (cur.value.source === 'qf' && Date.now() - cur.value.ts > QF_MAX_AGE_MS) {
        await cur.delete();
        n++;
      }
    }
    await tx.done;
  } catch {
    /* ignore */
  }
  return n;
}
