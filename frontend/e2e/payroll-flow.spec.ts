import { test, expect } from '@playwright/test';

test.describe('Payroll flow', () => {
  test('login and view payroll page', async ({ page }) => {
    await page.goto('/login');

    await page.fill('input[name="email"]', process.env.E2E_EMAIL || '');
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD || '');

    await page.click('button[type="submit"]');

    await page.waitForURL('/dashboard', { timeout: 15_000 });

    await page.goto('/payroll');
    await expect(page.locator('h1')).toContainText(/payroll/i);
  });

  test('payroll page shows run list or empty state', async ({ page }) => {
    await page.goto('/login');
    await page.fill('input[name="email"]', process.env.E2E_EMAIL || '');
    await page.fill('input[name="password"]', process.env.E2E_PASSWORD || '');
    await page.click('button[type="submit"]');
    await page.waitForURL('/dashboard', { timeout: 15_000 });

    await page.goto('/payroll');

    await page.waitForLoadState('networkidle');

    const body = page.locator('body');
    await expect(body).not.toContainText(/loading/i);

    const hasTable = await page.locator('table').count();
    if (hasTable > 0) {
      await expect(page.locator('table tbody tr')).not.toHaveCount(0);
    } else {
      await expect(body).toContainText(/no payroll runs|create your first/i);
    }
  });
});
