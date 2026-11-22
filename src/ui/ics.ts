// Calendar files (.ics): daily practice reminder (no server → no web push) and career deadlines.

const pad = (n: number) => String(n).padStart(2, '0');
const stamp = (d: Date) => `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\n/g, '\\n');
/** RFC 5545 line folding at 75 octets (approximated by characters; our text is ASCII-ish). */
const fold = (line: string) => line.match(/.{1,73}/g)!.join('\r\n ');

export interface IcsEvent {
  uid: string;
  title: string;
  description?: string;
  url?: string;
  /** all-day date YYYY-MM-DD, or local start "YYYY-MM-DDTHH:MM" */
  date: string;
  minutes?: number;
  rrule?: string;
  alarmMinutesBefore?: number;
}

export function buildIcs(events: IcsEvent[], calName: string): string {
  const now = stamp(new Date());
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Tilawa Coach//EN', 'CALSCALE:GREGORIAN', `X-WR-CALNAME:${esc(calName)}`];
  for (const e of events) {
    lines.push('BEGIN:VEVENT', `UID:${e.uid}`, `DTSTAMP:${now}`, `SUMMARY:${esc(e.title)}`);
    if (e.date.includes('T')) {
      const [d, t] = e.date.split('T');
      const start = `${d!.replace(/-/g, '')}T${t!.replace(':', '')}00`;
      const total = Number(t!.slice(0, 2)) * 60 + Number(t!.slice(3, 5)) + (e.minutes ?? 15);
      const end = `${d!.replace(/-/g, '')}T${pad(Math.floor(total / 60) % 24)}${pad(total % 60)}00`;
      lines.push(`DTSTART:${start}`, `DTEND:${end}`); // floating local time: follows the phone's time zone
    } else {
      const d = e.date.replace(/-/g, '');
      const next = new Date(`${e.date}T00:00:00Z`);
      next.setUTCDate(next.getUTCDate() + 1);
      lines.push(`DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next.toISOString().slice(0, 10).replace(/-/g, '')}`);
    }
    if (e.rrule) lines.push(`RRULE:${e.rrule}`);
    if (e.description) lines.push(`DESCRIPTION:${esc(e.description)}`);
    if (e.url) lines.push(`URL:${e.url}`);
    if (e.alarmMinutesBefore !== undefined) lines.push('BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${esc(e.title)}`, `TRIGGER:-PT${e.alarmMinutesBefore}M`, 'END:VALARM');
    lines.push('END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function dailyReminder(time: string, appUrl: string): string {
  const today = new Date();
  const d = `${today.getFullYear()}-${pad(today.getMonth() + 1)}-${pad(today.getDate())}`;
  return buildIcs(
    [
      {
        uid: `tilawa-daily-${Date.now()}@tilawa-coach`,
        title: 'Tilawa Coach — practice (5–25 min)',
        description: `Open the app: ${appUrl}\nBusy day? The 5-minute plan keeps your streak.`,
        url: appUrl,
        date: `${d}T${time}`,
        minutes: 15,
        rrule: 'FREQ=DAILY',
        alarmMinutesBefore: 0,
      },
    ],
    'Tilawa Coach',
  );
}
