import {
  BookOpen,
  Brain,
  CalendarDays,
  FileText,
  GraduationCap,
  type LucideIcon,
} from 'lucide-react';
import {
  CALENDAR_ITEM_TYPES,
  CALENDAR_TYPE_LABELS,
  getMonthGridDates,
  toIsoDate,
  type CalendarItem,
  type CalendarItemType,
} from '@/app/data/calendarUtils';
import { cn } from '@/lib/utils';

interface Props {
  year: number;
  month: number;
  itemsByDate: Map<string, CalendarItem[]>;
  onDayClick: (dateIso: string) => void;
  selectedDate?: string | null;
  variant?: 'desktop' | 'mobile';
  className?: string;
  visibleTypes?: ReadonlySet<CalendarItemType>;
  onTypeToggle?: (type: CalendarItemType) => void;
}

const weekdayLabels = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const typeIcons: Record<CalendarItemType, LucideIcon> = {
  assignment: FileText,
  class: BookOpen,
  event: CalendarDays,
  study: Brain,
  exam: GraduationCap,
};
function typeTreatment(type: CalendarItemType): string {
  if (type === 'assignment') return 'border-l-[3px]';
  if (type === 'class') return 'border-dotted';
  if (type === 'study') return 'border-dashed';
  if (type === 'exam') return 'ring-1 ring-inset font-extrabold';
  return 'border-solid';
}

type WeekLayout = {
  lanes: Map<string, number>;
  rangeDays: Map<string, Set<number>>;
};

function layoutWeek(dates: Date[], itemsByDate: Map<string, CalendarItem[]>): WeekLayout {
  const groups = new Map<string, { item: CalendarItem; days: Set<number> }>();
  dates.forEach((date, dayIndex) => {
    (itemsByDate.get(toIsoDate(date)) ?? []).forEach((item) => {
      const group = groups.get(item.rangeId) ?? { item, days: new Set<number>() };
      group.days.add(dayIndex);
      groups.set(item.rangeId, group);
    });
  });

  const ordered = [...groups.entries()].sort(([, a], [, b]) => {
    const aDays = [...a.days];
    const bDays = [...b.days];
    const startDifference = Math.min(...aDays) - Math.min(...bDays);
    if (startDifference) return startDifference;
    const durationDifference = bDays.length - aDays.length;
    if (durationDifference) return durationDifference;
    return `${a.item.typeLabel} ${a.item.title}`.localeCompare(`${b.item.typeLabel} ${b.item.title}`);
  });

  const occupied: boolean[][] = [];
  const lanes = new Map<string, number>();
  const rangeDays = new Map<string, Set<number>>();
  ordered.forEach(([rangeId, group]) => {
    let lane = 0;
    while (group.days.size > 0 && [...group.days].some((day) => occupied[lane]?.[day])) lane += 1;
    if (!occupied[lane]) occupied[lane] = Array(7).fill(false);
    group.days.forEach((day) => {
      occupied[lane][day] = true;
    });
    lanes.set(rangeId, lane);
    rangeDays.set(rangeId, group.days);
  });
  return { lanes, rangeDays };
}

function CalendarLegend({
  compact = false,
  visibleTypes,
  onTypeToggle,
}: {
  compact?: boolean;
  visibleTypes?: ReadonlySet<CalendarItemType>;
  onTypeToggle?: (type: CalendarItemType) => void;
}) {
  const compactLabels: Partial<Record<CalendarItemType, string>> = {
    class: 'Course',
    study: 'Plan',
  };
  return (
    <div
      className={cn(
        'items-center px-1 pb-2',
        compact
          ? 'calendar-filter-strip -mx-1 flex flex-nowrap gap-1 overflow-x-auto px-1.5'
          : 'flex flex-wrap gap-x-3 gap-y-1'
      )}
      aria-label="Calendar item filters"
    >
      {CALENDAR_ITEM_TYPES.map((type) => {
        const Icon = typeIcons[type];
        const isVisible = visibleTypes?.has(type) ?? true;
        const label = CALENDAR_TYPE_LABELS[type];
        return (
          <button
            key={type}
            type="button"
            title={`${isVisible ? 'Hide' : 'Show'} ${label}`}
            aria-label={`${isVisible ? 'Hide' : 'Show'} ${label}`}
            aria-pressed={isVisible}
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold transition-colors sm:text-xs',
              compact && 'px-2 py-1',
              isVisible
                ? 'border-border bg-background text-foreground shadow-sm'
                : 'border-transparent bg-muted/60 text-muted-foreground opacity-55'
            )}
            onClick={() => onTypeToggle?.(type)}
          >
            <Icon className="h-3 w-3" aria-hidden="true" />
            {compact ? compactLabels[type] ?? label : label}
          </button>
        );
      })}
    </div>
  );
}

function CalendarMonthGrid({
  year,
  month,
  itemsByDate,
  onDayClick,
  selectedDate,
  variant = 'desktop',
  className,
  visibleTypes,
  onTypeToggle,
}: Props) {
  const dates = getMonthGridDates(year, month);
  const weeks = Array.from({ length: 6 }, (_, index) => dates.slice(index * 7, index * 7 + 7));
  const weekLayouts = weeks.map((week) => layoutWeek(week, itemsByDate));
  const todayIso = toIsoDate(new Date());
  const isMobile = variant === 'mobile';

  return (
    <div className={cn('flex h-full min-h-0 flex-col', isMobile && 'mobile-surface p-3', className)}>
      <CalendarLegend compact={isMobile} visibleTypes={visibleTypes} onTypeToggle={onTypeToggle} />
      <div className={cn('grid grid-cols-7', isMobile ? 'pb-2' : 'border-b border-[var(--border-light)]')}>
        {weekdayLabels.map((label) => (
          <div
            key={label}
            className={cn(
              'px-1 py-1.5 text-center text-xs font-semibold',
              isMobile ? 'text-[0.68rem] text-[var(--secondary-accent)]' : 'text-muted-foreground'
            )}
          >
            {label}
          </div>
        ))}
      </div>
      <div
        className={cn(
          'grid min-h-0 flex-1 grid-rows-6',
          isMobile ? 'overflow-hidden rounded-lg border border-[var(--border-light)]' : 'overflow-y-auto'
        )}
      >
        {weeks.map((week, weekIndex) => {
          const layout = weekLayouts[weekIndex];
          return (
            <div key={toIsoDate(week[0])} className="grid min-h-0 grid-cols-7">
              {week.map((date, dayIndex) => {
                const iso = toIsoDate(date);
                const isCurrentMonth = date.getMonth() === month;
                const isToday = iso === todayIso;
                const isSelected = iso === selectedDate;
                const items = itemsByDate.get(iso) ?? [];
                const visibleItems = items
                  .filter((item) => (layout.lanes.get(item.rangeId) ?? 99) < 3)
                  .sort((a, b) => (layout.lanes.get(a.rangeId) ?? 99) - (layout.lanes.get(b.rangeId) ?? 99));
                const hiddenCount = items.length - visibleItems.length;

                return (
                  <button
                    key={iso}
                    type="button"
                    onClick={() => onDayClick(iso)}
                    aria-label={`${date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' })}${items.length ? `, ${items.length} item${items.length === 1 ? '' : 's'}` : ''}`}
                    className={cn(
                      'min-w-0 border-b border-r border-[var(--border-light)] transition-colors hover:bg-primary/5',
                      isMobile
                        ? 'relative flex min-h-0 flex-col items-center justify-start overflow-hidden p-1 pt-1.5 text-center text-[var(--secondary-accent)]'
                        : 'flex min-h-[60px] flex-col items-stretch p-1 text-left sm:min-h-[80px] sm:p-1.5 md:min-h-[96px] xl:min-h-[80px]',
                      !isCurrentMonth && (isMobile ? 'text-muted-foreground/55' : 'bg-muted/40 text-muted-foreground'),
                      isSelected && isMobile && 'bg-primary/5'
                    )}
                  >
                    <span
                      className={cn(
                        'inline-flex shrink-0 items-center justify-center self-center font-semibold',
                        isMobile ? 'h-6 w-6 rounded-full text-xs' : 'h-5 w-5 rounded-full text-[10px] sm:h-6 sm:w-6 sm:text-xs',
                        (isToday || (isMobile && isSelected)) && 'bg-primary text-primary-foreground shadow-[0_8px_16px_rgb(248_173_157/0.28)]'
                      )}
                    >
                      {date.getDate()}
                    </span>

                    <div className={cn('mt-1 grid w-full grid-rows-3', isMobile ? 'h-4 gap-px' : 'gap-0.5')}>
                      {visibleItems.map((item) => {
                        const lane = layout.lanes.get(item.rangeId) ?? 0;
                        const days = layout.rangeDays.get(item.rangeId) ?? new Set([dayIndex]);
                        const continuesLeft = days.has(dayIndex - 1);
                        const continuesRight = days.has(dayIndex + 1);
                        const Icon = typeIcons[item.type];
                        const rangeLabel = item.isMultiDay
                          ? `${item.typeLabel}: ${item.title}, ${item.rangeStart} through ${item.rangeEnd}`
                          : `${item.typeLabel}: ${item.title}`;
                        return isMobile ? (
                          <span
                            key={item.id}
                            title={rangeLabel}
                            className={cn(
                              'relative z-10 flex h-1.5 self-center border',
                              item.isMultiDay ? 'w-[calc(100%+0.55rem)]' : 'w-3',
                              !continuesLeft && (item.type === 'assignment' ? 'rounded-l-sm' : 'rounded-l-full'),
                              !continuesRight && (item.type === 'exam' ? 'rounded-r-sm' : 'rounded-r-full'),
                              typeTreatment(item.type)
                            )}
                            style={{
                              gridRow: lane + 1,
                              gridColumn: 1,
                              backgroundColor: item.type === 'event' ? 'var(--calendar-event-solid)' : item.color,
                              borderColor: item.borderColor,
                              marginLeft: continuesLeft ? '-0.55rem' : undefined,
                              marginRight: continuesRight ? '-0.55rem' : undefined,
                            }}
                          >
                            {!item.isMultiDay && <Icon className="sr-only" aria-hidden="true" />}
                          </span>
                        ) : (
                          <span
                            key={item.id}
                            title={rangeLabel}
                            className={cn(
                              'relative z-10 flex h-5 min-w-0 items-center gap-1 border px-1 text-[8px] font-semibold sm:text-[10px]',
                              !continuesLeft && 'rounded-l',
                              !continuesRight && 'rounded-r',
                              typeTreatment(item.type)
                            )}
                            style={{
                              gridRow: lane + 1,
                              gridColumn: 1,
                              backgroundColor: item.color,
                              borderColor: item.borderColor,
                              color: item.textColor,
                              marginLeft: continuesLeft ? '-0.45rem' : undefined,
                              marginRight: continuesRight ? '-0.45rem' : undefined,
                            }}
                          >
                            {!continuesLeft && <Icon className="h-2.5 w-2.5 shrink-0" aria-hidden="true" />}
                            <span className="truncate">{!continuesLeft && item.title}</span>
                          </span>
                        );
                      })}
                    </div>
                    {hiddenCount > 0 && !isMobile && (
                      <span className="mt-0.5 text-[9px] text-muted-foreground">+{hiddenCount} more</span>
                    )}
                    {hiddenCount > 0 && isMobile && (
                      <span className="absolute bottom-0 right-0.5 text-[8px] font-bold text-muted-foreground">+{hiddenCount}</span>
                    )}
                  </button>
                );
              })}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default CalendarMonthGrid;
