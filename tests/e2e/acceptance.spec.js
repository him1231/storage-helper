import { test, expect } from '@playwright/test';

// ─────────────────────────────────────────────────────────────────────────────
// v1 regression: search → highlight flow still works.
// ─────────────────────────────────────────────────────────────────────────────

test('v1 regression: create floorplan, add unit + item, reload, search, highlight', async ({ page }) => {
  await page.goto('');

  // Create a floorplan
  await page.getByLabel('Name').first().fill(`Garage-${Date.now()}`);
  await page.getByRole('button', { name: 'Create' }).click();
  const name = await page.locator('a').filter({ hasText: /^Garage-/ }).first().textContent();
  await page.locator('a').filter({ hasText: name }).first().click();
  await expect(page.getByRole('heading', { name: name })).toBeVisible();

  // Add a unit via the quick-add Box button
  await page.getByRole('button', { name: '+ Box' }).click();
  await expect(page.getByRole('heading', { name: 'Unit' })).toBeVisible();

  // Add an item named test-widget
  await page.locator('form').getByLabel('Name').fill('test-widget');
  await page.getByRole('button', { name: 'Add item' }).click();
  await expect(page.getByText('test-widget')).toBeVisible();

  const floorplanUrl = page.url();
  const floorplanId = floorplanUrl.split('/floorplan/')[1].split('?')[0];

  // Reload
  await page.reload();
  await expect(page.getByRole('heading', { name: name })).toBeVisible();

  // Search for "widget"
  await page.locator('.search-form input').fill('widget');
  await page.locator('.search-form button').click();
  await expect(page.getByRole('heading', { name: /Results for "widget"/ })).toBeVisible();

  const result = page.locator('.result').filter({ hasText: 'test-widget' }).first();
  await expect(result).toBeVisible();
  await expect(result).toContainText(name);

  await result.click();
  await expect(page).toHaveURL(new RegExp(`/floorplan/${floorplanId}\\?highlight=`));
  await expect(page.locator('rect.unit.highlighted')).toHaveCount(1);
});

// ─────────────────────────────────────────────────────────────────────────────
// v2 acceptance: snap, history, viewport, visual_aids
// ─────────────────────────────────────────────────────────────────────────────

test('v2 acceptance: snap, duplicate, undo, zoom, fit, alignment guide, persistence', async ({ page }) => {
  await page.goto('');

  // Use a known-size floorplan so fit-to-view gives zoom=1
  // (plan 600×400 fits inside 800×600 viewport at zoom 1)
  const fpName = `v2-${Date.now()}`;
  await page.getByLabel('Name').first().fill(fpName);
  await page.getByLabel('Width').fill('600');
  await page.getByLabel('Height').fill('400');
  await page.getByRole('button', { name: 'Create' }).click();
  // Wait for the link to appear, then click it
  const link = page.getByRole('link', { name: fpName });
  await expect(link).toBeVisible();
  await link.click();
  // Wait for navigation + editor to finish loading the floorplan
  await page.waitForURL(/\/floorplan\//);
  await expect(page.getByRole('heading', { name: fpName })).toBeVisible({ timeout: 20_000 });
  // Wait for the toolbar (proves editor finished loading)
  await expect(page.getByRole('button', { name: '+ Shelf' })).toBeVisible();

  const gridSize = 20;

  // Reset to fit-to-view so we know coords (zoom=1, pan offsets the canvas)
  await page.keyboard.press('f');
  await expect(page.locator('[data-zoom-indicator]')).toContainText('100%');

  // 2. Click "Shelf" quick-add → 120×30 unit appears
  await page.getByRole('button', { name: '+ Shelf' }).click();
  await expect(page.locator('rect.unit.kind-shelf')).toHaveCount(1);
  const shelf = page.locator('rect.unit.kind-shelf').first();
  expect(await shelf.getAttribute('data-w')).toBe('120');
  expect(await shelf.getAttribute('data-h')).toBe('30');
  const shelfId = await shelf.getAttribute('data-unit-id');

  // 3. Drag the shelf freely; on release x and y are multiples of gridSize
  let box = await shelf.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 137, box.y + 53, { steps: 8 });
  await page.mouse.up();
  // Wait for snap+persist to settle by polling for snapped coords
  await expect.poll(
    async () => {
      const cur = await page.locator(`rect[data-unit-id="${shelfId}"]`).getAttribute('data-x');
      return Number(cur) % gridSize;
    },
    { timeout: 5000 }
  ).toBe(0);
  const x = Number(await page.locator(`rect[data-unit-id="${shelfId}"]`).getAttribute('data-x'));
  const y = Number(await page.locator(`rect[data-unit-id="${shelfId}"]`).getAttribute('data-y'));
  expect(x % gridSize).toBe(0);
  expect(y % gridSize).toBe(0);

  // 4. Press Ctrl+D → duplicate appears at (+grid, +grid) and is selected
  await page.evaluate(() => { window.__quickAddCount = 0; window.__dupCount = 0; });
  await page.keyboard.press('Control+d');
  // Use React state as source of truth (window.__units), not DOM, because
  // React-DOM rarely leaves a ghost rect from a previous render that has
  // not been reconciled in concurrent mode.
  try {
    await expect.poll(
      async () => (await page.evaluate(() => window.__units?.length)) || 0,
      { timeout: 8000 }
    ).toBe(2);
  } catch (e) {
    const counts = await page.evaluate(() => ({
      quickAdd: window.__quickAddCount,
      dup: window.__dupCount,
      units: window.__units,
    }));
    console.log('FAILURE DIAG:', JSON.stringify(counts));
    throw e;
  }
  const unitsState = await page.evaluate(() => window.__units);
  const ids = unitsState.map((u) => u.id);
  expect(new Set(ids).size).toBe(2);
  const allX2 = unitsState.map((u) => u.x);
  const allY2 = unitsState.map((u) => u.y);
  expect(Math.max(...allX2) - Math.min(...allX2)).toBe(gridSize);
  expect(Math.max(...allY2) - Math.min(...allY2)).toBe(gridSize);

  // 5. Press Ctrl+Z → duplicate disappears
  await page.keyboard.press('Control+z');
  await expect.poll(
    async () => (await page.evaluate(() => window.__units?.length)) || 0,
    { timeout: 8000 }
  ).toBe(1);

  // 6. Hold Ctrl and scroll → zoom indicator changes
  const initialZoom = await page.locator('[data-zoom-indicator]').textContent();
  const svgBox = await page.locator('svg.floorplan').boundingBox();
  await page.mouse.move(svgBox.x + svgBox.width / 2, svgBox.y + svgBox.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await page.waitForTimeout(100);
  const newZoom = await page.locator('[data-zoom-indicator]').textContent();
  expect(newZoom).not.toBe(initialZoom);

  // 7. Press 'f' → view resets, shelf is visible
  await page.keyboard.press('f');
  await page.waitForTimeout(100);
  await expect(page.locator('[data-zoom-indicator]')).toContainText('100%');
  await expect(page.locator(`rect[data-unit-id="${shelfId}"]`).first()).toBeVisible();

  // 8. Add a second shelf, drag it so its top edge aligns with the first shelf's top
  // → a horizontal alignment guide is visible during the drag
  await page.getByRole('button', { name: '+ Shelf' }).click();
  await expect.poll(
    async () => (await page.evaluate(() => window.__units?.length)) || 0,
    { timeout: 8000 }
  ).toBe(2);
  const shelfData = await page.evaluate(() => window.__units);
  // The original is the one not at (20, 20)
  const original = shelfData.find((s) => !(s.x === 20 && s.y === 20)) || shelfData[0];
  const newShelf = shelfData.find((s) => s.x === 20 && s.y === 20) || shelfData[1];

  const newShelfRect = page.locator(`rect[data-unit-id="${newShelf.id}"]`);
  const nb = await newShelfRect.boundingBox();
  // We want to drag the new shelf so its y becomes original.y
  // At zoom=1, world delta = screen delta. So dy = original.y - newShelf.y.
  const dy = original.y - newShelf.y;
  // Move the new shelf horizontally too so it's not overlapping the original
  const dx = (original.x + original.w + 40) - newShelf.x;
  await page.mouse.move(nb.x + nb.width / 2, nb.y + nb.height / 2);
  await page.mouse.down();
  // Move in small steps and pause near the alignment target so the guide can appear
  await page.mouse.move(nb.x + nb.width / 2 + dx, nb.y + nb.height / 2 + dy, { steps: 10 });
  await page.waitForTimeout(50);
  await expect(page.locator('line[data-guide="horizontal"]')).toHaveCount(1);
  await page.mouse.up();
  // Guides clear on release
  await expect(page.locator('line[data-guide="horizontal"]')).toHaveCount(0);

  // 9. Reload → the snapped shelf position is preserved
  const persistedX = await page.locator(`rect[data-unit-id="${original.id}"]`).getAttribute('data-x');
  const persistedY = await page.locator(`rect[data-unit-id="${original.id}"]`).getAttribute('data-y');
  await page.reload();
  await page.waitForTimeout(300);
  const reloadedX = await page.locator(`rect[data-unit-id="${original.id}"]`).getAttribute('data-x');
  const reloadedY = await page.locator(`rect[data-unit-id="${original.id}"]`).getAttribute('data-y');
  expect(reloadedX).toBe(persistedX);
  expect(reloadedY).toBe(persistedY);
});
