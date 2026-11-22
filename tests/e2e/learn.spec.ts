import { test, expect, type Page } from '@playwright/test';

// The learner path (review M-11): placement ladder → practice → mastery test → 3-day retest → spaced review; a running
// test locks the step tabs; lessons work offline. ?quizbot=1 marks the right option (test-only, D-016); page.clock
// moves time forward.
test.skip(({ browserName }) => browserName !== 'chromium', 'learner path runs in Chromium');

async function answerAll(page: Page, max = 40): Promise<void> {
  for (let k = 0; k < max; k++) {
    await page.locator('[data-correct="1"]').first().click();
    const next = page.getByRole('button', { name: /^(Continue|Finish)$/ });
    const last = (await next.textContent())?.includes('Finish');
    await next.click();
    if (last) return;
  }
}
const day = (d: number) => new Date(Date.UTC(2026, 11, d, 9));
/** after a quiz in a lesson, a celebration card shows the score and XP; Continue closes it */
const closeCard = (page: Page) => page.getByRole('button', { name: 'Continue' }).click();

test('placement ladder, then practice → mastery → retest → spaced review', async ({ page }) => {
  await page.clock.install({ time: day(1) });
  await page.goto('./?quizbot=1#/learn/s0-05-placement');
  await page.getByRole('tab', { name: /Practise/ }).click();
  await page.getByRole('button', { name: 'Start at level 1' }).click();
  for (let level = 1; level <= 3; level++) await answerAll(page);
  await page.getByRole('button', { name: 'Every letter and vowel was right' }).click();
  await expect(page.getByText(/all four levels passed: Stage 1 is placed/)).toBeVisible();

  // a placed lesson opens; practice, then the mastery test
  await page.goto('./?quizbot=1#/learn/s1-02-jim-family?step=check');
  await expect(page.getByText('Locked:')).toHaveCount(0);
  await page.getByRole('button', { name: 'Practice quiz' }).click();
  await answerAll(page);
  await expect(page.getByText(/Perfect! أحسنت/)).toBeVisible();
  await expect(page.getByText(/\+\d+ XP/)).toBeVisible();
  await closeCard(page);
  await page.getByRole('button', { name: 'Mastery test' }).click();
  await answerAll(page);
  await closeCard(page);
  await expect(page.getByText(/retest unlocks on/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Mastery test' })).toBeDisabled();

  // 3+ days later: the retest, then the lesson is mastered
  await page.clock.setSystemTime(day(5));
  await page.reload();
  await page.getByRole('button', { name: 'Retest' }).click();
  await answerAll(page);
  await expect(page.getByText('Lesson mastered! 🏅')).toBeVisible();
  await closeCard(page);
  await expect(page.getByText(/mastered · next review/)).toBeVisible();

  // a week after that: Today lists the review; it opens on the Check step; passing clears it
  await page.clock.setSystemTime(day(13));
  await page.goto('./?quizbot=1#/today');
  await page.getByRole('link', { name: /Review: / }).first().click();
  await page.getByRole('button', { name: 'Review quiz (10)' }).click();
  await answerAll(page);
  await expect(page.getByText(/Review passed/)).toBeVisible();
  await page.goto('./?quizbot=1#/today');
  await expect(page.getByRole('link', { name: /Review: / })).toHaveCount(0);
});

test('a running mastery test locks the step tabs and keeps its place', async ({ page }) => {
  await page.goto('./?quizbot=1#/learn/s0-05-placement');
  await page.getByRole('tab', { name: /Practise/ }).click();
  await page.getByRole('button', { name: /Start at level 1|Redo the ladder/ }).click();
  for (let level = 1; level <= 3; level++) await answerAll(page);
  await page.getByRole('button', { name: 'Every letter and vowel was right' }).click();
  await page.goto('./?quizbot=1#/learn/s1-03-dal-dhal?step=check');
  await page.getByRole('button', { name: 'Mastery test' }).click();
  await page.locator('[data-correct="1"]').first().click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await expect(page.getByText('2 / 20')).toBeVisible();
  await expect(page.getByRole('tab', { name: /Big idea/ })).toBeDisabled();
  await expect(page.getByText('2 / 20')).toBeVisible();
});

test('offline: a Stage 1 lesson still runs its quiz, without listening questions', async ({ page, context }) => {
  await page.goto('./#/today');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await context.setOffline(true);
  await page.goto('./#/learn/s1-18-harakat?step=check');
  await expect(page.getByText(/listening questions are left out/)).toBeVisible();
  await page.getByRole('button', { name: 'Practice quiz' }).click();
  await expect(page.getByText(/1 \/ \d+/)).toBeVisible();
  await expect(page.getByRole('button', { name: /Play the word/ })).toHaveCount(0);
  await context.setOffline(false);
});

test('Back works in the installed app: inner screens have a Back button, lessons have Previous step', async ({ page }) => {
  // opened directly (no in-app history): Back goes up a level
  await page.goto('./#/settings');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/more$/);
  // navigated within the app: Back returns to where you came from
  await page.goto('./#/learn');
  await page.locator('a[href^="#/learn/s0-01"]').click();
  await expect(page.getByRole('tab', { name: /Big idea/ })).toBeVisible();
  await page.getByRole('button', { name: 'Done — next step' }).click();
  await page.getByRole('button', { name: '‹ Previous step' }).click();
  await expect(page.getByRole('tab', { name: /Big idea/ })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page).toHaveURL(/#\/learn$/);
  // main tabs have no Back button
  await expect(page.getByRole('button', { name: 'Back' })).toHaveCount(0);
});
