import { useEffect } from 'preact/hooks';
import { daysUntil, loadCareer, pack, packState, privateOpps, tracked } from './model.ts';

/** Today screen: the next three deadlines (tracked first) and the next action. */
export function CareerTodayCard() {
  useEffect(() => void loadCareer(), []);
  const tr = tracked.value.filter((t) => t.stage !== 'closed' && t.stage !== 'offer');
  const upcoming = [
    ...tr.map((t) => ({ id: t.id, label: `${t.org} — ${t.title}`, iso: t.deadline, tracked: true })),
    ...[...privateOpps.value, ...(pack.value?.opportunities ?? [])].filter((o) => o.priority === 1 && !tr.some((t) => t.id === o.id)).map((o) => ({ id: o.id, label: `${o.org} — ${o.title}`, iso: o.deadline, tracked: false })),
  ]
    .filter((x) => (daysUntil(x.iso) ?? -1) >= 0)
    .sort((a, b) => a.iso.localeCompare(b.iso))
    .slice(0, 3);
  const nextAction = tr.filter((t) => t.nextAction).sort((a, b) => (a.nextDate || '9999').localeCompare(b.nextDate || '9999'))[0];
  return (
    <div class="card">
      <h2>Career</h2>
      {upcoming.length ? (
        <ul class="small" style={{ paddingLeft: 18, margin: '4px 0 10px' }}>
          {upcoming.map((u) => {
            const d = daysUntil(u.iso)!;
            return (
              <li key={u.id}>
                <span class={d <= 7 ? 'due-soon' : 'due-later'}>{d === 0 ? 'today' : `${d}d`}</span> · {u.label} {u.tracked ? '' : <span class="muted">(not tracked)</span>}
              </li>
            );
          })}
        </ul>
      ) : (
        <p class="small muted">{packState.value === 'locked' ? 'Unlock your career pack in the Career Desk to see deadlines.' : 'No upcoming deadlines.'}</p>
      )}
      <p class="small" style={{ margin: '0 0 4px' }}>
        <b>Next career step:</b> {nextAction ? `${nextAction.nextAction} — ${nextAction.org}` : 'track one opportunity that closes soon.'}
      </p>
      <a class="btn" href="#/career" style={{ marginTop: 10 }}>
        Open Career Desk
      </a>
    </div>
  );
}
