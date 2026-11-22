import { describe, expect, it } from 'vitest';
import { findDates, mailto, TEMPLATES, wordCount } from '../../src/career/text.ts';
import { daysUntil } from '../../src/career/model.ts';
import { decryptPack, encryptPack } from '../../src/career/pack.ts';
import { readFileSync } from 'node:fs';

describe('career: find dates in a pasted email', () => {
  const today = new Date(2026, 10, 22);
  it('finds UK day-first dates and flags deadlines', () => {
    const f = findDates('Applications close on 15 January 2027. The info session is on Tue 2nd Dec. Reply by 01/12/2026 please.', today);
    expect(f.map((x) => x.iso)).toEqual(['2026-12-01', '2026-12-02', '2027-01-15']);
    expect(f.find((x) => x.iso === '2027-01-15')!.isDeadline).toBe(true);
    expect(f.find((x) => x.iso === '2026-12-01')!.isDeadline).toBe(true);
  });
  it('rolls a month-day without a year into next year when long past', () => {
    expect(findDates('Deadline: 3 March', today)[0]!.iso).toBe('2027-03-03');
    expect(findDates('Deadline: Nov 30', today)[0]!.iso).toBe('2026-11-30');
  });
});

describe('career: templates and counts', () => {
  it('fills a template with blanks when fields are missing and never invents a name', () => {
    const t = TEMPLATES[0]!;
    const body = t.body({}, { name: '', course: '', university: '' });
    expect(body).toContain('[Name]');
    expect(body).toContain('[Your name]');
    expect(mailto('a@example.com', 'Hi there', 'Line 1\nLine 2')).toBe('mailto:a%40example.com?subject=Hi%20there&body=Line%201%0ALine%202');
    expect(wordCount('  one two\nthree ')).toBe(3);
  });
});

describe('encrypted career pack', () => {
  it('round-trips with the right passphrase and fails with a wrong one', async () => {
    const enc = await encryptPack({ hello: 'world', n: [1, 2] }, 'cedar-river-north', 1000);
    expect(JSON.stringify(enc)).not.toContain('world');
    expect(await decryptPack(enc, ' Cedar-River-North ')).toEqual({ hello: 'world', n: [1, 2] });
    await expect(decryptPack(enc, 'wrong-pass')).rejects.toBeTruthy();
  });
  it('the committed pack is ciphertext only', () => {
    const raw = readFileSync('public/data/career/pack.enc.json', 'utf8');
    const j = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(j).sort()).toEqual(['ct', 'iter', 'iv', 'kdf', 'salt', 'v']);
    expect(raw).not.toMatch(/spring|placement|deadline|https?:/i);
  });
  it('daysUntil counts whole days', () => {
    expect(daysUntil('2026-11-29', new Date(2026, 10, 22, 15))).toBe(7);
    expect(daysUntil('', new Date())).toBeNull();
  });
});
