import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

test('formats and saves subscript and superscript text', async ({ page }) => {
  await mockAuthenticatedApp(page);

  let savedContent = '';
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/actions/createNote')) return;
    savedContent = (request.postDataJSON() as { content?: string }).content ?? '';
  });

  await page.goto('/#/notes/new');
  await page.getByPlaceholder('Note title').fill('Chemistry and exponents');

  const editor = page.locator('.ProseMirror');
  await editor.fill('H2O and x2');

  await editor.press('Home');
  await editor.press('ArrowRight');
  await editor.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Subscript' }).click();
  await editor.press('End');
  await editor.press('Shift+ArrowLeft');
  await page.getByRole('button', { name: 'Superscript' }).click();

  await expect(editor.locator('sub')).toHaveText('2');
  await expect(editor.locator('sup')).toHaveText('2');

  await page.getByRole('button', { name: 'Create Note' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  expect(savedContent).toContain('H<sub>2</sub>O');
  expect(savedContent).toContain('x<sup>2</sup>');
});

test('preserves subscript and superscript formatting from rich paste', async ({ page }) => {
  await mockAuthenticatedApp(page);

  let savedContent = '';
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/actions/createNote')) return;
    savedContent = (request.postDataJSON() as { content?: string }).content ?? '';
  });

  await page.goto('/#/notes/new');
  await page.getByPlaceholder('Note title').fill('Pasted notation');

  const editor = page.locator('.ProseMirror');
  await editor.focus();
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData('text/plain', 'CO2 and x3');
    clipboard.setData(
      'text/html',
      '<p>CO<sub>2</sub> and <span class="katex">' +
        '<span class="katex-mathml"><math><semantics>' +
        '<msup><mi>x</mi><mn>3</mn></msup>' +
        '<annotation encoding="application/x-tex">x^3</annotation>' +
        '</semantics></math></span>' +
        '<span class="katex-html" aria-hidden="true">x³</span>' +
        '</span></p>'
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
    );
  });

  await expect(editor.locator('sub')).toHaveText('2');
  await expect(editor.locator('sup')).toHaveText('3');

  await page.getByRole('button', { name: 'Create Note' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  expect(savedContent).toContain('CO<sub>2</sub>');
  expect(savedContent).toContain('x<sup>3</sup>');
  expect(savedContent).not.toContain('data-type="inline-math"');
});
