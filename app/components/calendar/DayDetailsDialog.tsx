import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CalendarItem } from '@/app/data/calendarUtils';
import type { CalendarEvent, ClassSession, StudyDay } from '@/app/data/types';
import { BookOpen, Brain, CalendarDays, Check, FileText, GraduationCap, type LucideIcon } from 'lucide-react';
import { formatStudyMinutes } from '@/app/data/studyPlans';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  items: CalendarItem[];
  onEventClick?: (item: CalendarItem) => void;
  onItemClick?: (item: CalendarItem) => void;
  onStudyTaskToggle?: (planId: string, taskId: string, completed: boolean) => void;
}

const typeIcons: Record<CalendarItem['type'], LucideIcon> = {
  assignment: FileText,
  class: BookOpen,
  event: CalendarDays,
  study: Brain,
  exam: GraduationCap,
};

function formatTimeDisplay(time: string): string {
  // Convert HH:MM or HH:MM:SS to 12-hour format for display
  const match = time.match(/^(\d{1,2}):(\d{2})(?::\d{2})?$/);
  if (!match) return time;
  const hours = parseInt(match[1], 10);
  const minutes = match[2];
  const period = hours < 12 ? 'a.m.' : 'p.m.';
  const displayHour = hours % 12 === 0 ? 12 : hours % 12;
  return `${displayHour}:${minutes} ${period}`;
}

function formatItemTime(item: CalendarItem): string | null {
  if (!item.time) return null;
  const start = formatTimeDisplay(item.time);
  if (item.type !== 'event') return start;
  const endTime = (item.raw as CalendarEvent).endTime;
  return endTime ? `${start} - ${formatTimeDisplay(endTime)}` : start;
}

function formatRangeDate(value: string, includeYear: boolean): string {
  return new Date(`${value}T00:00:00`).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    ...(includeYear ? { year: 'numeric' } : {}),
  });
}

function formatItemRange(item: CalendarItem): string | null {
  if (!item.isMultiDay) return null;
  const sameYear = item.rangeStart.slice(0, 4) === item.rangeEnd.slice(0, 4);
  return `${formatRangeDate(item.rangeStart, !sameYear)} – ${formatRangeDate(item.rangeEnd, true)}`;
}

function detailTreatment(type: CalendarItem['type']): string {
  if (type === 'class') return 'border-dotted';
  if (type === 'study') return 'border-dashed';
  if (type === 'exam') return 'ring-1 ring-inset ring-[var(--mobile-item-border)]';
  if (type === 'assignment') return 'border-l-4';
  return '';
}

function DayDetailsDialog({ open, onOpenChange, date, items, onEventClick, onItemClick, onStudyTaskToggle }: Props) {
  const formattedDate = date
    ? new Date(`${date}T00:00:00`).toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
        year: 'numeric',
      })
    : '';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{formattedDate}</DialogTitle>
        </DialogHeader>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">Nothing scheduled for this day.</p>
        ) : (
          <ul className="flex flex-col gap-2 max-h-96 overflow-y-auto">
            {items.map((item) => {
              const Icon = typeIcons[item.type];
              const itemStyle = {
                '--mobile-item-bg': item.color,
                '--mobile-item-border': item.borderColor,
                '--mobile-item-text': item.textColor,
              } as React.CSSProperties;
              return (
                <li
                  key={item.id}
                  onClick={() => {
                    if (item.type === 'event') onEventClick?.(item);
                    if (item.type === 'exam') onItemClick?.(item);
                  }}
                  className={`mobile-list-item flex items-start gap-3 ${detailTreatment(item.type)} ${
                    item.type === 'event' || item.type === 'exam' ? 'cursor-pointer hover:opacity-90 transition-opacity' : ''
                  }`}
                  style={itemStyle}
                >
                  <div className="mobile-list-rail min-h-14 w-1" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <Badge variant="outline" className="gap-1 text-[10px] uppercase" style={{ borderColor: item.borderColor, color: item.textColor }}>
                        <Icon className="h-3 w-3" aria-hidden="true" />
                        {item.typeLabel}
                      </Badge>
                      {formatItemTime(item) && <span className="text-xs opacity-80">{formatItemTime(item)}</span>}
                    </div>
                    <p className="mt-1 text-sm font-semibold">{item.title}</p>
                    {formatItemRange(item) && (
                      <p className="mt-0.5 text-xs font-medium opacity-80">{formatItemRange(item)}</p>
                    )}
                    {item.type === 'class' && (item.raw as ClassSession).location && (
                      <p className="mt-0.5 text-xs opacity-80">{(item.raw as ClassSession).location}</p>
                    )}
                    {'description' in item.raw && item.raw.description && (
                      <p className="mt-0.5 text-xs opacity-80">{item.raw.description}</p>
                    )}
                    {item.type === 'study' && (
                      <div className="mt-3 space-y-2">
                        {(item.raw as StudyDay).tasks.map((task) => (
                          <button
                            key={task.id}
                            type="button"
                            className="flex w-full items-center gap-2 rounded-md bg-[color-mix(in_srgb,var(--card)_45%,transparent)] px-2 py-2 text-left"
                            onClick={(event) => {
                              event.stopPropagation();
                              onStudyTaskToggle?.(task.planId, task.id, !task.completedAt);
                            }}
                          >
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full border ${task.completedAt ? 'border-primary bg-primary text-primary-foreground' : 'border-muted-foreground/40'}`}>
                              {task.completedAt && <Check className="h-3 w-3" />}
                            </span>
                            <span className={`min-w-0 flex-1 text-xs font-semibold ${task.completedAt ? 'line-through opacity-60' : ''}`}>{task.title}</span>
                            <span className="text-[10px] opacity-75">{formatStudyMinutes(task.estimatedMinutes)}</span>
                          </button>
                        ))}
                        <button
                          type="button"
                          className="text-xs font-semibold text-primary hover:underline"
                          onClick={(event) => {
                            event.stopPropagation();
                            onItemClick?.(item);
                          }}
                        >
                          Open full study plan
                        </button>
                      </div>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DayDetailsDialog;
