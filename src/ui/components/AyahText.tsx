import { useLayoutEffect, useMemo, useRef } from 'preact/hooks';
import type { Ayah } from '../../data/quranData.ts';
import { arabicNumber } from '../../data/quranData.ts';
import type { DisplayWord } from '../../data/quranText.ts';
import { clearOwner, clusterBoundary, highlightSupported, piecesForWord, setOwnerRanges } from '../tajweedPaint.ts';
import { ANN_FLAGS } from '../../data/rules.ts';
import { ReviewBadge } from './ReviewBadge.tsx';

const WASL_OR_WAQF = ANN_FLAGS.WASL_ONLY | ANN_FLAGS.WAQF_ONLY;

interface Props {
  ayah: Ayah;
  tajweed: boolean;
  /** display-word index currently sounding (or null) */
  now: number | null;
  onWord?: (displayIndex: number, el: HTMLElement) => void;
  /** show the basmala prefix as its own centred line (ayah 1 of surahs 2–114 except 9) */
  splitBasmala?: boolean;
  /** only render words [from, to) of the recited words (call-and-response phrases) */
  range?: [number, number];
  showNumber?: boolean;
}

/**
 * Fallback for browsers without the CSS Highlight API: never split the word. Overlay a full copy of the word in the
 * rule colour, clipped horizontally to the boxes of the rule's characters (Range.getClientRects on the untouched
 * text node). Shaping is identical by construction; tests/e2e/shaping.spec.ts checks widths in Chromium + WebKit.
 */
function paintOverlays(root: HTMLElement, words: DisplayWord[], ayah: Ayah): void {
  root.querySelectorAll('.tjo').forEach((o) => o.remove());
  root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
    const w = words[Number(el.dataset.w)];
    const node = el.firstChild;
    if (!w || !node || node.nodeType !== Node.TEXT_NODE) return;
    const base = el.getBoundingClientRect();
    for (const p of piecesForWord(w, ayah.annotations)) {
      const s = clusterBoundary(w.text, p.start);
      const e = Math.max(s + 1, clusterBoundary(w.text, p.end));
      const r = document.createRange();
      r.setStart(node, Math.min(s, w.text.length));
      r.setEnd(node, Math.min(e, w.text.length));
      for (const box of r.getClientRects()) {
        const o = document.createElement('span');
        o.className = `tjo tjf-${p.key.replace(/^tj-/, '')}`;
        o.textContent = w.text;
        o.setAttribute('aria-hidden', 'true');
        o.style.clipPath = `inset(-0.6em ${Math.max(0, base.right - box.right)}px -0.6em ${Math.max(0, box.left - base.left)}px)`;
        el.appendChild(o);
      }
    }
  });
}

export function AyahText({ ayah, tajweed, now, onWord, splitBasmala = true, range, showNumber = true }: Props) {
  const ref = useRef<HTMLDivElement>(null);
  const owner = useMemo(() => ({}), []);
  const hl = highlightSupported();
  const bsm = splitBasmala ? ayah.basmalaWords : 0;
  const words = ayah.words;
  const shown = range ? words.slice(ayah.basmalaWords + range[0], ayah.basmalaWords + range[1]) : words.slice(bsm);

  useLayoutEffect(() => {
    const root = ref.current;
    if (root && !hl) {
      if (tajweed) paintOverlays(root, words, ayah);
      else root.querySelectorAll('.tjo').forEach((o) => o.remove());
    }
    if (!root || !hl || !tajweed) {
      clearOwner(owner);
      return;
    }
    const items: { key: string; range: Range }[] = [];
    root.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
      const w = words[Number(el.dataset.w)];
      const node = el.firstChild;
      if (!w || !node || node.nodeType !== Node.TEXT_NODE) return;
      for (const p of piecesForWord(w, ayah.annotations)) {
        const r = document.createRange();
        r.setStart(node, p.start);
        r.setEnd(node, p.end);
        items.push({ key: p.key, range: r });
        if (p.ann.flags & WASL_OR_WAQF) items.push({ key: 'tj-wasl', range: r.cloneRange() });
      }
    });
    setOwnerRanges(owner, items);
    return () => clearOwner(owner);
  }, [ayah, tajweed, hl, range?.[0], range?.[1], bsm]);

  const renderWord = (w: DisplayWord) => (
    <>
      {w.marksBefore ? <span class="pm" aria-hidden="true">{w.marksBefore}</span> : null}
      <span
        class={`w${now === w.index ? ' now' : ''}`}
        data-w={w.index}
        role="button"
        tabIndex={0}
        aria-label={w.text}
        onClick={(e) => onWord?.(w.index, e.currentTarget as HTMLElement)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onWord?.(w.index, e.currentTarget as HTMLElement);
          }
        }}
      >
        {w.text}
      </span>
      {w.marksAfter ? <span class="pm" aria-hidden="true">{w.marksAfter}</span> : null}{' '}
    </>
  );

  return (
    <div ref={ref} lang="ar" dir="rtl">
      {bsm > 0 && !range ? <div class="basmala quran">{words.slice(0, bsm).map(renderWord)}</div> : null}
      {bsm > 0 && !range && words[0]?.text.includes('\u0651') ? (
        <p class="small muted" dir="ltr" style={{ textAlign: 'center', margin: '-6px 0 8px' }}>
          The shadda on the first letter is for joining from the end of the previous surah; starting here, read it without
          doubling. <ReviewBadge />
        </p>
      ) : null}
      <p class="quran" style={{ margin: 0 }}>
        {shown.map(renderWord)}
        {showNumber && !range ? <span class="ayah-end" aria-label={`ayah ${ayah.ayah}`}>{'۝' + arabicNumber(ayah.ayah)}</span> : null}
      </p>
    </div>
  );
}
