import { expect, test } from '@playwright/test';

test.use({ javaScriptEnabled: false });

test('core content is readable and navigable without JavaScript', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('h1:visible')).toContainText('embedded analytics');
  await expect(page.getByRole('link', { name: /See my work/ })).toBeVisible();
  await page.goto('/work/');
  await expect(page.locator('main')).toBeVisible();
  const links = await page.locator('main a[href^="/work/"]').count();
  expect(links).toBeGreaterThan(0);
  await page.goto('/about/');
  await expect(page.locator('h1')).toBeVisible();
});
