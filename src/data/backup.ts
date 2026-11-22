// One-file Backup/Restore (progress, settings, career, SRS; recordings optional). Stays on the device unless the
// owner shares the file.
import { db, kvGet, kvSet } from './db.ts';

export interface BackupFile {
  app: 'tilawa-coach';
  version: 1;
  created: string;
  kv: [string, unknown][];
  srs: { id: string; data: unknown }[];
  career: { id: string; type: string; data: unknown; updated: number }[];
  recordings?: { id: string; created: number; kind: string; ref?: string; mime: string; durationMs: number; label?: string; b64: string }[];
}

async function blobToB64(b: Blob): Promise<string> {
  const buf = new Uint8Array(await b.arrayBuffer());
  let s = '';
  for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode(...buf.subarray(i, i + 0x8000));
  return btoa(s);
}
function b64ToBlob(b64: string, mime: string): Blob {
  const bin = atob(b64);
  const u = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i);
  return new Blob([u], { type: mime });
}

export async function makeBackup(includeRecordings: boolean): Promise<BackupFile> {
  const d = await db();
  const kvKeys = await d.getAllKeys('kv');
  const kv: [string, unknown][] = [];
  for (const k of kvKeys) kv.push([String(k), await d.get('kv', k)]);
  const out: BackupFile = {
    app: 'tilawa-coach',
    version: 1,
    created: new Date().toISOString(),
    kv,
    srs: await d.getAll('srs'),
    career: await d.getAll('career'),
  };
  if (includeRecordings) {
    out.recordings = [];
    for (const r of await d.getAll('recordings')) out.recordings.push({ id: r.id, created: r.created, kind: r.kind, ref: r.ref, mime: r.mime, durationMs: r.durationMs, label: r.label, b64: await blobToB64(r.blob) });
  }
  return out;
}

export async function restoreBackup(file: BackupFile): Promise<{ kv: number; srs: number; career: number; recordings: number }> {
  if (file.app !== 'tilawa-coach' || file.version !== 1) throw new Error('This is not a Tilawa Coach backup file.');
  const d = await db();
  const tx = d.transaction(['kv', 'srs', 'career', 'recordings'], 'readwrite');
  for (const [k, v] of file.kv) await tx.objectStore('kv').put(v, k);
  for (const r of file.srs) await tx.objectStore('srs').put(r);
  for (const r of file.career) await tx.objectStore('career').put(r);
  for (const r of file.recordings ?? []) await tx.objectStore('recordings').put({ id: r.id, created: r.created, kind: r.kind as 'free', ref: r.ref, mime: r.mime, durationMs: r.durationMs, label: r.label, blob: b64ToBlob(r.b64, r.mime) });
  await tx.done;
  return { kv: file.kv.length, srs: file.srs.length, career: file.career.length, recordings: file.recordings?.length ?? 0 };
}

/** Share sheet when available (iOS), otherwise a download. */
export async function shareOrDownload(name: string, mime: string, data: BlobPart): Promise<'shared' | 'downloaded'> {
  const file = new File([data], name, { type: mime });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    } catch (e) {
      if (e instanceof DOMException && e.name === 'AbortError') return 'shared';
    }
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}

export const lastBackupAt = () => kvGet<number>('lastBackupAt', 0);
export const markBackup = () => kvSet('lastBackupAt', Date.now());
