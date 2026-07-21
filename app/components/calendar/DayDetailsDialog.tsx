import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import type { CalendarItem } from '@/app/data/calendarUtils';
import type { ClassSession } from '@/app/data/types';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  date: string | null;
  items: CalendarItem[];
  onEventClick?: (item: CalendarItem) => void;
}

const typeLabels: Record<CalendarItem['type'], string> = {
  assignment: 'Assignment',
  class: 'Class',
  event: 'Event',
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

function DayDetailsDialog({ open, onOpenChange, date, items, onEventClick }: Props) {
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
            {items.map((item) => (
              <li
                key={item.id}
                onClick={() => item.type === 'event' && onEventClick?.(item)}
                className={`flex items-start gap-3 rounded-lg border border-[var(--border-light)] p-3 ${
                  item.type === 'event' ? 'cursor-pointer hover:opacity-80 transition-opacity' : ''
                }`}
                style={{ backgroundColor: item.color, borderColor: item.borderColor, color: item.textColor }}
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px] uppercase">
                      {typeLabels[item.type]}
                    </Badge>
                    {item.time && <span className="text-xs opacity-80">{formatTimeDisplay(item.time)}</span>}
                  </div>
                  <p className="mt-1 text-sm font-semibold">{item.title}</p>
                  {item.type === 'class' && (item.raw as ClassSession).location && (
                    <p className="mt-0.5 text-xs opacity-80">{(item.raw as ClassSession).location}</p>
                  )}
                  {'description' in item.raw && item.raw.description && (
                    <p className="mt-0.5 text-xs opacity-80">{item.raw.description}</p>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default DayDetailsDialog;
