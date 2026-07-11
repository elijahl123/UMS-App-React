import { toIsoDate, type CalendarItem } from '@/app/data/calendarUtils';
import { cn } from '@/lib/utils';

interface Props {
  year: number;
  month: number;
  itemsByDate: Map<string, CalendarItem[]>;
  onDayClick: (dateIso: string) => void;
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

function CalendarMonthGrid({ year, month, itemsByDate, onDayClick }: Props) {
  const dates = getMonthGridDates(year, month);
  const todayIso = toIsoDate(new Date());

  return (
    <div className="flex flex-col h-full min-h-0">
      <div className="grid grid-cols-7 border-b border-[var(--border-light)]">
        {weekdayLabels.map((label) => (
          <div key={label} className="px-2 py-2 text-center text-xs font-semibold text-muted-foreground">
            {label}
          </div>
        ))}
      </div>
      <div className="grid grid-cols-7 grid-rows-6 flex-1 min-h-0 overflow-y-auto">
        {dates.map((date) => {
          const iso = toIsoDate(date);
          const isCurrentMonth = date.getMonth() === month;
          const isToday = iso === todayIso;
          const items = itemsByDate.get(iso) ?? [];

          return (
            <button
              key={iso}
              type="button"
              onClick={() => onDayClick(iso)}
              className={cn(
                'flex flex-col items-stretch gap-0.5 sm:gap-1 border-b border-r border-[var(--border-light)] p-1 sm:p-1.5 text-left transition-colors hover:bg-primary/5 min-h-[60px] sm:min-h-[80px]',
                !isCurrentMonth && 'bg-muted/40 text-muted-foreground'
              )}
            >
              <span
                className={cn(
                  'inline-flex h-5 w-5 sm:h-6 sm:w-6 items-center justify-center rounded-full text-[10px] sm:text-xs font-semibold',
                  isToday && 'bg-primary text-primary-foreground'
                )}
              >
                {date.getDate()}
              </span>
              <div className="flex flex-col gap-0 sm:gap-0.5 overflow-hidden">
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
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMonthGrid;
