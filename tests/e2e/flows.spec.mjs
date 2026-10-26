import { expect, test } from '@playwright/test';

test.beforeEach(async ({ request }) => {
  const response = await request.post('/api/benchmark/reset', { headers: { 'x-benchmark-key': 'local-demo-reset' } });
  expect(response.ok()).toBeTruthy();
});

async function signIn(page, email = 'agent@caseflow.test') {
  await page.goto('/login');
  await page.getByLabel('Email address').fill(email);
  await page.getByLabel('Password').fill('demo123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/tickets$/);
}

test('sign-in recovers from a wrong password and stays signed in across navigation and reloads', async ({ page }) => {
  await page.goto('/login');
  await page.getByLabel('Password').fill('wrong');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.locator('.error[role="alert"]')).toHaveText('Email or password is incorrect');
  await page.getByLabel('Password').fill('demo123');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page).toHaveURL(/\/tickets$/);
  for (const path of ['/tickets/new', '/tickets/1001', '/tickets']) {
    await page.goto(path);
    await page.reload();
    await expect(page.getByRole('button', { name: 'Sign out' })).toBeVisible();
    await expect(page).toHaveURL(new RegExp(`${path}$`));
  }
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page).toHaveURL(/\/login$/);
  await page.goto('/tickets/new');
  await expect(page).toHaveURL(/\/login$/);
});

test('agent creates a ticket and saves separate priority and status changes', async ({ page }) => {
  await signIn(page);
  await page.getByRole('link', { name: 'New ticket' }).first().click();
  await page.getByLabel('Title').fill('Customer cannot update profile photo');
  await page.getByLabel('Customer email').fill('alex@sample.example');
  await page.getByLabel('Description').fill('The customer gets an error when saving the new profile photo.');
  await page.getByRole('button', { name: 'Create ticket' }).click();
  await expect(page).toHaveURL(/\/tickets\/1009$/);
  await page.getByLabel('Priority').selectOption('High');
  await page.getByRole('button', { name: 'Save priority' }).click();
  await expect(page.getByText('Changed priority from Medium to High')).toBeVisible();
  await page.getByLabel('Status').selectOption('In Progress');
  await page.getByRole('button', { name: 'Save status' }).click();
  await expect(page.getByText('Changed status from Open to In Progress')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('Priority')).toHaveValue('High');
  await expect(page.getByLabel('Status')).toHaveValue('In Progress');
});

test('manager can see reports and agent cannot', async ({ page }) => {
  await signIn(page);
  await page.goto('/reports');
  await expect(page.locator('.error[role="alert"]')).toContainText('Manager access required');
  await page.getByRole('button', { name: 'Sign out' }).click();
  await signIn(page, 'manager@caseflow.test');
  await page.goto('/reports');
  await expect(page.getByRole('heading', { name: 'Reports' })).toBeVisible();
  await expect(page.getByText('Total tickets')).toBeVisible();
});

test('search and status filter show only matching tickets', async ({ page }) => {
  await signIn(page);
  await page.getByLabel('Filter by status').selectOption('Open');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(3);
  await page.getByLabel('Filter by status').selectOption('');
  await page.getByLabel('Search tickets').fill('invoice');
  await page.getByRole('button', { name: 'Apply filters' }).click();
  await expect(page.getByRole('link', { name: 'Invoice PDF download fails' })).toBeVisible();
});
