import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface SwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  title?: string;
  disabled?: boolean;
  className?: string;
  /** Optional glyph rendered inside the knob. */
  children?: ReactNode;
}

function Switch({ checked, onCheckedChange, label, title, disabled, className, children }: SwitchProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-label={label}
      aria-checked={checked}
      title={title}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'relative inline-flex h-7 w-12 shrink-0 items-center rounded-full border border-input transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:cursor-not-allowed disabled:opacity-60',
        checked ? 'bg-primary' : 'bg-muted',
        className
      )}
    >
      <span
        className={cn(
          'flex h-5 w-5 items-center justify-center rounded-full bg-card text-foreground shadow-sm transition-transform',
          checked ? 'translate-x-6' : 'translate-x-1'
        )}
      >
        {children}
      </span>
    </button>
  );
}

export { Switch };
