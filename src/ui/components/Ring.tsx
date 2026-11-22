// A small progress ring (SVG): value of max, with a short label in the middle. Shared by Today and the stage cards.
export function Ring({ value, max, size = 64, label, text }: { value: number; max: number; size?: number; label: string; text: string }) {
  const m = size / 2;
  const r = m - 6;
  const c = 2 * Math.PI * r;
  const f = max > 0 ? Math.min(1, Math.max(0, value / max)) : 0;
  return (
    <svg class="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={label}>
      <circle class="bg" cx={m} cy={m} r={r} />
      <circle class="fg" cx={m} cy={m} r={r} stroke-dasharray={c} stroke-dashoffset={c * (1 - f)} transform={`rotate(-90 ${m} ${m})`} />
      <text x={m} y={m + 4.5} text-anchor="middle">
        {text}
      </text>
    </svg>
  );
}
