import { toIsoDate, type CalendarItem } from '@/app/data/calendarUtils';
import { cn } from '@/lib/utils';

interface Props {
  year: number;
  month: number;
  itemsByDate: Map<string, CalendarItem[]>;
  onDayClick: (dateIso: string) => void;
  selectedDate?: string | null;
  variant?: 'desktop' | 'mobile';
  className?: string;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function getMonthGridDates(year: number, month: number): Date[] {
  const firstOfMonth = new Date(year, month, 1);
  const startOffset = firstOfMonth.getDay();
  const gridStart = new Date(year, month, 1 - startOffset);
  const dates: Date[] = [];
  for (let i = 0; i < 42; i++) {
    dates.push(new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i));
  }
  return dates;
}

function CalendarMonthGrid({ year, month, itemsByDate, onDayClick, selectedDate, variant = 'desktop', className }: Props) {
  const dates = getMonthGridDates(year, month);
  const todayIso = toIsoDate(new Date());
  const isMobile = variant === 'mobile';

  return (
    <div
      className={cn(
        'flex flex-col h-full min-h-0',
        isMobile && 'mobile-surface p-3',
        className
      )}
    >
      <div className={cn('grid grid-cols-7', isMobile ? 'pb-3' : 'border-b border-[var(--border-light)]')}>
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className={cn(
              'px-2 py-2 text-center text-xs font-semibold',
              isMobile ? 'text-[0.72rem] text-[var(--secondary-accent)]' : 'text-muted-foreground'
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className={cn(
          'grid grid-cols-7 grid-rows-6 flex-1 min-h-0',
          isMobile ? 'overflow-hidden rounded-lg border border-[var(--border-light)]' : 'overflow-y-auto'
        )}
      >
        {dates.map((date) => {
          const iso = toIsoDate(date);
          const isCurrentMonth = date.getMonth() === month;
          const isToday = iso === todayIso;
          const isSelected = iso === selectedDate;
          const items = itemsByDate.get(iso) ?? [];

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${items.length ? `, ${items.length} item${items.length === 1 ? '' : 's'}` : ''}`}
              className={cn(
                'border-b border-r border-[var(--border-light)] transition-colors hover:bg-primary/5',
                isMobile
                  ? 'relative flex aspect-square min-h-0 flex-col items-center justify-start overflow-hidden p-1 pt-3 text-center text-[var(--secondary-accent)]'
                  : 'flex min-h-[60px] flex-col items-stretch gap-0.5 p-1 text-left sm:min-h-[80px] sm:gap-1 sm:p-1.5 md:min-h-[96px] xl:min-h-[80px]',
                !isCurrentMonth && (isMobile ? 'text-muted-foreground/55' : 'bg-muted/40 text-muted-foreground'),
                isSelected && isMobile && 'bg-primary/5'
              )}
            >
              <span
                className={cn(
                  'inline-flex items-center justify-center font-semibold',
                  isMobile ? 'rounded-lg' : 'rounded-full',
                  isMobile ? 'h-7 w-7 text-sm' : 'h-5 w-5 text-[10px] sm:h-6 sm:w-6 sm:text-xs',
                  (isToday || (isMobile && isSelected)) && 'bg-primary text-primary-foreground shadow-[0_8px_16px_rgb(248_173_157/0.28)]'
                )}
              >
                {date.getDate()}
              </span>
              {isMobile ? (
                <div className="mt-1 flex h-2 w-full items-center justify-center gap-0.5 overflow-hidden px-1">
                  {items.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: item.borderColor }}
                    />
                  ))}
                </div>
              ) : (
                <div className="flex flex-col gap-0 overflow-hidden sm:gap-0.5">
                  {items.slice(0, 3).map((item) => (
                    <span
                      key={item.id}
                      className="truncate rounded border px-1 py-0.5 text-[8px] font-semibold sm:text-[10px]"
                      style={{ backgroundColor: item.color, borderColor: item.borderColor, color: item.textColor }}
                    >
                      {item.title}
                    </span>
                  ))}
                  {items.length > 3 && (
                    <span className="text-[10px] text-muted-foreground">+{items.length - 3} more</span>
                  )}
                </div>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMonthGrid;
