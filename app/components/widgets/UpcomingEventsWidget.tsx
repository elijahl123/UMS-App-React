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
}

function UpcomingEventsWidget({ events, onAdd }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <Card>
      <CardHeader className="flex flex-col gap-3 p-4 pb-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 sm:p-6 sm:pb-4">
        <CardTitle className="text-lg sm:text-2xl">Upcoming Events</CardTitle>
        <Button size="sm" className="bg-primary/15 text-primary hover:bg-primary/25 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Event
        </Button>
      </CardHeader>
      <CardContent className={events.length === 0 ? 'flex items-center justify-center px-4 pb-4 sm:px-6 sm:pb-6' : 'px-4 pb-4 sm:px-6 sm:pb-6'}>
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoEvents.svg"
              alt="No events"
              className="h-[clamp(5.5rem,18vw,8rem)] w-auto max-w-[70%]"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Upcoming Events</p>
              <p className="text-xs text-muted-foreground">Check back soon!</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id}>
                <Link
                  to={`/calendar?date=${encodeURIComponent(e.date)}`}
                  className="flex gap-3 rounded-lg border p-3 transition-all hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-ring"
                  style={{ backgroundColor: 'var(--course-blue)', borderColor: '#9fb6e6', color: '#1F3A66' }}
                >
                  <Calendar className="mt-0.5 h-4 w-4 shrink-0" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate text-sm font-bold">{e.title}</p>
                    <p className="text-xs opacity-80">{e.date}</p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
      <AddEventDialog open={open} onOpenChange={setOpen} onSubmit={onAdd} />
    </Card>
  );
}

export default UpcomingEventsWidget;
