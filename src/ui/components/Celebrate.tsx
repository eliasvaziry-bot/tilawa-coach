// Celebrations: a card after a quiz or a finished lesson (title, a few lines, Continue), confetti only for big
// moments, and a small banner for a new badge that never blocks a tap. No motion with reduced motion.
import { useEffect, useRef, useState } from 'preact/hooks';

export interface CelebrateInfo {
  title: string;
  lines: string[];
  confetti?: boolean;
}

function Confetti() {
  const colours = ['var(--primary)', 'var(--accent)', 'var(--ok)', 'var(--tj-qalqalah)', 'var(--tj-idgham)'];
  return (
    <div class="confetti" aria-hidden="true">
      {Array.from({ length: 28 }, (_, i) => (
        <i key={i} style={{ left: `${(i * 37) % 100}%`, background: colours[i % colours.length], animationDelay: `${(i % 7) * 0.07}s` }} />
      ))}
    </div>
  );
}

export function Celebrate({ info, onClose }: { info: CelebrateInfo; onClose: () => void }) {
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => btn.current?.focus(), []);
  return (
    <div class="card celebrate" role="status" aria-live="polite">
      {info.confetti ? <Confetti /> : null}
      <h2>{info.title}</h2>
      {info.lines.map((l) => (
        <p key={l} class="celebrate-line">
          {l}
        </p>
      ))}
      <button ref={btn} class="btn primary block" style={{ marginTop: 10 }} onClick={onClose}>
        Continue
      </button>
    </div>
  );
}

/** "New badge" banner: shown once per badge, hides by itself; only its close button takes taps. */
export function BadgeBanner({ badges, onClose }: { badges: { icon: string; title: string }[]; onClose: () => void }) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const t = setTimeout(() => {
      setOpen(false);
      onClose();
    }, 6000);
    return () => clearTimeout(t);
  }, []);
  if (!open || !badges.length) return null;
  return (
    <div class="badge-banner" role="status" aria-live="polite">
      <span class="badge-banner-ico" aria-hidden="true">
        {badges[0]!.icon}
      </span>
      <span class="grow">
        <b>New badge{badges.length > 1 ? 's' : ''}:</b> {badges.map((b) => b.title).join(', ')}
      </span>
      <button
        class="badge-banner-close"
        aria-label="Close"
        onClick={() => {
          setOpen(false);
          onClose();
        }}
      >
        ×
      </button>
    </div>
  );
}
