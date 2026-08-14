import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useTheme } from '@/app/lib/theme/ThemeContext';
import { cn } from '@/lib/utils';

interface ThemeToggleProps {
  className?: string;
  showLabel?: boolean;
  variant?: 'action' | 'switch';
}

function ThemeToggle({ className, showLabel = true, variant = 'action' }: ThemeToggleProps) {
  const { resolvedTheme, toggleTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';
  const actionLabel = isDark ? 'Switch to light mode' : 'Switch to dark mode';
  const Icon = isDark ? Sun : Moon;

  if (variant === 'switch') {
    return (
      <button
        type="button"
        role="switch"
        aria-label="Dark mode"
        aria-checked={isDark}
        title={actionLabel}
        onClick={toggleTheme}
        className={cn(
          'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background',
          isDark ? 'bg-primary' : 'bg-muted',
          className
        )}
      >
        <span
          className={cn(
            'flex h-5 w-5 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-transform',
            isDark ? 'translate-x-6' : 'translate-x-1'
          )}
        >
          <Icon className="h-3 w-3" />
        </span>
      </button>
    );
  }

  return (
    <Button
      type="button"
      variant="outline"
      role="switch"
      aria-checked={isDark}
      aria-label={actionLabel}
      title={actionLabel}
      className={className}
      onClick={toggleTheme}
    >
      <Icon className="h-4 w-4" />
      {showLabel && <span>{isDark ? 'Light mode' : 'Dark mode'}</span>}
    </Button>
  );
}

export default ThemeToggle;

