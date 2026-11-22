import { useEffect, useMemo, useState } from 'preact/hooks';
import { loadIndex, loadSurah, loadTranslation, type Ayah, type QuranIndex } from '../../data/quranData.ts';
import { RULES } from '../../data/rules.ts';
import { ANN_FLAGS } from '../../data/rules.ts';
import { mushafPlayer, nowWord, playerState } from '../../audio/mushafPlayer.ts';
import { estimatedOutputLatencyMs } from '../../audio/context.ts';
import { route, settings, updateSettings, go } from '../state.ts';
import { AyahText } from '../components/AyahText.tsx';
import { IconPlay } from '../components/icons.tsx';
import { ReviewBadge } from '../components/ReviewBadge.tsx';

function SurahList({ index }: { index: QuranIndex }) {
  const [q, setQ] = useState('');
  const [juzAmma, setJuzAmma] = useState(false);
  const list = index.surahs.filter((s) => {
    if (juzAmma && s.n < 78 && s.n !== 1) return false;
    if (!q.trim()) return true;
    const t = q.trim().toLowerCase();
    return String(s.n) === t || s.tname.toLowerCase().includes(t) || s.ename.toLowerCase().includes(t) || s.name.includes(q.trim());
  });
  return (
    <>
      <div class="card">
        <div class="task-now">
          <b>YOUR TASK NOW:</b> open Al-Fatiha, press ▶ and follow the highlighted word with your finger.
        </div>
        <div class="row" style={{ marginTop: 12 }}>
          <a class="btn primary" href="#/mushaf/1">Open Al-Fatiha</a>
          <label class="row small" style={{ gap: 6 }}>
            <input type="checkbox" checked={juzAmma} onChange={(e) => setJuzAmma(e.currentTarget.checked)} /> Juz Amma only
          </label>
        </div>
        <label class="field">
          <span class="small muted">Find a surah (number or name)</span>
          <input type="search" value={q} onInput={(e) => setQ(e.currentTarget.value)} placeholder="e.g. 112 or Ikhlas" />
        </label>
      </div>
      <ul class="list card" style={{ padding: '0 12px' }}>
        {list.map((s) => (
          <li key={s.n}>
            <a href={`#/mushaf/${s.n}`}>
              <span class="chip" style={{ minWidth: 44, justifyContent: 'center' }}>{s.n}</span>
              <span class="grow">
                <b>{s.tname}</b> <span class="muted small">· {s.ename} · {s.ayas} ayat</span>
              </span>
              <span lang="ar" style={{ fontFamily: 'var(--quran-font)', fontSize: 22 }}>{s.name}</span>
            </a>
          </li>
        ))}
      </ul>
    </>
  );
}

export function Legend() {
  const seen = new Set<string>();
  const items = RULES.filter((r) => (seen.has(r.colour) ? false : (seen.add(r.colour), true)));
  return (
    <div class="card">
      <h2>Tajweed colours <ReviewBadge /></h2>
      <div class="legend">
        {items.map((r) => (
          <div key={r.id}>
            <span class="sw" style={{ background: `var(${r.colour})` }} />
            {RULES.filter((x) => x.colour === r.colour)
              .map((x) => x.en)
              .join(' / ')}
          </div>
        ))}
      </div>
      <p class="small muted" style={{ marginBottom: 0 }}>
        Rule locations come from data (cpfair/quran-tajweed, rebuilt on the Tanzil text, compared with Quran.com's
        tajweed text). A dotted underline means the rule applies only if you continue past the pause mark. Colour-blind
        mode (Settings) adds line styles; tap any word to see its rules by name.
      </p>
    </div>
  );
}

const MARK_MEANING: Record<string, string> = {
  '\u06D6': 'continuing is better',
  '\u06D7': 'stopping is better',
  '\u06D8': 'stop here',
  '\u06D9': 'do not stop here',
  '\u06DA': 'stopping or continuing are both fine',
  '\u06DB': 'pair sign: stop at one of the two, not both',
  '\u06DC': 'sakt: a brief pause without taking a breath',
  '\u06E9': 'place of sajdah',
};

function WordInfo({ ayah, index, voice, onClose }: { ayah: Ayah; index: number; voice: string; onClose: () => void }) {
  const w = ayah.words[index];
  if (!w) return null;
  const rules = ayah.annotations.filter((a) => a.start < w.end && a.end > w.start);
  const marks = [...w.marksAfter].filter((c) => MARK_MEANING[c]);
  return (
    <div class="card sheet" role="dialog" aria-label="Word details">
      <div class="row">
        <span lang="ar" class="quran grow" style={{ fontSize: 34 }}>{w.text}</span>
        <button class="btn small" onClick={onClose}>Close</button>
      </div>
      {rules.length ? (
        <ul class="small" style={{ margin: '6px 0 0', paddingLeft: 18 }}>
          {rules.map((r, i) => (
            <li key={i}>
              <span class="sw" style={{ display: 'inline-block', width: 10, height: 10, borderRadius: 3, background: `var(${r.rule.colour})`, marginRight: 6 }} />
              <b>{r.rule.en}</b> — {r.rule.gloss} <ReviewBadge />
              {r.flags & ANN_FLAGS.WASL_ONLY ? <em> (only when you continue past the pause mark)</em> : null}
              {r.flags & ANN_FLAGS.DISPUTED ? <em> (Quran.com's tajweed text disagrees here — ask a teacher)</em> : null}
              {r.flags & ANN_FLAGS.ENGINE_DISPUTED ? <em> (our independent rule check disagrees here — ask a teacher)</em> : null}
            </li>
          ))}
        </ul>
      ) : (
        <p class="small muted">No coloured rule in this word.</p>
      )}
      {marks.map((c) => (
        <p class="small" key={c} style={{ margin: '6px 0 0' }}>
          <span class="pm">{c}</span> after this word: {MARK_MEANING[c]} <ReviewBadge />
        </p>
      ))}
      <p class="small muted" style={{ margin: '6px 0 0' }}>
        Played: Sheikh al-Minshawi ({voice}), cut from the ayah recording using quran-align word timings.
      </p>
    </div>
  );
}

function Reader({ n, focusAyah }: { n: number; focusAyah: number | null }) {
  const [index, setIndex] = useState<QuranIndex | null>(null);
  const [ayat, setAyat] = useState<Ayah[] | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [trans, setTrans] = useState<string[] | null>(null);
  const [shownTrans, setShownTrans] = useState<Set<number>>(new Set());
  const [legend, setLegend] = useState(false);
  const [info, setInfo] = useState<{ ayah: Ayah; index: number } | null>(null);
  const s = settings.value;

  useEffect(() => {
    setAyat(null);
    setErr(null);
    void loadIndex().then(setIndex);
    loadSurah(n).then(setAyat, (e: unknown) => setErr(e instanceof Error ? e.message : String(e)));
  }, [n]);
  useEffect(() => {
    setTrans(null);
    if (s.translation) void loadTranslation(s.translation, n).then(setTrans);
  }, [n, s.translation]);
  useEffect(() => {
    if (focusAyah && ayat) document.getElementById(`a${focusAyah}`)?.scrollIntoView({ block: 'start' });
  }, [focusAyah, ayat]);
  useEffect(() => {
    mushafPlayer.voice = s.voice;
    mushafPlayer.setRate(s.rate);
    // calibrated output latency if there is one, otherwise the browser's own estimate (matters with Bluetooth)
    const cal = Object.values(s.latencyMs);
    mushafPlayer.latencyMs = cal.length ? [...cal].sort((a, b) => a - b)[Math.floor(cal.length / 2)]! / 2 : estimatedOutputLatencyMs();
  }, [s.voice, s.rate]);
  // keep the sounding word in view while playing
  const nw = nowWord.value;
  useEffect(() => {
    if (!nw || nw.surah !== n || playerState.value !== 'playing') return;
    const el = document.querySelector<HTMLElement>(`#a${nw.ayah} [data-w="${nw.word}"]`);
    if (!el) return;
    const r = el.getBoundingClientRect();
    if (r.top < 70 || r.bottom > window.innerHeight - 170) el.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [nw?.ayah, nw?.word]);

  const meta = index?.surahs[n - 1];
  const sajdaAyat = useMemo(() => new Set(index?.sajdas.filter((x) => x.s === n).map((x) => x.a) ?? []), [index, n]);
  if (err) return <div class="notice warn">Could not load this surah: {err}</div>;
  if (!ayat || !meta) return <p class="muted">Loading surah…</p>;

  return (
    <>
      <div class="card">
        <div class="row">
          <div class="grow">
            <h2 style={{ marginBottom: 0 }}>
              {meta.n}. {meta.tname}
            </h2>
            <div class="small muted">
              {meta.ename} · {meta.ayas} ayat · {meta.type}
            </div>
          </div>
          <span lang="ar" style={{ fontFamily: 'var(--quran-font)', fontSize: 30 }}>{meta.name}</span>
        </div>
        <div class="task-now" style={{ marginTop: 10 }}>
          <b>YOUR TASK NOW:</b> press ▶ Play, then tap any word to hear it alone.
        </div>
        <div class="row" style={{ marginTop: 10 }}>
          <button class="btn primary" onClick={() => void mushafPlayer.playFrom(ayat, 0)}>
            <IconPlay /> Play
          </button>
          <button class="btn small" aria-pressed={s.tajweed} onClick={() => updateSettings({ tajweed: !s.tajweed })}>
            Tajweed {s.tajweed ? 'on' : 'off'}
          </button>
          <button class="btn small" aria-expanded={legend} onClick={() => setLegend(!legend)}>
            Legend
          </button>
          <select class="btn small" aria-label="Voice" value={s.voice} onChange={(e) => updateSettings({ voice: e.currentTarget.value as 'murattal' | 'mujawwad' })}>
            <option value="murattal">Murattal</option>
            <option value="mujawwad">Mujawwad</option>
          </select>
        </div>
        {s.voice === 'mujawwad' ? <p class="small muted" style={{ marginBottom: 0 }}>Mujawwad timings are less precise (he repeats phrases); highlighting may jump.</p> : null}
      </div>
      {legend ? <Legend /> : null}
      {info ? <WordInfo ayah={info.ayah} index={info.index} voice={s.voice} onClose={() => setInfo(null)} /> : null}
      <div class="card" style={{ paddingTop: 4 }}>
        {ayat.map((a, i) => (
          <section class="ayah" id={`a${a.ayah}`} key={a.ayah}>
            <div class="ayah-head">
              <span class="ayah-no">
                {n}:{a.ayah}
                {sajdaAyat.has(a.ayah) ? ' · sajdah' : ''}
              </span>
              <span class="row" style={{ gap: 2 }}>
                {trans ? (
                  <button
                    class="btn small ghost"
                    onClick={() => {
                      const ns = new Set(shownTrans);
                      if (ns.has(a.ayah)) ns.delete(a.ayah);
                      else ns.add(a.ayah);
                      setShownTrans(ns);
                    }}
                  >
                    {shownTrans.has(a.ayah) ? 'Hide' : 'Meaning'}
                  </button>
                ) : null}
                <button class="iconbtn" aria-label={`Play from ayah ${a.ayah}`} onClick={() => void mushafPlayer.playFrom(ayat, i)}>
                  <IconPlay />
                </button>
              </span>
            </div>
            <AyahText
              ayah={a}
              tajweed={s.tajweed}
              now={nw && nw.surah === n && nw.ayah === a.ayah ? nw.word : null}
              onWord={(wi) => {
                setInfo({ ayah: a, index: wi });
                void mushafPlayer.playWord(a, wi);
              }}
            />
            {trans && shownTrans.has(a.ayah) ? <p class="translation">{trans[i]}</p> : null}
          </section>
        ))}
      </div>
      <div class="row" style={{ justifyContent: 'space-between' }}>
        {n > 1 ? <a class="btn" href={`#/mushaf/${n - 1}`}>← Surah {n - 1}</a> : <span />}
        {n < 114 ? <a class="btn" href={`#/mushaf/${n + 1}`}>Surah {n + 1} →</a> : <span />}
      </div>
      <p class="small muted">
        Text: Tanzil Quran Text (Uthmani v1.1), unchanged — <a href="https://tanzil.net" target="_blank" rel="noopener">tanzil.net</a>. Audio:
        Sheikh Muhammad Siddiq al-Minshawi via EveryAyah. <a href="#/credits">All credits</a>.
      </p>
    </>
  );
}

export default function MushafScreen() {
  const parts = route.value.parts;
  const n = Number(parts[1]);
  const [index, setIndex] = useState<QuranIndex | null>(null);
  useEffect(() => void loadIndex().then(setIndex), []);
  if (Number.isInteger(n) && n >= 1 && n <= 114) return <Reader n={n} focusAyah={parts[2] ? Number(parts[2]) : null} />;
  if (!index) return <p class="muted">Loading…</p>;
  return (
    <>
      {parts[1] !== undefined ? <p class="notice warn small">Surah "{parts[1]}" does not exist — surahs are numbered 1 to 114.</p> : null}
      <SurahList index={index} />
    </>
  );
}
export { go };
