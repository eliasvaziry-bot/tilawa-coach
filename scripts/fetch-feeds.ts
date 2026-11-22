// YouTube RSS feeds → public/data/feeds/<id>.json, keeping a growing history (each feed shows ~15 recent items).
// If YouTube rejects a request, the last good JSON is kept. Titles/ids/dates/thumbnail URLs only — no media.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

const ROOT = resolve(import.meta.dirname, '..');
const OUT = join(ROOT, 'public/data/feeds');
mkdirSync(OUT, { recursive: true });

export const FEEDS = [
  { id: 'nuraniah', kind: 'playlist', ref: 'PLDGSJOlM3XL8aPMnm4riNMab33Jnra0hz', label: 'دروس القاعدة النورانية - Nuraniah Lessons' },
  { id: 'basim-karbalai', kind: 'channel', ref: 'UCLlMiPx_v5jFahvImDu_EFQ', label: 'Mulla Basim al-Karbalai' },
  { id: 'khaqani', kind: 'channel', ref: 'UC1tc7PapZl85wvxStwhJoDQ', label: 'Mulla Mohammad Baqer al-Khaqani' },
] as const;

export interface FeedItem {
  id: string;
  title: string;
  published: string;
  thumb: string;
  position?: number;
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'");

export function parseFeed(xml: string): FeedItem[] {
  return [...xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)].map((m, i) => {
    const e = m[1]!;
    const id = /<yt:videoId>([^<]+)<\/yt:videoId>/.exec(e)?.[1] ?? '';
    return {
      id,
      title: decode(/<title>([^<]*)<\/title>/.exec(e)?.[1] ?? ''),
      published: /<published>([^<]+)<\/published>/.exec(e)?.[1] ?? '',
      thumb: /<media:thumbnail url="([^"]+)"/.exec(e)?.[1] ?? `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
      position: i,
    };
  });
}

for (const f of FEEDS) {
  const path = join(OUT, `${f.id}.json`);
  const prev = existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as { items: FeedItem[] }) : { items: [] as FeedItem[] };
  const url = `https://www.youtube.com/feeds/videos.xml?${f.kind === 'playlist' ? 'playlist_id' : 'channel_id'}=${f.ref}`;
  try {
    const r = await fetch(url, { headers: { 'User-Agent': 'tilawa-coach-feeds/0.1 (personal study app)' } });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    const items = parseFeed(await r.text());
    if (!items.length) throw new Error('empty feed');
    const byId = new Map(prev.items.map((x) => [x.id, x]));
    for (const it of items) byId.set(it.id, { ...byId.get(it.id), ...it });
    const merged = [...byId.values()].sort((a, b) => (f.kind === 'playlist' ? (a.position ?? 999) - (b.position ?? 999) : b.published.localeCompare(a.published)));
    writeFileSync(path, JSON.stringify({ id: f.id, kind: f.kind, ref: f.ref, label: f.label, source: url, items: merged }, null, 1) + '\n');
    console.log(`${f.id}: ${items.length} in feed, ${merged.length} in history`);
  } catch (e) {
    console.warn(`${f.id}: kept last good JSON (${String(e)})`);
  }
}
