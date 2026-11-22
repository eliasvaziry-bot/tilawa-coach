import { useEffect, useState } from 'preact/hooks';
import { loadSurah, type Ayah } from '../../data/quranData.ts';
import { AyahText } from './AyahText.tsx';

/** Shows one ayah (or a word range of it) loaded from the shipped Tanzil data — Quran text is never typed in code. */
export function QuranSnippet({ surah, ayah, words, tajweed = false, onWord }: { surah: number; ayah: number; words?: [number, number]; tajweed?: boolean; onWord?: (i: number) => void }) {
  const [a, setA] = useState<Ayah | null>(null);
  useEffect(() => {
    let live = true;
    void loadSurah(surah).then((ayat) => live && setA(ayat[ayah - 1] ?? null));
    return () => {
      live = false;
    };
  }, [surah, ayah]);
  if (!a) return <span class="muted small">…</span>;
  return <AyahText ayah={a} tajweed={tajweed} now={null} range={words} splitBasmala={false} showNumber={false} onWord={onWord ? (i) => onWord(i) : undefined} />;
}
