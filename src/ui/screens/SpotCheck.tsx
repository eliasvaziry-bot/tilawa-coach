// Hidden page (#/spot-check): listen to 20 random call/response splits of the children's track and mark each
// right or wrong. Results stay on this device; the automatic check's numbers are in data/derived/kids-split-check.json.
import { useEffect, useState } from 'preact/hooks';
import { kidsBuffer, loadKids, KIDS_CREDIT } from '../../cr/kids.ts';
import { playSegment } from '../../audio/everyayah.ts';
import { resumeAudio } from '../../audio/context.ts';
import { kvGet, kvSet } from '../../data/db.ts';
import type { KidsSplit } from '../../cr/kidsSplit.ts';

const POOL = [1, 93, 94, 97, 103, 105, 106, 107, 108, 109, 110, 111, 112, 113, 114];
type Item = { url: string; split: KidsSplit };

export default function SpotCheckScreen() {
  const [items, setItems] = useState<Item[] | null>(null);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [err, setErr] = useState<string | null>(null);
  useEffect(() => {
    void kvGet<Record<string, boolean>>('spotcheck', {}).then(setMarks);
    void (async () => {
      try {
        const all: Item[] = [];
        for (const s of POOL) {
          const k = await loadKids(s);
          for (const sp of k.splits) all.push({ url: k.audioUrl, split: sp });
        }
        for (let i = all.length - 1; i > 0; i--) {
          const j = Math.floor(Math.random() * (i + 1));
          [all[i], all[j]] = [all[j]!, all[i]!];
        }
        setItems(all.slice(0, 20));
      } catch (e) {
        setErr(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);
  const play = async (it: Item, part: 'call' | 'response') => {
    await resumeAudio();
    const b = await kidsBuffer(it.url);
    const pr = it.split.pairs[0]!;
    const r = part === 'call' ? pr.call : pr.response;
    playSegment(b, r.s, r.e);
  };
  const mark = (k: string, ok: boolean) => {
    const m = { ...marks, [k]: ok };
    setMarks(m);
    void kvSet('spotcheck', m);
  };
  const done = Object.keys(marks).length;
  const right = Object.values(marks).filter(Boolean).length;
  return (
    <>
      <div class="card">
        <h2>Spot-check the children split</h2>
        <p class="small">For each verse: the first button should be the sheikh alone, the second the children repeating the same words. Mark it.</p>
        <p class="small">
          Marked so far: {done} · right: {right} · wrong: {done - right}
        </p>
        <p class="small muted">{KIDS_CREDIT}</p>
        <div class="task-now">
          <b>YOUR TASK NOW:</b> check 20 verses (about 5 minutes) when you have headphones.
        </div>
      </div>
      {err ? <p class="notice warn">{err}</p> : null}
      {!items && !err ? <p class="muted">Loading…</p> : null}
      {items?.map((it) => {
        const k = it.split.verseKey;
        return (
          <div class="card row" key={k}>
            <b class="grow">{k}</b>
            <button class="btn small" onClick={() => void play(it, 'call')}>Sheikh</button>
            <button class="btn small" onClick={() => void play(it, 'response')}>Children</button>
            <button class={`btn small${marks[k] === true ? ' primary' : ''}`} onClick={() => mark(k, true)} aria-pressed={marks[k] === true}>Right</button>
            <button class={`btn small${marks[k] === false ? ' primary' : ''}`} onClick={() => mark(k, false)} aria-pressed={marks[k] === false}>Wrong</button>
          </div>
        );
      })}
    </>
  );
}
