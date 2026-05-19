import { test, expect } from '@playwright/test';

// Acceptance test from the goal:
// "create a floorplan, place one storage unit, add an item named 'test-widget'
// to it, reload the page, search for 'widget', click the result, and verify
// the unit is highlighted on the correct floorplan."

test('acceptance: create floorplan, add unit + item, reload, search, highlight', async ({ page }) => {
  await page.goto('/');

  // 1. Create a floorplan
  await page.getByLabel('Name').first().fill('Garage');
  await page.getByRole('button', { name: 'Create' }).click();
  await expect(page.getByRole('link', { name: 'Garage' })).toBeVisible();

  // 2. Open it and place one storage unit
  await page.getByRole('link', { name: 'Garage' }).click();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();
  await page.getByRole('button', { name: '+ Add storage unit' }).click();
  // Unit panel appears on the right
  await expect(page.getByRole('heading', { name: 'Unit' })).toBeVisible();

  // 3. Add an item named test-widget to the unit
  await page.locator('form').getByLabel('Name').fill('test-widget');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('test-widget')).toBeVisible();

  // Grab the floorplan URL so we can verify highlight navigates back to it
  const floorplanUrl = page.url();
  const floorplanId = floorplanUrl.split('/floorplan/')[1].split('?')[0];

  // 4. Reload (forces re-fetch from Firestore)
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();

  // 5. Search for "widget"
  await page.locator('.search-form input').fill('widget');
  await page.locator('.search-form button').click();
  await expect(page.getByRole('heading', { name: /Results for "widget"/ })).toBeVisible();

  // Result should show item, unit, floorplan
  const result = page.locator('.result').first();
  await expect(result).toBeVisible();
  await expect(result).toContainText('test-widget');
  await expect(result).toContainText('Garage');

  // 6. Click the result → navigates to floorplan with highlight
  await result.click();
  await expect(page).toHaveURL(new RegExp(`/floorplan/${floorplanId}\\?highlight=`));
  await expect(page.getByRole('heading', { name: 'Garage' })).toBeVisible();

  // 7. Verify the unit is highlighted (CSS class 'highlighted' on the SVG rect)
  await expect(page.locator('rect.unit.highlighted')).toHaveCount(1);
});
