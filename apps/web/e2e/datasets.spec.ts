import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { graphProject, sampleImage, seedProject } from './fixtures';

// Task 1.5: datasets panel — add, rename, colour, mode, family parameter, units, source reference, notes.

const inspector = (page: Page) => page.getByRole('complementary', { name: 'Inspector' });

test.describe('datasets panel', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await seedProject(page, graphProject('vector-clean', { width: 2400, height: 1600 }), {
      'graphs/g1/original.png': sampleImage('vector-clean'),
    });
  });

  test('describes a curve family and keeps it across a reload', async ({ page }) => {
    const panel = inspector(page);
    await panel.getByRole('button', { name: 'Add dataset' }).click();
    await panel.getByRole('textbox', { name: 'Name' }).fill('T = 300 °C');
    await panel.getByLabel('Colour').fill('#882255');
    await panel.getByRole('radio', { name: /Path/ }).check();
    await panel.getByRole('textbox', { name: 'X unit' }).fill('m³/h');
    await panel.getByRole('textbox', { name: 'Y unit' }).fill('m');
    await panel.getByRole('switch', { name: 'Family parameter' }).check();
    await panel.getByRole('textbox', { name: 'Parameter name' }).fill('Temperature');
    await panel.getByRole('textbox', { name: 'Parameter value' }).fill('300');
    await panel.getByRole('textbox', { name: 'Parameter unit' }).fill('°C');
    await panel.getByRole('textbox', { name: 'Source reference' }).fill('Vendor catalogue p. 12');
    await panel.getByRole('textbox', { name: 'Notes' }).fill('Impeller 250 mm');
    await panel.getByRole('button', { name: 'Add dataset' }).click();

    const list = panel.getByRole('list', { name: 'Datasets' });
    await expect(list.getByRole('button')).toHaveText([/T = 300 °C/, /Dataset 2/]);

    await page.reload();
    await page.getByRole('button', { name: 'Open E2E vector-clean' }).click();
    await inspector(page)
      .getByRole('button', { name: /T = 300 °C/ })
      .click();
    const form = inspector(page).getByRole('group', { name: 'Dataset T = 300 °C' });
    await expect(form.getByLabel('Colour')).toHaveValue('#882255');
    await expect(form.getByRole('radio', { name: /Path/ })).toBeChecked();
    await expect(form.getByRole('textbox', { name: 'X unit' })).toHaveValue('m³/h');
    await expect(form.getByRole('textbox', { name: 'Parameter value' })).toHaveValue('300');
    await expect(form.getByRole('textbox', { name: 'Parameter unit' })).toHaveValue('°C');
    await expect(form.getByRole('textbox', { name: 'Source reference' })).toHaveValue(
      'Vendor catalogue p. 12',
    );
    await expect(form.getByRole('textbox', { name: 'Notes' })).toHaveValue('Impeller 250 mm');
  });

  test('undo and redo with the keyboard and the rail buttons', async ({ page }) => {
    const panel = inspector(page);
    await panel.getByRole('button', { name: 'Add dataset' }).click();
    await panel.getByRole('textbox', { name: 'Name' }).fill('Pump A');
    await panel.getByRole('button', { name: 'Delete dataset' }).click();
    await expect(panel.getByText(/No datasets yet/)).toBeVisible();

    await page.keyboard.press('Control+z');
    await expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue('Pump A');
    await page.getByRole('button', { name: 'Undo' }).click();
    await expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue('Dataset 1');
    await page.getByRole('button', { name: 'Redo' }).click();
    await expect(panel.getByRole('textbox', { name: 'Name' })).toHaveValue('Pump A');
  });

  test('passes axe with the dataset form open', async ({ page }) => {
    await inspector(page).getByRole('button', { name: 'Add dataset' }).click();
    await inspector(page).getByRole('switch', { name: 'Family parameter' }).check();
    const results = await new AxeBuilder({ page })
      .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'])
      .analyze();
    expect(results.violations).toEqual([]);
  });
});
