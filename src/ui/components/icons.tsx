// Small line icons (own drawings, stroke = currentColor).
const P = { fill: 'none', stroke: 'currentColor', 'stroke-width': 1.8, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' } as const;

export const IconToday = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="5" width="17" height="15" rx="3" {...P} /><path d="M3.5 10h17M8 3v4M16 3v4" {...P} /><circle cx="12" cy="15" r="1.6" fill="currentColor" /></svg>
);
export const IconLearn = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 18.5V6a2 2 0 0 1 2-2h12v13H6a2 2 0 0 0-2 2Zm0 0A2 2 0 0 0 6 20.5h12" {...P} /><path d="M9 8h5" {...P} /></svg>
);
export const IconMushaf = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 6.5C10 5 7 4.5 3.5 5v13c3.5-.5 6.5 0 8.5 1.5 2-1.5 5-2 8.5-1.5V5C17 4.5 14 5 12 6.5Zm0 0V19.5" {...P} /></svg>
);
export const IconPractice = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="9" y="3" width="6" height="11" rx="3" {...P} /><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21M8.5 21h7" {...P} /></svg>
);
export const IconCareer = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7" width="17" height="12.5" rx="2.5" {...P} /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3.5 12.5h17" {...P} /></svg>
);
export const IconMore = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 7h16M4 12h16M4 17h16" {...P} /></svg>
);
export const IconPlay = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5.5v13l11-6.5-11-6.5Z" fill="currentColor" /></svg>
);
export const IconPause = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="5" width="4" height="14" rx="1" fill="currentColor" /><rect x="13.5" y="5" width="4" height="14" rx="1" fill="currentColor" /></svg>
);
export const IconStop = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><rect x="6.5" y="6.5" width="11" height="11" rx="2" fill="currentColor" /></svg>
);
export const IconBack = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true"><path d="M15 5l-7 7 7 7" {...P} /></svg>
);
export const IconMic = IconPractice;
