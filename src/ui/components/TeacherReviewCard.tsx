// In-app Teacher Review export (B7): one printable page with every rule definition + counts, all model-knowledge
// items in the lessons, and the disputed rule locations, each with a checkbox and space for corrections.
import { RULES } from '../../data/rules.ts';
import { loadAllLessons } from '../../content/lessons.ts';
import { shareOrDownload } from '../../data/backup.ts';
import { say } from '../state.ts';

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

async function buildHtml(): Promise<string> {
  let disputes: { ayatCompared: number; total: number; groups: { side: string; rule: string; count: number; examples: string[] }[] } | null = null;
  try {
    const r = await fetch(`${import.meta.env.BASE_URL}data/review/disputes-summary.json`);
    if (r.ok) disputes = await r.json();
  } catch {
    /* offline: section omitted */
  }
  const mk: { lesson: string; text: string }[] = [];
  for (const l of await loadAllLessons()) {
    if (l.reviewStatus === 'teacher-approved') continue;
    const walk = (n: unknown) => {
      if (Array.isArray(n)) n.forEach(walk);
      else if (n && typeof n === 'object') {
        const o = n as Record<string, unknown> & { provenance?: { kind: string }; text?: string; q?: string };
        if (o.provenance?.kind === 'model-knowledge') mk.push({ lesson: l.title, text: String(o.text ?? o.q ?? '') });
        Object.entries(o).forEach(([k, v]) => k !== 'provenance' && walk(v));
      }
    };
    walk(l);
  }
  const row = (cells: string[]) => `<tr><td class="box">☐</td>${cells.map((c) => `<td>${c}</td>`).join('')}<td class="fix"></td></tr>`;
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>Tilawa Coach — teacher review</title>
<style>body{font:14px/1.45 -apple-system,Segoe UI,sans-serif;margin:24px;color:#111}h1{font-size:20px}h2{font-size:16px;margin-top:22px}
table{border-collapse:collapse;width:100%}td,th{border:1px solid #bbb;padding:6px;vertical-align:top}.box{width:22px;text-align:center}.fix{width:28%}
.ar{font-family:'Amiri Quran','Geeza Pro',serif;font-size:20px;direction:rtl}</style></head><body>
<h1>Tilawa Coach — items for a qualified teacher (Hafs 'an 'Asim, ash-Shatibiyyah)</h1>
<p>Tick ☐ if correct, or write the correction. Generated ${new Date().toISOString().slice(0, 10)}.</p>
<h2>A. Rule definitions and counts</h2><table><tr><th></th><th>Rule</th><th>Counts</th><th>What the app says</th><th>Correction</th></tr>
${RULES.map((r) => row([`${esc(r.en)} <span class="ar">${r.ar}</span>`, r.counts ?? '–', esc(r.gloss)])).join('')}</table>
<h2>B. Lesson items written from general knowledge (${mk.length})</h2><table><tr><th></th><th>Lesson</th><th>Text</th><th>Correction</th></tr>
${mk.map((m) => row([esc(m.lesson), esc(m.text)])).join('')}</table>
${disputes ? `<h2>C. Disputed rule locations — two data sources disagree (${disputes.total} of ${disputes.ayatCompared} ayat compared)</h2><table><tr><th></th><th>Which source</th><th>Rule</th><th>Count · examples</th><th>Which is right?</th></tr>
${disputes.groups.map((g) => row([g.side === 'ours-only' ? 'only cpfair (shown in app)' : 'only Quran.com', esc(g.rule), `${g.count} · <span class="ar">${g.examples.map(esc).join(' · ')}</span>`])).join('')}</table>` : '<p>(Disputes summary unavailable offline.)</p>'}
</body></html>`;
}

export function TeacherReviewCard() {
  return (
    <div class="card">
      <h2>Teacher review</h2>
      <p class="small">A printable page for a qualified teacher: every rule definition, everything written from general knowledge, and the places where two tajweed data sources disagree. Corrections go into FEEDBACK.md.</p>
      <button
        class="btn"
        onClick={async () => {
          try {
            await shareOrDownload('tilawa-teacher-review.html', 'text/html', await buildHtml());
          } catch (e) {
            say(`Could not build the page: ${e instanceof Error ? e.message : String(e)}`);
          }
        }}
      >
        Export for my teacher
      </button>
    </div>
  );
}
