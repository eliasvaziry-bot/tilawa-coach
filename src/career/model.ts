// Career Desk data model + on-device store (IndexedDB 'career'). Nothing here leaves the phone unless shared.
import { signal } from '@preact/signals';
import { db } from '../data/db.ts';
import { decryptPack, type EncryptedPack } from './pack.ts';

export interface Opportunity {
  id: string;
  org: string;
  title: string;
  track: string;
  kind: string;
  eligibility: string;
  opens: string;
  deadline: string;
  deadlineNote: string;
  location: string;
  pay: string;
  url: string;
  source: { url: string; title: string; accessed: string };
  verified: 'opened-official' | 'opened-third-party' | 'unverified';
  notes: string;
  priority: number;
  private?: boolean;
}
export interface Pathway {
  id: string;
  name: string;
  startPay: string;
  laterPay: string;
  route: string;
  facts: { text: string; sourceUrl: string; sourceTitle: string; accessed: string }[];
  uncertain: string[];
}

/** Decrypted on the phone from the encrypted career pack (the public site only holds ciphertext). */
export interface CareerPack {
  generated: string;
  opportunities: Opportunity[];
  pathways: Pathway[];
  profile: Partial<Profile>;
}
export const pack = signal<CareerPack | null>(null);
export const packState = signal<'loading' | 'locked' | 'unlocked' | 'missing'>('loading');
/** a newer encrypted pack is on the website than the one unlocked on this phone (keeps the list up to date) */
export const packUpdate = signal(false);

export const STAGES = ['interested', 'drafting', 'applied', 'interview', 'offer', 'closed'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABEL: Record<Stage, string> = { interested: 'Interested', drafting: 'Drafting', applied: 'Applied', interview: 'Interview', offer: 'Offer', closed: 'Rejected / closed' };

export interface Tracked {
  id: string; // opportunity id or custom-…
  title: string;
  org: string;
  deadline: string;
  url: string;
  stage: Stage;
  notes: string;
  nextAction: string;
  nextDate: string;
  checklist: Record<string, boolean>;
  answers: Record<string, string>;
}
export interface Profile {
  name: string;
  university: string;
  course: string;
  year: string;
  email: string;
  interests: string;
  stories: { title: string; situation: string; task: string; action: string; result: string }[];
}
export const EMPTY_PROFILE: Profile = { name: '', university: '', course: '', year: '', email: '', interests: '', stories: [] };

export const tracked = signal<Tracked[]>([]);
export const profile = signal<Profile>(EMPTY_PROFILE);
export const privateOpps = signal<Opportunity[]>([]);
let loaded = false;

export async function loadCareer(): Promise<void> {
  if (loaded) return;
  loaded = true;
  try {
    const rows = await (await db()).getAll('career');
    tracked.value = rows.filter((r) => r.type === 'track').map((r) => r.data as Tracked);
    profile.value = { ...EMPTY_PROFILE, ...((rows.find((r) => r.type === 'profile')?.data as Profile | undefined) ?? {}) };
    privateOpps.value = (rows.find((r) => r.type === 'private-opps')?.data as Opportunity[] | undefined) ?? [];
    const p = rows.find((r) => r.type === 'pack')?.data as CareerPack | undefined;
    if (p) {
      pack.value = p;
      packState.value = 'unlocked';
      // each published pack has a fresh salt: a different salt online means the list was updated
      const seen = rows.find((r) => r.type === 'pack-salt')?.data as string | undefined;
      // checked when the app is idle, so the 87 KB pack never competes with the first screen
      setTimeout(() => {
        void fetch(`${import.meta.env.BASE_URL}data/career/pack.enc.json`, { cache: 'no-cache' })
          .then((r) => (r.ok ? (r.json() as Promise<EncryptedPack>) : null))
          .then((enc) => {
            if (enc?.salt && enc.salt !== seen) packUpdate.value = true;
          })
          .catch(() => undefined);
      }, 5000);
    }
  } catch {
    /* private mode: memory only */
  }
  if (!pack.value) {
    try {
      // only "is there a pack?": a HEAD request moves no data (offline: assume it is there)
      const r = await fetch(`${import.meta.env.BASE_URL}data/career/pack.enc.json`, { method: 'HEAD' });
      packState.value = r.ok ? 'locked' : 'missing';
    } catch {
      packState.value = navigator.onLine === false ? 'locked' : 'missing';
    }
  }
}

/** Unlock with the owner's passphrase; the decrypted pack is stored on this device only. */
export async function unlockPack(pass: string): Promise<boolean> {
  const r = await fetch(`${import.meta.env.BASE_URL}data/career/pack.enc.json`);
  if (!r.ok) return false;
  try {
    const enc = (await r.json()) as EncryptedPack;
    const p = await decryptPack<CareerPack>(enc, pass);
    pack.value = p;
    packState.value = 'unlocked';
    packUpdate.value = false;
    await put('pack', 'pack', p);
    await put('pack-salt', 'pack-salt', enc.salt);
    if (!profile.value.name && p.profile) await saveProfile({ ...EMPTY_PROFILE, ...p.profile } as Profile);
    return true;
  } catch {
    return false;
  }
}
async function put(id: string, type: string, data: unknown): Promise<void> {
  try {
    await (await db()).put('career', { id, type, data, updated: Date.now() });
  } catch {
    /* ignore */
  }
}
export async function saveTracked(t: Tracked): Promise<void> {
  tracked.value = [...tracked.value.filter((x) => x.id !== t.id), t];
  await put(`track:${t.id}`, 'track', t);
}
export async function removeTracked(id: string): Promise<void> {
  tracked.value = tracked.value.filter((x) => x.id !== id);
  try {
    await (await db()).delete('career', `track:${id}`);
  } catch {
    /* ignore */
  }
}
export async function saveProfile(p: Profile): Promise<void> {
  profile.value = p;
  await put('profile', 'profile', p);
}
export async function savePrivateOpps(list: Opportunity[]): Promise<void> {
  privateOpps.value = list.map((o) => ({ ...o, private: true }));
  await put('private-opps', 'private-opps', privateOpps.value);
}

export function track(o: Opportunity): Tracked {
  return { id: o.id, title: o.title, org: o.org, deadline: o.deadline, url: o.url, stage: 'interested', notes: '', nextAction: 'Read the page and check eligibility', nextDate: '', checklist: {}, answers: {} };
}

/** Whole days from today (local) to an ISO date; null if no date. */
export function daysUntil(iso: string, now = new Date()): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const d = new Date(`${iso}T23:59:00`);
  const t0 = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime() - t0.getTime()) / 86400000);
}
