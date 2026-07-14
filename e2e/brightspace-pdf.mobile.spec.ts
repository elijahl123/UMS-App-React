import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { expect, test, type Page } from '@playwright/test';
import { mockAuthenticatedApp } from './support/appMocks';

function watchForRuntimeErrors(page: Page) {
  const errors: string[] = [];

  page.on('pageerror', (error) => {
    errors.push(error.message);
  });

  page.on('console', (message) => {
    if (message.type() === 'error') {
      errors.push(message.text());
    }
  });

  return errors;
}

function escapePdfText(text: string): string {
  return text.replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');
}

function createTextPdf(lines: string[]): Buffer {
  const content = [
    'BT',
    '/F1 12 Tf',
    '50 750 Td',
    '14 TL',
    ...lines.flatMap((line, index) => [`(${escapePdfText(line)}) Tj`, ...(index === lines.length - 1 ? [] : ['T*'])]),
    'ET',
  ].join('\n');
  const objects = [
    '1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n',
    '2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n',
    '3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>\nendobj\n',
    '4 0 obj\n<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>\nendobj\n',
    `5 0 obj\n<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream\nendobj\n`,
  ];
  let pdf = '%PDF-1.4\n';
  const offsets = [0];

  for (const object of objects) {
    offsets.push(Buffer.byteLength(pdf));
    pdf += object;
  }

  const xrefOffset = Buffer.byteLength(pdf);
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += '0000000000 65535 f \n';
  for (const offset of offsets.slice(1)) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`;
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefOffset}\n%%EOF\n`;

  return Buffer.from(pdf, 'utf8');
}

test.beforeEach(async ({ page }) => {
  await mockAuthenticatedApp(page);
});

test('parses a Brightspace PDF upload in the mobile browser', async ({ page }, testInfo) => {
  const runtimeErrors = watchForRuntimeErrors(page);
  const pdfPath = testInfo.outputPath('brightspace-calendar.pdf');
  mkdirSync(dirname(pdfPath), { recursive: true });
  writeFileSync(
    pdfPath,
    createTextPdf([
      'COMP30870-Graph Algorithms-2026/27 Autumn',
      'Mid-Term Assignment (50%) - Due 1 March 2026 11:59 PM',
    ])
  );

  await page.goto('/#/homework');
  await page.getByRole('button', { name: 'Import Brightspace PDF' }).click();
  await page.getByLabel('Brightspace calendar PDF').setInputFiles(pdfPath);

  await expect(page.getByText('Mid-Term Assignment (50%)')).toBeVisible();
  await expect(page.getByRole('table').getByText('COMP30870')).toBeVisible();
  await expect(page.getByRole('button', { name: /Import 1 selected/i })).toBeVisible();
  expect(runtimeErrors).toEqual([]);
});
