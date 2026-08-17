import { expect, test } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

test('renders, edits, and serializes ChatGPT-style pasted LaTeX', async ({ page }) => {
  await mockAuthenticatedApp(page);

  let savedContent = '';
  page.on('request', (request) => {
    if (request.method() !== 'POST' || !request.url().endsWith('/api/actions/createNote')) return;
    savedContent = (request.postDataJSON() as { content?: string }).content ?? '';
  });

  await page.goto('/#/notes/new');
  await page.getByPlaceholder('Note title').fill('Physics formulas');

  const editor = page.locator('.ProseMirror');
  await editor.focus();
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      'text/plain',
      'Ratio is \\(\\frac{E}{m}\\).\n\n\\[\n\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}\n\\]'
    );
    clipboard.setData(
      'text/html',
      '<p>Ratio is <span class="katex">' +
        '<span class="katex-mathml"><math><semantics><mfrac><mi>E</mi><mi>m</mi></mfrac>' +
        '<annotation encoding="application/x-tex">\\frac{E}{m}</annotation>' +
        '</semantics></math></span>' +
        '<span class="katex-html" aria-hidden="true">E/m</span>' +
        '</span>.</p>' +
        '<span class="katex-display"><span class="katex">' +
        '<span class="katex-mathml"><math><semantics><mrow><mo>∑</mo>' +
        '<mfrac><mi>n</mi><mn>2</mn></mfrac></mrow>' +
        '<annotation encoding="application/x-tex">\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}</annotation>' +
        '</semantics></math></span>' +
        '<span class="katex-html" aria-hidden="true">sum</span>' +
        '</span></span>'
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
    );
  });

  const inlineMath = editor.locator('[data-type="inline-math"]');
  const blockMath = editor.locator('[data-type="block-math"]');
  await expect(inlineMath).toHaveAttribute('data-latex', '\\frac{E}{m}');
  await expect(inlineMath.locator('.katex')).toBeVisible();
  await expect(blockMath).toHaveAttribute(
    'data-latex',
    '\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}'
  );
  await expect(blockMath.locator('.katex-display')).toBeVisible();

  page.once('dialog', async (dialog) => {
    expect(dialog.type()).toBe('prompt');
    expect(dialog.defaultValue()).toBe('\\frac{E}{m}');
    await dialog.accept('\\frac{p}{q}');
  });
  await inlineMath.click();
  await expect(inlineMath).toHaveAttribute('data-latex', '\\frac{p}{q}');

  await page.getByRole('button', { name: 'Create Note' }).click();
  await expect(page).toHaveURL(/#\/notes$/);
  expect(savedContent).toContain(
    '<span data-latex="\\frac{p}{q}" data-type="inline-math"></span>'
  );
  expect(savedContent).toContain(
    '<div data-latex="\\sum_{i=1}^{n} i = \\frac{n(n+1)}{2}" data-type="block-math"></div>'
  );
  expect(savedContent).not.toContain('katex');
});

test('renders delimiter text pasted from a selected ChatGPT response', async ({ page }) => {
  await mockAuthenticatedApp(page);
  await page.goto('/#/notes/new');

  const editor = page.locator('.ProseMirror');
  await editor.focus();
  await editor.evaluate((element) => {
    const clipboard = new DataTransfer();
    clipboard.setData(
      'text/plain',
      'A DFA is \\(A=(Q,\\Sigma,\\delta,q_0,F)).\n\n\\[\\delta(q,\\epsilon)=q]'
    );
    element.dispatchEvent(
      new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: clipboard,
      })
    );
  });

  const selectedInlineMath = editor.locator('[data-type="inline-math"]');
  const selectedBlockMath = editor.locator('[data-type="block-math"]');
  await expect(selectedInlineMath).toHaveAttribute(
    'data-latex',
    'A=(Q,\\Sigma,\\delta,q_0,F)'
  );
  await expect(selectedInlineMath.locator('.katex')).toBeVisible();
  await expect(selectedBlockMath).toHaveAttribute('data-latex', '\\delta(q,\\epsilon)=q');
  await expect(selectedBlockMath.locator('.katex')).toBeVisible();
});

test('rehydrates saved math nodes and keeps block formulas within the editor width', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 851 });
  await mockAuthenticatedApp(page);
  await page.route('**/api/actions/loadNotes', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify([
        {
          id: 42,
          course_id: 1,
          title: 'Saved equations',
          content:
            '<p>Recovered ChatGPT math: \\(Q) is the state set.</p>' +
            '<p>Inline <span data-type="inline-math" data-latex="x^2"></span></p>' +
            '<div data-type="block-math" data-latex="\\sum_{i=1}^{100} i"></div>',
          created_at: '2026-07-29T00:00:00.000Z',
          updated_at: '2026-07-29T00:00:00.000Z',
        },
      ]),
    });
  });

  await page.goto('/#/notes/42');

  const editor = page.locator('.ProseMirror');
  await expect(editor.locator('[data-type="inline-math"][data-latex="Q"] .katex')).toBeVisible();
  await expect(editor.locator('[data-type="inline-math"][data-latex="x^2"] .katex')).toBeVisible();
  const blockMath = editor.locator('[data-type="block-math"]');
  await expect(blockMath.locator('.katex-display')).toBeVisible();

  const widths = await blockMath.evaluate((element) => ({
    formula: element.getBoundingClientRect().width,
    editor: element.closest('.ProseMirror')?.getBoundingClientRect().width ?? 0,
  }));
  expect(widths.formula).toBeLessThanOrEqual(widths.editor);
});
