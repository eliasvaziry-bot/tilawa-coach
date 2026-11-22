const PLANNED: Record<string, { milestone: string; what: string }> = {
  check: { milestone: 'M5', what: 'Tier 1 recitation checks (madd length, ghunnah, qalqalah, waqf, tempo) with confidence levels.' },
  studio: { milestone: 'M7–M8', what: 'Maqam trainer, Style Lab and the majlis simulator.' },
  library: { milestone: 'M8', what: 'Your imports, channel feeds, studies, sabks and recordings.' },
  progress: { milestone: 'M4', what: 'Mastery per lesson and stage, streak, retests due, weak spots.' },
};

export default function PlaceholderScreen({ name }: { name: string }) {
  const p = PLANNED[name];
  return (
    <div class="card">
      <h2>{p ? 'Not built yet' : 'Page not found'}</h2>
      <p>{p ? `${p.what} Planned for ${p.milestone}.` : 'This link does not lead anywhere.'}</p>
      <div class="task-now">
        <b>YOUR TASK NOW:</b> go to <a href="#/mushaf/1">Al-Fatiha</a> and listen once with the highlighting.
      </div>
    </div>
  );
}
