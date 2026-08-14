import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import ThemeToggle from '@/app/components/ThemeToggle';
import {
  THEME_STORAGE_KEY,
  ThemeProvider,
  useTheme,
  type ResolvedTheme,
} from '@/app/lib/theme/ThemeContext';

function createMatchMedia(initialDark = false) {
  let matches = initialDark;
  const listeners = new Set<(event: MediaQueryListEvent) => void>();
  const media = {
    get matches() {
      return matches;
    },
    media: '(prefers-color-scheme: dark)',
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.add(listener)),
    removeEventListener: vi.fn((_type: string, listener: (event: MediaQueryListEvent) => void) => listeners.delete(listener)),
    dispatchEvent: vi.fn(),
  } as MediaQueryList;

  vi.mocked(window.matchMedia).mockImplementation(() => media);

  return {
    setDark(next: boolean) {
      matches = next;
      const event = { matches: next, media: media.media } as MediaQueryListEvent;
      listeners.forEach((listener) => listener(event));
    },
  };
}

function ThemeState() {
  const { preference, resolvedTheme, setTheme } = useTheme();
  return (
    <div>
      <span data-testid="preference">{preference ?? 'system'}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <button type="button" onClick={() => setTheme('dark')}>Set dark</button>
      <ThemeToggle />
    </div>
  );
}

function renderTheme() {
  return render(
    <ThemeProvider>
      <ThemeState />
    </ThemeProvider>
  );
}

describe('ThemeProvider', () => {
  beforeEach(() => {
    window.localStorage.removeItem(THEME_STORAGE_KEY);
    document.documentElement.classList.remove('dark');
    document.documentElement.removeAttribute('data-theme');
    let themeColor = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!themeColor) {
      themeColor = document.createElement('meta');
      themeColor.name = 'theme-color';
      document.head.appendChild(themeColor);
    }
  });

  it('follows the device theme when no preference is stored', () => {
    createMatchMedia(true);
    renderTheme();

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
    expect(document.documentElement).toHaveAttribute('data-theme', 'dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    expect(document.querySelector('meta[name="theme-color"]')).toHaveAttribute('content', '#171717');
  });

  it('persists an explicit choice and restores it on remount', () => {
    createMatchMedia(false);
    const firstRender = renderTheme();

    fireEvent.click(screen.getByRole('switch', { name: /switch to dark mode/i }));
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    expect(document.documentElement).toHaveClass('dark');

    firstRender.unmount();
    renderTheme();
    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
  });

  it('ignores invalid stored values and continues following the device', () => {
    window.localStorage.setItem(THEME_STORAGE_KEY, 'sepia');
    createMatchMedia(true);
    renderTheme();

    expect(screen.getByTestId('preference')).toHaveTextContent('system');
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');
  });

  it('tracks system changes only until an explicit choice is made', () => {
    const media = createMatchMedia(false);
    renderTheme();

    act(() => media.setDark(true));
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('dark');

    fireEvent.click(screen.getByRole('switch', { name: /switch to light mode/i }));
    expect(screen.getByTestId('preference')).toHaveTextContent('light');

    act(() => media.setDark(false));
    act(() => media.setDark(true));
    expect(screen.getByTestId('resolved-theme')).toHaveTextContent('light');
    expect(document.documentElement).not.toHaveClass('dark');
  });

  it('synchronizes valid theme changes from another tab', () => {
    createMatchMedia(false);
    renderTheme();

    act(() => {
      window.dispatchEvent(new StorageEvent('storage', { key: THEME_STORAGE_KEY, newValue: 'dark' as ResolvedTheme }));
    });

    expect(screen.getByTestId('preference')).toHaveTextContent('dark');
    expect(document.documentElement).toHaveClass('dark');
  });
});

