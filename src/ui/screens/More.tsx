const LINKS: { href: string; title: string; sub: string }[] = [
  { href: '#/settings', title: 'Settings', sub: 'Theme, Quran font size, tajweed, translation, voice, backup' },
  { href: '#/audio', title: 'Audio lab', sub: 'Mic test, levels, latency calibration, pitch, metronome' },
  { href: '#/progress', title: 'Progress', sub: 'Mastery, streak, weak spots' },
  { href: '#/check', title: 'Check', sub: 'Recitation checks (Tier 1)' },
  { href: '#/studio', title: 'Studio', sub: 'Maqam trainer, Style Lab, majlis simulator' },
  { href: '#/library', title: 'Library', sub: 'Imports, channel feeds, studies, recordings' },
  { href: '#/diagnostics', title: 'Diagnostics', sub: 'Device report, CORS checks, report a problem' },
  { href: '#/credits', title: 'About & Credits', sub: 'Sources, licences and attributions' },
];

export default function MoreScreen() {
  return (
    <>
    <div class="task-now" style={{ marginBottom: 14 }}>
      <b>YOUR TASK NOW:</b> if you have not yet, open the Audio lab and calibrate latency once.
    </div>
    <ul class="list card" style={{ padding: '0 12px' }}>
      {LINKS.map((l) => (
        <li key={l.href}>
          <a href={l.href}>
            <span class="grow">
              <b>{l.title}</b>
              <br />
              <span class="small muted">{l.sub}</span>
            </span>
            <span aria-hidden="true">›</span>
          </a>
        </li>
      ))}
    </ul>
    </>
  );
}
