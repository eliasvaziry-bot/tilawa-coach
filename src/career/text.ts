// Pure text helpers for the Career Desk: find dates/deadlines in a pasted email, email templates, word counts.

const MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august', 'september', 'october', 'november', 'december'];
const MON = (s: string) => MONTHS.findIndex((m) => m.startsWith(s.toLowerCase().slice(0, 3)));

export interface FoundDate {
  iso: string; // YYYY-MM-DD
  text: string; // the matched text
  context: string; // the sentence around it
  isDeadline: boolean;
}

/** Dates in free text: "21 November 2026", "Nov 21", "21/11/2026", "2026-11-21", "21st Nov". UK day-first. */
export function findDates(text: string, today = new Date()): FoundDate[] {
  const out: FoundDate[] = [];
  const push = (y: number, m: number, d: number, idx: number, len: number) => {
    if (m < 0 || m > 11 || d < 1 || d > 31) return;
    const iso = `${y}-${String(m + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const start = Math.max(0, text.lastIndexOf('.', idx) + 1, text.lastIndexOf('\n', idx) + 1);
    const endDot = text.indexOf('.', idx + len);
    const endNl = text.indexOf('\n', idx + len);
    const end = Math.min(...[endDot, endNl, text.length].filter((x) => x >= 0));
    const context = text.slice(start, end).trim();
    if (!out.some((o) => o.iso === iso && o.context === context))
      out.push({ iso, text: text.slice(idx, idx + len), context, isDeadline: /deadline|due|clos|by |before|until|no later|submit|apply/i.test(context) });
  };
  const yearFor = (m: number, d: number) => {
    const y = today.getFullYear();
    const cand = new Date(y, m, d);
    return cand.getTime() < today.getTime() - 60 * 86400000 ? y + 1 : y; // dates long past → next year
  };
  for (const m of text.matchAll(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(?:of\s+)?(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?(?:,?\s+(\d{4}))?/gi)) {
    const mi = MON(m[2]!);
    push(m[3] ? Number(m[3]) : yearFor(mi, Number(m[1])), mi, Number(m[1]), m.index!, m[0].length);
  }
  for (const m of text.matchAll(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*\.?\s+(\d{1,2})(?!\d)(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?/gi)) {
    const mi = MON(m[1]!);
    push(m[3] ? Number(m[3]) : yearFor(mi, Number(m[2])), mi, Number(m[2]), m.index!, m[0].length);
  }
  for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2,4})\b/g)) {
    const y = Number(m[3]!.length === 2 ? `20${m[3]}` : m[3]);
    push(y, Number(m[2]) - 1, Number(m[1]), m.index!, m[0].length);
  }
  for (const m of text.matchAll(/\b(\d{4})-(\d{2})-(\d{2})\b/g)) push(Number(m[1]), Number(m[2]) - 1, Number(m[3]), m.index!, m[0].length);
  return out.sort((a, b) => a.iso.localeCompare(b.iso));
}

export const wordCount = (s: string) => (s.trim() ? s.trim().split(/\s+/).length : 0);

export interface EmailTemplate {
  id: string;
  name: string;
  fields: { key: string; label: string; placeholder: string }[];
  subject: (f: Record<string, string>) => string;
  body: (f: Record<string, string>, me: { name: string; course: string; university: string; year?: string }) => string;
}

const sign = (me: { name: string; course: string; university: string; year?: string }) => `Best wishes,\n${me.name || '[Your name]'}\n${[me.course, me.university].filter(Boolean).join(', ') || '[Course, University]'}`;
const v = (f: Record<string, string>, k: string, d: string) => (f[k]?.trim() ? f[k]!.trim() : d);

export const TEMPLATES: EmailTemplate[] = [
  {
    id: 'networking',
    name: 'Networking (alumni / professional)',
    fields: [
      { key: 'to', label: 'Their first name', placeholder: 'Sarah' },
      { key: 'org', label: 'Organisation', placeholder: 'Organisation name' },
      { key: 'hook', label: 'How you found them / what you noticed', placeholder: 'your talk at the careers fair' },
      { key: 'ask', label: 'Your ask', placeholder: 'a 15-minute call about their work' },
    ],
    subject: (f) => `${v(f, 'org', 'Your work')} — a quick question from a student`,
    body: (f, me) =>
      `Dear ${v(f, 'to', '[Name]')},\n\nI am a ${me.year || '[year]'} ${me.course || '[course]'} student. I came across you through ${v(f, 'hook', '[how you found them]')}, and I would really value your perspective on ${v(f, 'org', '[organisation]')}.\n\nWould you have time for ${v(f, 'ask', 'a 15-minute call')} in the next few weeks? I am happy to fit around your schedule.\n\nThank you for considering it.\n\n${sign(me)}`,
  },
  {
    id: 'experience',
    name: 'Cold email asking for experience',
    fields: [
      { key: 'to', label: 'Person (title + surname)', placeholder: 'Dr Patel' },
      { key: 'topic', label: 'Their area of work', placeholder: 'their area of work' },
      { key: 'paper', label: 'Something of theirs you read or saw', placeholder: 'something of theirs you read or saw' },
      { key: 'when', label: 'When you are free', placeholder: 'next summer (June–August)' },
    ],
    subject: (f) => `Student asking about experience in ${v(f, 'topic', 'your area')}`,
    body: (f, me) =>
      `Dear ${v(f, 'to', '[Dr Surname]')},\n\nI am a ${me.year || '[year]'} ${me.course || '[course]'} student at ${me.university || '[university]'}. I read ${v(f, 'paper', '[what you read or saw]')} and I am very interested in ${v(f, 'topic', '[their area]')}.\n\nI am looking for hands-on experience during ${v(f, 'when', '[dates]')}. I would be glad to help with any task, and I can share my CV and module results.\n\nWould there be any opportunity to join your team, even for a short period?\n\nThank you for your time.\n\n${sign(me)}`,
  },
  {
    id: 'followup',
    name: 'Follow-up after an event / insight day',
    fields: [
      { key: 'to', label: 'Their first name', placeholder: 'James' },
      { key: 'event', label: 'Event', placeholder: 'the open day' },
      { key: 'detail', label: 'Something specific you learned', placeholder: 'what a normal week in the team looks like' },
    ],
    subject: (f) => `Thank you — ${v(f, 'event', 'the event')}`,
    body: (f, me) => `Dear ${v(f, 'to', '[Name]')},\n\nThank you for your time at ${v(f, 'event', '[event]')}. I especially valued what you said about ${v(f, 'detail', '[detail]')}.\n\nIt confirmed my interest, and I hope to apply for the next stage. If you have any advice on how to prepare, I would be grateful.\n\n${sign(me)}`,
  },
  {
    id: 'reference',
    name: 'Ask a lecturer for a reference',
    fields: [
      { key: 'to', label: 'Lecturer (title + surname)', placeholder: 'Professor Ahmed' },
      { key: 'module', label: 'Your module with them', placeholder: 'module name' },
      { key: 'for', label: 'What it is for', placeholder: 'the programme you are applying for' },
      { key: 'by', label: 'Deadline', placeholder: '15 January' },
    ],
    subject: (f) => `Reference request — ${v(f, 'for', 'application')}`,
    body: (f, me) => `Dear ${v(f, 'to', '[Title Surname]')},\n\nI took your ${v(f, 'module', '[module]')} module and enjoyed it greatly. I am applying for ${v(f, 'for', '[what]')}, and I would be honoured if you could act as a referee.\n\nThe deadline is ${v(f, 'by', '[date]')}. I can send my CV, the role description and a short note on what I did in your module.\n\nThank you very much.\n\n${sign(me)}`,
  },
  {
    id: 'careers',
    name: 'Question for the careers / placements team',
    fields: [{ key: 'q', label: 'Your question', placeholder: 'your question' }],
    subject: () => 'Appointment request — careers advice',
    body: (f, me) => `Hello,\n\nI am a ${me.year || '[year]'} ${me.course || '[course]'} student. I would like advice on ${v(f, 'q', '[question]')}.\n\nCould I book an appointment, or is there a drop-in session you would recommend?\n\nThank you.\n\n${sign(me)}`,
  },
];

export function mailto(to: string, subject: string, body: string): string {
  return `mailto:${encodeURIComponent(to)}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

/** Common application questions with a structure hint (your answers live on this phone). */
export const QUESTIONS: { id: string; q: string; hint: string; limit: number }[] = [
  { id: 'why-firm', q: 'Why this firm?', hint: 'Two specific reasons tied to them (a deal, a product, a team) → what you would bring → one line on fit.', limit: 250 },
  { id: 'why-role', q: 'Why this role / industry?', hint: 'Moment you got interested → what you did about it → why this role is the next step.', limit: 250 },
  { id: 'teamwork', q: 'Tell us about a time you worked in a team.', hint: 'STAR: Situation → Task → Action (what YOU did) → Result (a number if you can).', limit: 200 },
  { id: 'challenge', q: 'Describe a challenge you overcame.', hint: 'STAR; show what you learned and would do differently.', limit: 200 },
  { id: 'commercial', q: 'Tell us about a recent business story that interests you.', hint: 'What happened → why it matters → who wins/loses → your view.', limit: 250 },
  { id: 'customer', q: 'A time you dealt with a difficult customer or stakeholder.', hint: 'Use your part-time job: calm → listen → solve → result.', limit: 200 },
];
