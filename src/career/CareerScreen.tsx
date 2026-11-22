// Career Desk (CAREER_BRIEF.md): sourced opportunities, tracker, application packs, email drafter, pathways and
// a paste-an-email deadline finder. Everything personal stays in IndexedDB on this phone.
import { useEffect, useMemo, useState } from 'preact/hooks';
import { route, say } from '../ui/state.ts';
import { buildIcs } from '../ui/ics.ts';
import { shareOrDownload } from '../data/backup.ts';
import {
  pack,
  packState,
  packUpdate,
  unlockPack,
  STAGES,
  STAGE_LABEL,
  daysUntil,
  loadCareer,
  privateOpps,
  profile,
  removeTracked,
  savePrivateOpps,
  saveProfile,
  saveTracked,
  track,
  tracked,
  type Opportunity,
  type Profile,
  type Tracked,
} from './model.ts';
import { QUESTIONS, TEMPLATES, findDates, mailto, wordCount } from './text.ts';

const TABS = [
  ['opps', 'Opportunities'],
  ['tracker', 'Tracker'],
  ['apply', 'Apply'],
  ['email', 'Email'],
  ['paths', 'Pathways'],
  ['inbox', 'Inbox help'],
  ['me', 'My profile'],
] as const;

function Due({ iso, note }: { iso: string; note?: string }) {
  const d = daysUntil(iso);
  if (d === null) return <span class="due-later">{note || 'No fixed deadline'}</span>;
  if (d < 0) return <span class="due-later">Closed {iso}</span>;
  return <span class={d <= 7 ? 'due-soon' : 'due-later'}>{d === 0 ? 'Closes today' : `${d} day${d === 1 ? '' : 's'} left`} · {iso}</span>;
}

function deadlineIcs(o: { id: string; org: string; title: string; deadline: string; url: string }): string {
  return buildIcs([{ uid: `tc-deadline-${o.id}@tilawa-coach`, title: `Deadline: ${o.org} — ${o.title}`, description: o.url, url: o.url, date: o.deadline, alarmMinutesBefore: 2 * 24 * 60 }], 'Career deadlines');
}

function Opportunities() {
  const [trackFilter, setTrackFilter] = useState('all');
  const [soon, setSoon] = useState(false);
  const all = [...privateOpps.value, ...(pack.value?.opportunities ?? [])];
  const tracks = ['all', ...Array.from(new Set(all.map((o) => o.track)))];
  const list = all
    .filter((o) => (trackFilter === 'all' || o.track === trackFilter) && (!soon || ((daysUntil(o.deadline) ?? 999) <= 21 && (daysUntil(o.deadline) ?? -1) >= 0)))
    .filter((o) => (daysUntil(o.deadline) ?? 0) >= 0)
    .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999') || a.priority - b.priority);
  const isTracked = (id: string) => tracked.value.some((t) => t.id === id);
  return (
    <>
      <div class="card">
        <div class="task-now">
          <b>YOUR TASK NOW:</b> tap <b>Track</b> on the two closest deadlines you are eligible for, then open their pages.
        </div>
        <p class="small muted">
          Checked {pack.value?.generated ?? '–'} from the pages linked on each card. Dates change — always confirm on the official page. Not advice from a licensed careers adviser.
        </p>
        <div class="tabs">
          {tracks.map((t) => (
            <button key={t} class={`chip${trackFilter === t ? ' primary' : ''}`} style={trackFilter === t ? { background: 'var(--primary)', color: 'var(--primary-ink)' } : undefined} onClick={() => setTrackFilter(t)}>
              {t}
            </button>
          ))}
        </div>
        <label class="row small" style={{ marginTop: 6 }}>
          <input type="checkbox" checked={soon} onChange={(e) => setSoon(e.currentTarget.checked)} /> Closing in the next 3 weeks
        </label>
      </div>
      {list.map((o) => (
        <div class="opp" key={o.id}>
          <div class="row">
            <h3 class="grow">
              {o.org} — {o.title}
            </h3>
          </div>
          <div class="small">
            <span class="chip">{o.kind}</span> <span class="chip">{o.track}</span> {o.private ? <span class="chip">private</span> : null}{' '}
            <span class="chip" title={o.verified}>{o.verified === 'opened-official' ? 'official page' : o.verified === 'opened-third-party' ? 'third-party source' : 'unverified'}</span>
          </div>
          <p class="small" style={{ margin: '6px 0' }}>
            <Due iso={o.deadline} note={o.deadlineNote} />
            {o.deadline && o.deadlineNote ? <span class="muted"> · {o.deadlineNote}</span> : null}
          </p>
          <p class="small" style={{ margin: '4px 0' }}>{o.eligibility}</p>
          {o.pay ? <p class="small" style={{ margin: '4px 0' }}>Pay: {o.pay}</p> : null}
          <p class="small muted" style={{ margin: '4px 0' }}>{o.notes}</p>
          <div class="row">
            <button class={`btn small${isTracked(o.id) ? '' : ' primary'}`} disabled={isTracked(o.id)} onClick={() => void saveTracked(track(o)).then(() => say(`Tracking ${o.org}.`))}>
              {isTracked(o.id) ? 'Tracked' : 'Track'}
            </button>
            {o.deadline ? (
              <button class="btn small" onClick={() => void shareOrDownload(`deadline-${o.id}.ics`, 'text/calendar', deadlineIcs(o))}>
                Add to calendar
              </button>
            ) : null}
            <a class="btn small ghost" href={o.url} target="_blank" rel="noopener">
              Open page
            </a>
          </div>
          <p class="small muted" style={{ margin: '6px 0 0' }}>
            Source: <a href={o.source.url} target="_blank" rel="noopener">{o.source.title || o.source.url}</a> (checked {o.source.accessed})
          </p>
        </div>
      ))}
      <div class="card">
        <h2>Your private list</h2>
        <p class="small">Import a private JSON list (e.g. university-specific items). It stays on this phone.</p>
        <label class="btn small">
          Import private list…
          <input
            type="file"
            accept="application/json,.json"
            class="sr-only"
            onChange={async (e) => {
              const f = e.currentTarget.files?.[0];
              if (!f) return;
              try {
                const j = JSON.parse(await f.text()) as { items: Opportunity[] };
                await savePrivateOpps(j.items);
                say(`Imported ${j.items.length} private items.`);
              } catch {
                say('That file is not an opportunity list.');
              }
            }}
          />
        </label>
      </div>
    </>
  );
}

function Tracker() {
  const [custom, setCustom] = useState('');
  const move = (t: Tracked, dir: 1 | -1) => {
    const i = STAGES.indexOf(t.stage);
    const next = STAGES[Math.max(0, Math.min(STAGES.length - 1, i + dir))]!;
    void saveTracked({ ...t, stage: next });
  };
  return (
    <>
      <div class="task-now" style={{ marginBottom: 12 }}>
        <b>YOUR TASK NOW:</b> give each card a next action with a date.
      </div>
      <div class="kanban" role="list">
        {STAGES.map((st) => (
          <section key={st} role="listitem" aria-label={STAGE_LABEL[st]}>
            <h3 style={{ margin: '0 0 8px' }}>
              {STAGE_LABEL[st]} <span class="muted small">({tracked.value.filter((t) => t.stage === st).length})</span>
            </h3>
            {tracked.value
              .filter((t) => t.stage === st)
              .sort((a, b) => (a.deadline || '9999').localeCompare(b.deadline || '9999'))
              .map((t) => (
                <div class="opp" key={t.id}>
                  <b>{t.org}</b>
                  <div class="small">{t.title}</div>
                  <div class="small">
                    <Due iso={t.deadline} />
                  </div>
                  <label class="field">
                    <span class="small muted">Next action</span>
                    <input value={t.nextAction} onChange={(e) => void saveTracked({ ...t, nextAction: e.currentTarget.value })} />
                  </label>
                  <label class="field">
                    <span class="small muted">By</span>
                    <input type="date" value={t.nextDate} onChange={(e) => void saveTracked({ ...t, nextDate: e.currentTarget.value })} />
                  </label>
                  <div class="row">
                    <button class="btn small" aria-label="Move back" onClick={() => move(t, -1)}>←</button>
                    <button class="btn small" aria-label="Move forward" onClick={() => move(t, 1)}>→</button>
                    <a class="btn small ghost" href={`#/career/apply/${encodeURIComponent(t.id)}`}>Pack</a>
                    <button class="btn small ghost" onClick={() => void removeTracked(t.id)}>Remove</button>
                  </div>
                </div>
              ))}
          </section>
        ))}
      </div>
      <div class="card">
        <label class="field">
          <span>Add your own (e.g. a society role, a hospital volunteering form)</span>
          <input value={custom} onInput={(e) => setCustom(e.currentTarget.value)} placeholder="Organisation — what" />
        </label>
        <button
          class="btn small"
          disabled={!custom.trim()}
          onClick={() => {
            const [org, ...rest] = custom.split('—');
            void saveTracked({ id: `custom-${Date.now()}`, org: org!.trim(), title: rest.join('—').trim() || 'Application', deadline: '', url: '', stage: 'interested', notes: '', nextAction: '', nextDate: '', checklist: {}, answers: {} });
            setCustom('');
          }}
        >
          Add
        </button>
      </div>
    </>
  );
}

const CHECKS = ['Eligibility checked', 'CV updated for this role', 'Answers drafted (below)', 'Online tests practised', 'Read about the firm (one recent story)', 'Submitted', 'Confirmation email saved'];

function Apply() {
  const id = route.value.parts[2] ? decodeURIComponent(route.value.parts[2]) : tracked.value[0]?.id;
  const t = tracked.value.find((x) => x.id === id);
  if (!t)
    return (
      <div class="card">
        <p>Track an opportunity first, then open its application pack here.</p>
        <div class="task-now">
          <b>YOUR TASK NOW:</b> go to <a href="#/career/opps">Opportunities</a> and tap Track.
        </div>
      </div>
    );
  const stories = profile.value.stories;
  return (
    <>
      <div class="card">
        <label class="field">
          <span class="small muted">Application pack for</span>
          <select value={t.id} onChange={(e) => (location.hash = `#/career/apply/${encodeURIComponent(e.currentTarget.value)}`)}>
            {tracked.value.map((x) => (
              <option key={x.id} value={x.id}>
                {x.org} — {x.title}
              </option>
            ))}
          </select>
        </label>
        <p class="small">
          <Due iso={t.deadline} /> {t.url ? <a href={t.url} target="_blank" rel="noopener">Open the application</a> : null}
        </p>
        <p class="small muted">
          Simple version: fill in each answer here → copy one field at a time into their form → you press Submit. The app never submits for you.
        </p>
      </div>
      <div class="card">
        <h2>Checklist</h2>
        {CHECKS.map((c) => (
          <label class="row small" key={c}>
            <input type="checkbox" checked={!!t.checklist[c]} onChange={(e) => void saveTracked({ ...t, checklist: { ...t.checklist, [c]: e.currentTarget.checked } })} /> {c}
          </label>
        ))}
      </div>
      {QUESTIONS.map((q) => {
        const ans = t.answers[q.id] ?? '';
        const wc = wordCount(ans);
        return (
          <div class="card" key={q.id}>
            <h3 style={{ marginTop: 0 }}>{q.q}</h3>
            <p class="small muted">{q.hint}</p>
            {stories.length ? (
              <details class="small">
                <summary>Use one of my stories</summary>
                {stories.map((s, i) => (
                  <button
                    key={i}
                    class="btn small ghost"
                    onClick={() =>
                      void saveTracked({ ...t, answers: { ...t.answers, [q.id]: `${ans ? `${ans}\n\n` : ''}${s.situation} ${s.task} ${s.action} ${s.result}`.trim() } })
                    }
                  >
                    {s.title}
                  </button>
                ))}
              </details>
            ) : null}
            <textarea
              aria-label={q.q}
              value={ans}
              onChange={(e) => void saveTracked({ ...t, answers: { ...t.answers, [q.id]: e.currentTarget.value.replace(/\{org\}/g, t.org) } })}
              placeholder={`Write it in your own words. Use {org} for ${t.org}.`}
              style={{ width: '100%', minHeight: 120 }}
            />
            <div class="row small">
              <span class={wc > q.limit ? 'due-soon' : 'muted'}>
                {wc}/{q.limit} words
              </span>
              <button class="btn small" disabled={!ans} onClick={() => void navigator.clipboard?.writeText(ans).then(() => say('Copied.'))}>
                Copy
              </button>
            </div>
          </div>
        );
      })}
    </>
  );
}

function Email() {
  const [tid, setTid] = useState(TEMPLATES[0]!.id);
  const [fields, setFields] = useState<Record<string, string>>({});
  const [to, setTo] = useState('');
  const t = TEMPLATES.find((x) => x.id === tid)!;
  const me = { name: profile.value.name, course: profile.value.course, university: profile.value.university, year: profile.value.year };
  const subject = t.subject(fields);
  const body = t.body(fields, me);
  return (
    <>
      <div class="card">
        <div class="task-now">
          <b>YOUR TASK NOW:</b> pick a template, fill the blanks, then press "Open in Mail" and send it yourself.
        </div>
        <label class="field">
          <span>Template</span>
          <select value={tid} onChange={(e) => setTid(e.currentTarget.value)}>
            {TEMPLATES.map((x) => (
              <option key={x.id} value={x.id}>
                {x.name}
              </option>
            ))}
          </select>
        </label>
        <label class="field">
          <span>Their e-mail address (optional)</span>
          <input type="email" value={to} onInput={(e) => setTo(e.currentTarget.value)} />
        </label>
        {t.fields.map((f) => (
          <label class="field" key={f.key}>
            <span>{f.label}</span>
            <input value={fields[f.key] ?? ''} placeholder={f.placeholder} onInput={(e) => setFields({ ...fields, [f.key]: e.currentTarget.value })} />
          </label>
        ))}
        {!me.name ? <p class="small muted">Tip: add your name and course in "My profile" to fill the signature.</p> : null}
      </div>
      <div class="card">
        <p class="small">
          <b>Subject:</b> {subject}
        </p>
        <pre class="draft">{body}</pre>
        <div class="row">
          <a class="btn primary" href={mailto(to, subject, body)}>
            Open in Mail
          </a>
          <button class="btn" onClick={() => void navigator.clipboard?.writeText(`${subject}\n\n${body}`).then(() => say('Copied.'))}>
            Copy
          </button>
        </div>
        <p class="small muted">Read it once and make one sentence truly yours before sending.</p>
      </div>
    </>
  );
}

function Pathways() {
  return (
    <>
      <div class="card">
        <p class="small" style={{ margin: 0 }}>
          Simple version: each line shows the route as arrows. Then the facts, each with its source. Items marked [extra] could not be fully verified.
        </p>
      </div>
      {(pack.value?.pathways ?? []).map((p) => (
        <details class="card" key={p.id}>
          <summary>
            <b>{p.name}</b>
            <div class="small">{p.route}</div>
          </summary>
          <p class="small">
            <b>Start:</b> {p.startPay}
            <br />
            <b>Later:</b> {p.laterPay}
          </p>
          <ul class="small">
            {p.facts.map((f, i) => (
              <li key={i}>
                {f.text}{' '}
                <a href={f.sourceUrl} target="_blank" rel="noopener">
                  ({f.sourceTitle})
                </a>
              </li>
            ))}
            {p.uncertain.map((u, i) => (
              <li key={`u${i}`} class="muted">
                [extra] {u}
              </li>
            ))}
          </ul>
        </details>
      ))}
    </>
  );
}

function Inbox() {
  const [text, setText] = useState('');
  const found = useMemo(() => findDates(text), [text]);
  return (
    <>
      <div class="card">
        <h2>Paste an email</h2>
        <p class="small">
          It finds dates and deadlines so you can add them to your tracker or calendar. Nothing is sent anywhere.
        </p>
        <textarea aria-label="Email text" value={text} onInput={(e) => setText(e.currentTarget.value)} style={{ width: '100%', minHeight: 160 }} placeholder="Paste the email text here" />
      </div>
      {found.length ? (
        <div class="card">
          <h2>Found</h2>
          {found.map((d, i) => (
            <div class="opp" key={i}>
              <b>{d.isDeadline ? 'Deadline' : 'Date'}: {d.iso}</b> <span class="small muted">({d.text})</span>
              <p class="small">{d.context}</p>
              <div class="row">
                <button
                  class="btn small"
                  onClick={() =>
                    void saveTracked({ id: `email-${d.iso}-${i}`, org: 'From email', title: d.context.slice(0, 80), deadline: d.iso, url: '', stage: 'interested', notes: d.context, nextAction: 'Reply / act', nextDate: d.iso, checklist: {}, answers: {} }).then(() => say('Added to tracker.'))
                  }
                >
                  Add to tracker
                </button>
                <button class="btn small" onClick={() => void shareOrDownload(`email-date-${d.iso}.ics`, 'text/calendar', buildIcs([{ uid: `tc-email-${d.iso}-${i}@tilawa-coach`, title: d.context.slice(0, 60) || 'Email deadline', date: d.iso, alarmMinutesBefore: 24 * 60 }], 'From email'))}>
                  Add to calendar
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : text ? (
        <p class="small muted">No dates found.</p>
      ) : null}
      <div class="card">
        <h2>Want Claude to read your university inbox?</h2>
        <p class="small">
          This app cannot log in to a university mailbox (that needs a server and university approval). Claude can, if you connect a
          Microsoft 365 / Outlook connector in the Claude app — then ask it to find deadlines and draft replies. It still will not send without
          you.
        </p>
      </div>
    </>
  );
}

function Me() {
  const [p, setP] = useState<Profile>(profile.value);
  useEffect(() => setP(profile.value), [profile.value]);
  const f = (k: keyof Profile) => (e: Event) => setP({ ...p, [k]: (e.currentTarget as HTMLInputElement).value });
  return (
    <>
      <div class="card">
        <h2>My profile (on this phone only)</h2>
        {(['name', 'university', 'course', 'year', 'email', 'interests'] as const).map((k) => (
          <label class="field" key={k}>
            <span>{k[0]!.toUpperCase() + k.slice(1)}</span>
            <input value={p[k]} onInput={f(k)} />
          </label>
        ))}
        <button class="btn primary" onClick={() => void saveProfile(p).then(() => say('Saved on this phone.'))}>
          Save
        </button>
      </div>
      <div class="card">
        <h2>My stories (STAR)</h2>
        <p class="small muted">Write 4–6 true stories once (team sport, part-time job, a hard module, leading something). Reuse them in every application.</p>
        {p.stories.map((s, i) => (
          <details class="opp" key={i}>
            <summary>
              <b>{s.title || `Story ${i + 1}`}</b>
            </summary>
            {(['title', 'situation', 'task', 'action', 'result'] as const).map((k) => (
              <label class="field" key={k}>
                <span class="small">{k}</span>
                <textarea
                  value={s[k]}
                  onInput={(e) => {
                    const stories = [...p.stories];
                    stories[i] = { ...s, [k]: e.currentTarget.value };
                    setP({ ...p, stories });
                  }}
                />
              </label>
            ))}
          </details>
        ))}
        <div class="row">
          <button class="btn small" onClick={() => setP({ ...p, stories: [...p.stories, { title: '', situation: '', task: '', action: '', result: '' }] })}>
            Add a story
          </button>
          <button class="btn small primary" onClick={() => void saveProfile(p).then(() => say('Saved.'))}>
            Save stories
          </button>
          <label class="btn small ghost">
            Import profile…
            <input
              type="file"
              class="sr-only"
              accept="application/json,.json"
              onChange={async (e) => {
                const file = e.currentTarget.files?.[0];
                if (!file) return;
                try {
                  const j = JSON.parse(await file.text()) as Partial<Profile>;
                  const merged = { ...p, ...j, stories: [...p.stories, ...(j.stories ?? [])] };
                  setP(merged);
                  await saveProfile(merged);
                  say('Profile imported.');
                } catch {
                  say('That is not a profile file.');
                }
              }}
            />
          </label>
        </div>
      </div>
    </>
  );
}

function Unlock({ update = false }: { update?: boolean }) {
  const [pass, setPass] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div class="card">
      <h2>{update ? 'New opportunities available' : 'Unlock your career pack'}</h2>
      <p class="small">
        {update
          ? 'Your list was updated on the website. Type your passphrase to load the new version on this phone.'
          : 'Your opportunity list, pay pathways and profile are encrypted, so the public website reveals nothing about you. Type your passphrase once; the unlocked pack stays on this phone.'}
      </p>
      <label class="field">
        <span>Passphrase</span>
        <input type="password" autocomplete="off" autocapitalize="none" value={pass} onInput={(e) => setPass(e.currentTarget.value)} />
      </label>
      <button
        class="btn primary"
        disabled={busy || !pass.trim()}
        onClick={async () => {
          setBusy(true);
          const ok = await unlockPack(pass);
          setBusy(false);
          say(ok ? 'Unlocked on this phone.' : 'That passphrase did not work.');
        }}
      >
        {busy ? 'Unlocking…' : 'Unlock'}
      </button>
      <p class="small muted">Tracker, email drafts and inbox help work without unlocking.</p>
    </div>
  );
}

export default function CareerScreen() {
  useEffect(() => void loadCareer(), []);
  const tab = route.value.parts[1] ?? 'opps';
  const needsPack = (tab === 'opps' || tab === 'paths') && packState.value !== 'unlocked';
  if (needsPack && packState.value === 'loading') return <p class="muted">Loading…</p>;
  return (
    <>
      <nav class="tabs" aria-label="Career sections">
        {TABS.map(([id, label]) => (
          <a key={id} class={`btn small${tab === id ? ' primary' : ''}`} href={`#/career/${id}`} aria-current={tab === id ? 'page' : undefined} style={{ whiteSpace: 'nowrap' }}>
            {label}
          </a>
        ))}
      </nav>
      {!needsPack && packUpdate.value && (tab === 'opps' || tab === 'paths') ? <Unlock update /> : null}
      {needsPack ? <Unlock /> : tab === 'tracker' ? <Tracker /> : tab === 'apply' ? <Apply /> : tab === 'email' ? <Email /> : tab === 'paths' ? <Pathways /> : tab === 'inbox' ? <Inbox /> : tab === 'me' ? <Me /> : <Opportunities />}
    </>
  );
}
