import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { useTheme } from '@/app/lib/theme/ThemeContext';

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
      <Switch
        checked={isDark}
        onCheckedChange={toggleTheme}
        label="Dark mode"
        title={actionLabel}
        className={className}
      >
        <Icon className="h-3 w-3" />
      </Switch>
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

