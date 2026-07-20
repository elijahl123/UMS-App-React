import { expect, type Page } from '@playwright/test';

export function watchForRuntimeErrors(page: Page) {
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

export async function expectNoHorizontalPageOverflow(page: Page) {
  const metrics = await page.evaluate(() => {
    const hasHorizontalScrollContainer = (element: Element) => {
      let current = element.parentElement;
      while (current && current !== document.body) {
        const style = window.getComputedStyle(current);
        const canScrollX = ['auto', 'scroll'].includes(style.overflowX) || ['auto', 'scroll'].includes(style.overflow);
        if (canScrollX && current.scrollWidth > current.clientWidth + 2) {
          return true;
        }
        current = current.parentElement;
      }
      return false;
    };

    const documentWidth = document.documentElement.scrollWidth;
    const bodyWidth = document.body.scrollWidth;
    const offenders = Array.from(document.querySelectorAll('body *'))
      .map((element) => {
        const rect = element.getBoundingClientRect();
        return {
          tag: element.tagName.toLowerCase(),
          className: typeof element.className === 'string' ? element.className : '',
          text: (element.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 80),
          left: Math.round(rect.left),
          right: Math.round(rect.right),
          width: Math.round(rect.width),
          insideHorizontalScroller: hasHorizontalScrollContainer(element),
        };
      })
      .filter((entry) => entry.left < -2 || entry.right > window.innerWidth + 2)
      .filter((entry) => !entry.insideHorizontalScroller)
      .sort((a, b) => b.right - a.right)
      .slice(0, 5);

    return {
      offenders,
      widestContent: Math.max(documentWidth, bodyWidth),
      viewportWidth: window.innerWidth,
    };
  });

  expect(metrics.offenders, `viewport=${metrics.viewportWidth}, widest=${metrics.widestContent}`).toEqual([]);
}

export async function expectMobileBottomNavVisible(page: Page) {
  await expect(page.getByRole('navigation', { name: 'Mobile primary navigation' })).toBeVisible();
}

export async function swipeMobilePage(page: Page, direction: 'left' | 'right', options?: { y?: number }) {
  const region = page.locator('[data-mobile-swipe-region="active"]').first();
  await expect(region).toBeVisible();

  const box = await region.boundingBox();
  if (!box) {
    throw new Error('Mobile swipe region was not measurable.');
  }

  const y = options?.y ?? box.y + Math.min(260, box.height / 2);
  const startX = direction === 'left' ? box.x + box.width - 32 : box.x + 32;
  const endX = direction === 'left' ? box.x + 32 : box.x + box.width - 32;

  await region.dispatchEvent('pointerdown', {
    bubbles: true,
    clientX: startX,
    clientY: y,
    isPrimary: true,
    pointerId: 42,
    pointerType: 'touch',
  });
  await region.dispatchEvent('pointermove', {
    bubbles: true,
    clientX: (startX + endX) / 2,
    clientY: y + 4,
    isPrimary: true,
    pointerId: 42,
    pointerType: 'touch',
  });
  await region.dispatchEvent('pointerup', {
    bubbles: true,
    clientX: endX,
    clientY: y + 8,
    isPrimary: true,
    pointerId: 42,
    pointerType: 'touch',
  });
}

export async function dragMobilePage(
  page: Page,
  points: { startX: number; startY: number; endX: number; endY: number }
) {
  const region = page.locator('[data-mobile-swipe-region="active"]').first();
  await expect(region).toBeVisible();

  await region.dispatchEvent('pointerdown', {
    bubbles: true,
    clientX: points.startX,
    clientY: points.startY,
    isPrimary: true,
    pointerId: 43,
    pointerType: 'touch',
  });
  await region.dispatchEvent('pointermove', {
    bubbles: true,
    clientX: (points.startX + points.endX) / 2,
    clientY: (points.startY + points.endY) / 2,
    isPrimary: true,
    pointerId: 43,
    pointerType: 'touch',
  });
  await region.dispatchEvent('pointerup', {
    bubbles: true,
    clientX: points.endX,
    clientY: points.endY,
    isPrimary: true,
    pointerId: 43,
    pointerType: 'touch',
  });
}
