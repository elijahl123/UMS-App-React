import { useState } from 'react';
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
      <CardHeader className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between sm:space-y-0 pb-4">
        <CardTitle>Upcoming Events</CardTitle>
        <Button size="sm" className="bg-primary/15 text-primary hover:bg-primary/25 w-full sm:w-auto" onClick={() => setOpen(true)}>
          <Plus className="mr-1 h-4 w-4" />
          Add Event
        </Button>
      </CardHeader>
      <CardContent className={events.length === 0 ? 'flex items-center justify-center' : undefined}>
        {events.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-4 text-center">
            <img
              src="/storages/zwD6Awu5SX/static/NoEvents.svg"
              alt="No events"
              className="h-32 w-auto sm:h-36"
            />
            <div>
              <p className="text-base font-semibold text-primary">No Upcoming Events</p>
              <p className="text-xs text-muted-foreground">Check back soon!</p>
            </div>
          </div>
        ) : (
          <ul className="flex flex-col gap-2">
            {events.map((e) => (
              <li key={e.id} className="flex gap-3 rounded-lg border border-[var(--border-light)] p-3 transition-colors hover:bg-primary/5">
                <Calendar className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-sm text-foreground truncate">{e.title}</p>
                  <p className="text-xs text-muted-foreground">{e.date}</p>
                </div>
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
