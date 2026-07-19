import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Card, CardHeader, CardTitle, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Plus, Calendar, ChevronRight } from 'lucide-react';
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
    <Card className="rounded-xl border border-[var(--border-light)] shadow-md md:rounded-lg md:border-2 md:border-primary md:shadow-none">
      <CardHeader className={`shrink-0 gap-2 p-4 pb-3 ${compact ? 'flex-row items-center justify-between space-y-0 sm:p-4 sm:pb-2' : 'sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4'}`}>
        <div className="flex min-w-0 items-center gap-2">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary md:hidden">
            <Calendar className="h-5 w-5" />
          </span>
          <CardTitle className={compact ? 'whitespace-nowrap text-[0.98rem] text-primary md:text-lg xl:text-xl' : 'text-lg sm:text-2xl'}>Upcoming Events</CardTitle>
        </div>
        <Button size="sm" variant="ghost" className={`text-primary hover:bg-primary/10 hover:text-primary ${compact ? 'w-auto px-2' : 'w-full sm:w-auto'}`} onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          <span>{compact ? 'Add' : 'Add Event'}</span>
        </Button>
      </CardHeader>
      <CardContent className={events.length === 0 ? `min-h-0 ${compact ? 'flex items-center justify-center overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6'}` : `min-h-0 ${compact ? 'overflow-hidden px-4 pb-4 sm:px-4 sm:pb-4' : 'px-4 pb-4 sm:px-6 sm:pb-6'}`}>
        {events.length === 0 ? (
          <div className={`flex w-full flex-col items-center justify-center rounded-lg border border-emerald-100 bg-emerald-50/70 py-5 text-center md:h-full md:flex-1 md:py-0 ${compact ? 'gap-2' : 'gap-4'}`}>
            <img
              src="/storages/zwD6Awu5SX/static/NoEvents.svg"
              alt="No events"
              className={compact ? 'hidden h-16 w-auto max-w-[60%] sm:block xl:h-20' : 'h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]'}
            />
            <div>
              <p className="text-base font-semibold text-[var(--secondary-accent)]">No Upcoming Events</p>
              <p className="text-xs text-muted-foreground">Check back soon!</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {visibleEvents.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/calendar?date=${encodeURIComponent(e.date)}`}
                  className={`flex items-center rounded-lg border transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring ${compact ? 'gap-3 p-3' : 'gap-3 p-3'}`}
                  style={{ backgroundColor: 'var(--course-blue)', borderColor: '#9fb6e6', color: '#1F3A66' }}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--surface)]/55">
                    <Calendar className="h-5 w-5" />
                  </span>
                  <div className="flex-1 min-w-0">
                    <p className={`truncate font-bold ${compact ? 'text-sm' : 'text-sm'}`}>{e.title}</p>
                    <p className="text-xs opacity-80">{e.date}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 shrink-0 text-[#1F3A66]/65" />
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
