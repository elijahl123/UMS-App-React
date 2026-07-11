import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Calendar } from 'lucide-react';
import type { CalendarEvent } from '@/app/data/types';
import AddEventDialog from '@/app/components/widgets/AddEventDialog';

interface Props {
  events: CalendarEvent[];
  onAdd: (event: Omit<CalendarEvent, 'id'>) => void;
  compact?: boolean;
}

function UpcomingEventsWidget({ events, onAdd, compact = false }: Props) {
  const [open, setOpen] = useState(false);
  const visibleEvents = compact ? events.slice(0, 2) : events;
  const hiddenCount = events.length - visibleEvents.length;

  return (
    <Card>
      <CardHeader className={`shrink-0 gap-2 p-3 pb-2 ${compact ? 'flex-row items-center justify-between space-y-0 sm:p-4 sm:pb-2' : 'sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4'}`}>
        <CardTitle className={compact ? 'text-base md:text-lg xl:text-xl' : 'text-lg sm:text-2xl'}>Upcoming Events</CardTitle>
        <Button size="sm" className={`bg-primary/15 text-primary hover:bg-primary/25 ${compact ? 'w-auto px-2' : 'w-full sm:w-auto'}`} onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          <span>{compact ? 'Add' : 'Add Event'}</span>
        </Button>
      </CardHeader>
      <CardContent className={events.length === 0 ? `min-h-0 ${compact ? 'flex items-center justify-center overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4' : 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6'}` : `min-h-0 ${compact ? 'overflow-hidden px-3 pb-3 sm:px-4 sm:pb-4' : 'px-4 pb-4 sm:px-6 sm:pb-6'}`}>
        {events.length === 0 ? (
          <div className={`flex flex-col items-center justify-center text-center ${compact ? 'gap-2' : 'gap-4'}`}>
            <img
              src="/storages/zwD6Awu5SX/static/NoEvents.svg"
              alt="No events"
              className={compact ? 'hidden h-16 w-auto max-w-[60%] sm:block xl:h-20' : 'h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]'}
            />
            <div>
              <p className="text-base font-semibold text-primary">No Upcoming Events</p>
              <p className="text-xs text-muted-foreground">Check back soon!</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleEvents.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/calendar?date=${encodeURIComponent(e.date)}`}
                  className={`flex rounded-lg border transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${compact ? 'gap-2 p-2' : 'gap-3 p-3'}`}
                  style={{ backgroundColor: 'var(--course-blue)', borderColor: '#9fb6e6', color: '#1F3A66' }}
                >
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className={`truncate font-bold ${compact ? 'text-xs sm:text-sm' : 'text-sm'}`}>{e.title}</p>
                    <p className="text-xs opacity-80">{e.date}</p>
                  </div>
                </Link>
              </li>
            ))}
            {hiddenCount > 0 && (
              <li className="rounded-lg border border-[var(--border-light)] px-3 py-1.5 text-center text-xs font-semibold text-muted-foreground">
                +{hiddenCount} more
              </li>
            )}
          </ul>
        )}
      </CardContent>
      <AddEventDialog open={open} onOpenChange={setOpen} onSubmit={onAdd} />
    </Card>
  );
}

export default UpcomingEventsWidget;
