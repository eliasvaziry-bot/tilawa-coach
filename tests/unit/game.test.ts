// Game layer: levels, daily goal, rewards only, badges computed from progress.
import { describe, expect, it } from 'vitest';
import { BADGES, earnedBadges, goalFor, levelOf, XP_FOR, type XpState } from '../../src/srs/game.ts';
import { emptyProgress, type LessonProgress } from '../../src/srs/progress.ts';

const DAY = 86400000;
const xp = (total = 0, events: Record<string, number> = {}): XpState => ({ total, byDay: {}, events, seenBadges: [] });
const lessons = [
  { id: 's0-01-microphone', stage: 0, order: 1 },
  { id: 's1-01-ba-family', stage: 1, order: 1 },
];
const noStreak = { days: [], freezes: [] };

describe('game layer', () => {
  it('levels start at 0, 50, 150, 300 and 500 XP', () => {
    expect(levelOf(0)).toEqual({ level: 1, into: 0, need: 50 });
    expect(levelOf(49).level).toBe(1);
    expect(levelOf(50)).toEqual({ level: 2, into: 0, need: 100 });
    expect(levelOf(150).level).toBe(3);
    expect(levelOf(299).level).toBe(3);
    expect(levelOf(300).level).toBe(4);
    expect(levelOf(500).level).toBe(5);
  });
  it('the daily goal follows the minutes picked on Today', () => {
    expect([5, 10, 20, 30].map(goalFor)).toEqual([10, 20, 40, 60]);
    expect(goalFor(7)).toBe(20);
  });
  it('rewards only: no XP is ever taken away', () => {
    for (const v of Object.values(XP_FOR)) expect(v).toBeGreaterThan(0);
  });
  it('badges follow progress, streak and XP', () => {
    expect(earnedBadges({}, noStreak, xp(), lessons, false)).toEqual([]);
    const started: Record<string, LessonProgress> = { 's1-01-ba-family': { ...emptyProgress('s1-01-ba-family', 7), stepsDone: 1 } };
    expect(earnedBadges(started, noStreak, xp(120, { perfect: 1 }), lessons, true)).toEqual(expect.arrayContaining(['first-step', 'placed', 'perfect', 'xp-100']));
    // mastered = a passed test + a retest 3 days later; one passed test alone is not enough
    const tested = { ...emptyProgress('s1-01-ba-family', 7), checksPassed: true, mastery: { correct: 20, total: 20, at: 0 } };
    expect(earnedBadges({ 's1-01-ba-family': tested }, noStreak, xp(), lessons, false)).not.toContain('first-mastery');
    expect(earnedBadges({ 's1-01-ba-family': { ...tested, retestPassedAt: 3 * DAY } }, noStreak, xp(), lessons, false)).toContain('first-mastery');
    const today = new Date(2026, 10, 22);
    const key = (k: number) => {
      const x = new Date(today);
      x.setDate(x.getDate() - k);
      return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}-${String(x.getDate()).padStart(2, '0')}`;
    };
    expect(earnedBadges({}, { days: [key(0), key(1), key(2)], freezes: [] }, xp(), lessons, false, today)).toContain('streak-3');
    expect(new Set(BADGES.map((b) => b.id)).size).toBe(BADGES.length);
  });
});
