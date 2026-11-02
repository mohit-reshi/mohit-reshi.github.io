import { expect, test } from '@playwright/test';
import { mkdirSync } from 'node:fs';

const shots = new URL('../../docs/live-lab/', import.meta.url).pathname;
mkdirSync(shots, { recursive: true });

test('mock-mode demo: persona switch, controls, event log and code highlighting', async ({ page }) => {
  await page.goto('/?report=insurance-employer');
  await expect(page.locator('.ll-pill')).toHaveText('Live');
  await expect(page.locator('.ll-embed svg')).toBeVisible();
  await expect(page.locator('.ll-log')).toContainText('rendered');

  // persona switch re-embeds and updates the explanation and the report
  await page.getByLabel('Producer', { exact: true }).check();
  await expect(page.locator('.ll-rls')).toContainText('Now applied: "Producer"');
  await expect(page.locator('.ll-embed svg')).toContainText('as "producer"');
  await expect(page.locator('.ll-log')).toContainText('persona');
  await expect(page.locator('.ll-codebox .line.ll-hl').first()).toBeAttached(); // Code tab is hidden until opened
  await page.screenshot({ path: shots + '01-live-persona.png', fullPage: true });

  // filter, bookmark, page navigation
  await page.getByRole('button', { name: /^Filter:/ }).click();
  await expect(page.locator('.ll-embed svg g[role=button]')).not.toHaveCount(5);
  await expect(page.locator('.ll-log')).toContainText('filter');
  await expect(page.locator('.ll-codehint')).toContainText('Code for “filter”');
  await page.getByRole('button', { name: /^Bookmark: Denied/ }).click();
  await expect(page.locator('.ll-log')).toContainText('bookmark-apply');
  await page.getByRole('button', { name: 'Detail' }).click();
  await expect(page.locator('.ll-log')).toContainText('pageChanged');
  await page.locator('.ll-embed svg g[role=button]').first().click();
  await expect(page.locator('#ll-selected')).toContainText('Name =');
  await page.screenshot({ path: shots + '02-live-controls.png', fullPage: true });

  // code tab shows highlighted lines for the last action and is keyboard reachable
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('#ll-code')).toBeVisible();
  await expect(page.locator('.ll-codebox .line.ll-hl').first()).toBeVisible();
  await page.screenshot({ path: shots + '03-code-tab.png', fullPage: true });

  // theme toggle
  await page.getByRole('button', { name: 'Toggle theme' }).click();
  await expect(page.locator('.ll-root')).toHaveAttribute('data-theme', /dark|light/);
  await page.getByRole('tab', { name: 'Live' }).click();
  await page.screenshot({ path: shots + '04-theme-toggled.png', fullPage: true });
});

test('fallback: unreachable broker shows recorded media and a working Code tab', async ({ page }) => {
  await page.goto('/?broker=http://127.0.0.1:9&report=insurance-member');
  await expect(page.locator('.ll-banner')).toContainText('Live capacity has ended', { timeout: 10_000 });
  await expect(page.locator('.ll-pill')).toHaveText('Recorded');
  await expect(page.locator('.ll-fallback')).toBeVisible();
  await page.getByRole('tab', { name: 'Code' }).click();
  await expect(page.locator('.ll-codebox .line').first()).toBeVisible();
  await page.screenshot({ path: shots + '05-fallback.png', fullPage: true });
});

test('report buttons: one per report, one pressed, operable with the keyboard, and the report area is large', async ({ page }) => {
  await page.goto('/');
  await page.locator('#ll-tab-live').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#ll-code')).toBeVisible();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#ll-live')).toBeVisible();
  await expect(page.locator('button[data-report]')).toHaveCount(7);
  await expect(page.locator('button[data-report][aria-pressed=true]')).toHaveCount(1);
  const second = page.locator('button[data-report]').nth(1);
  await second.focus(); await page.keyboard.press('Enter');
  await expect(second).toHaveAttribute('aria-pressed', 'true');
  const box = await page.locator('.ll-stage').boundingBox();
  expect(box!.height).toBeGreaterThan(420); // the embedded report is shown large
});
