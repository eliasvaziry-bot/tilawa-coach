import { useState } from 'preact/hooks';
import { dailyReminder } from '../ics.ts';
import { shareOrDownload } from '../../data/backup.ts';

export function ReminderCard() {
  const [time, setTime] = useState('07:30');
  return (
    <div class="card">
      <h2>Daily reminder</h2>
      <p class="small">Adds a repeating event to your calendar with a link back here (no notifications server needed).</p>
      <div class="row">
        <label class="field grow" style={{ margin: 0 }}>
          <span class="small muted">Time</span>
          <input type="time" value={time} onInput={(e) => setTime(e.currentTarget.value)} />
        </label>
        <button class="btn primary" onClick={() => void shareOrDownload('tilawa-daily.ics', 'text/calendar', dailyReminder(time, location.href.split('#')[0] + '#/today'))}>
          Add to my calendar
        </button>
      </div>
    </div>
  );
}
