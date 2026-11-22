import { settings, updateSettings, type Settings } from '../state.ts';
import { BackupCard } from '../components/BackupCard.tsx';
import { ReminderCard } from '../components/ReminderCard.tsx';
import { QuranSnippet } from '../components/QuranSnippet.tsx';
import { TeacherReviewCard } from '../components/TeacherReviewCard.tsx';

export default function SettingsScreen() {
  const s = settings.value;
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => updateSettings({ [k]: v } as Partial<Settings>);
  return (
    <>
      <div class="task-now" style={{ marginBottom: 14 }}>
        <b>YOUR TASK NOW:</b> pick a Quran text size you can read without squinting, then go back to Today.
      </div>
      <div class="card">
        <h2>Reading</h2>
        <label class="field">
          <span>Quran text size: {s.quranSize}px</span>
          <input type="range" min={24} max={60} step={1} value={s.quranSize} onInput={(e) => set('quranSize', Number(e.currentTarget.value))} />
        </label>
        <QuranSnippet surah={1} ayah={1} tajweed={s.tajweed} />
        <p class="small muted" style={{ marginTop: 0 }}>Preview: 1:1, loaded from the Tanzil text.</p>
        <label class="row">
          <input type="checkbox" checked={s.tajweed} onChange={(e) => set('tajweed', e.currentTarget.checked)} /> Tajweed colours
        </label>
        <label class="row">
          <input type="checkbox" checked={s.colourBlind} onChange={(e) => set('colourBlind', e.currentTarget.checked)} /> Colour-blind-safe mode (colour + line style; tap a word for labels)
        </label>
        <label class="field">
          <span>Translation (hidden until you tap "Meaning")</span>
          <select value={s.translation} onChange={(e) => set('translation', e.currentTarget.value as Settings['translation'])}>
            <option value="">None</option>
            <option value="en.qarai">English — Ali Quli Qarai</option>
            <option value="en.shakir">English — M. H. Shakir</option>
          </select>
        </label>
      </div>
      <div class="card">
        <h2>Voice</h2>
        <label class="field">
          <span>Reference recitation</span>
          <select value={s.voice} onChange={(e) => set('voice', e.currentTarget.value as Settings['voice'])}>
            <option value="murattal">Sheikh al-Minshawi — murattal (exact reference)</option>
            <option value="mujawwad">Sheikh al-Minshawi — mujawwad (Stage 3)</option>
          </select>
        </label>
        <label class="field">
          <span>Playback speed: {s.rate}× (pitch is kept)</span>
          <input type="range" min={0.5} max={1} step={0.05} value={s.rate} onInput={(e) => set('rate', Number(e.currentTarget.value))} />
        </label>
      </div>
      <div class="card">
        <h2>Learning</h2>
        <label class="row">
          <input type="checkbox" checked={s.fastTrack} onChange={(e) => set('fastTrack', e.currentTarget.checked)} /> I already read Persian/Urdu script (fast-track — explained in Stage 0, lesson 4)
        </label>
        <label class="row">
          <input type="checkbox" checked={s.handsFree} onChange={(e) => set('handsFree', e.currentTarget.checked)} /> Hands-free mode (big buttons, auto-advance, spoken prompts)
        </label>
        <label class="row">
          <input type="checkbox" checked={s.gameSounds} onChange={(e) => set('gameSounds', e.currentTarget.checked)} /> Game sounds (a short tone for right, wrong and finished)
        </label>
      </div>
      <div class="card">
        <h2>Appearance</h2>
        <div class="row" role="radiogroup" aria-label="Theme">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button key={t} class={`btn small${s.theme === t ? ' primary' : ''}`} role="radio" aria-checked={s.theme === t} onClick={() => set('theme', t)}>
              {t === 'system' ? 'Match phone' : t[0]!.toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </div>
      <ReminderCard />
      <BackupCard />
      <TeacherReviewCard />
      <div class="card">
        <h2>Audio calibration</h2>
        <p class="small">Latency, levels and voice range live in the Audio lab.</p>
        <a class="btn" href="#/audio">Open Audio lab</a>
      </div>
    </>
  );
}
