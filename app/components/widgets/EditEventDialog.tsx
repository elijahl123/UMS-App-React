import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { CalendarEvent, Course } from '@/app/data/types';
import { getBrowserTimeZone } from '@/app/data/assignmentDates';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  endDate: z.string().optional(),
  time: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
  courseId: z.string().optional(),
  academicClass: z.boolean(),
}).superRefine((values, context) => {
  if (values.endDate && values.endDate < values.date) {
    context.addIssue({ code: 'custom', path: ['endDate'], message: 'End date cannot be before the start date' });
  }
  if (!values.time && values.endTime) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'Choose a start time first' });
  }
  const isMultiDay = Boolean(values.endDate && values.endDate !== values.date);
  if (values.time && isMultiDay && !values.endTime) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time is required for a timed multi-day event' });
  }
  if (values.time && values.endTime && !isMultiDay && values.endTime <= values.time) {
    context.addIssue({ code: 'custom', path: ['endTime'], message: 'End time must be after the start time' });
  }
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  event: (CalendarEvent & { id: string }) | null;
  onSubmit: (event: CalendarEvent & { id: string }) => void;
  onDelete?: (eventId: string) => void;
  courses?: Course[];
}

function EditEventDialog({ open, onOpenChange, event, onSubmit, onDelete, courses = [] }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', date: '', endDate: '', time: '', endTime: '', description: '', courseId: '', academicClass: false },
  });

  useEffect(() => {
    if (event) {
      form.reset({
        title: event.title,
        date: event.date,
        endDate: event.endDate ?? '',
        time: event.time ?? '',
        endTime: event.endTime ?? '',
        description: event.description ?? '',
        courseId: event.courseId ?? '',
        academicClass: event.academicKind === 'class',
      });
    }
  }, [event, form]);

  const handleSubmit = (values: FormValues) => {
    if (event) {
      onSubmit({
        ...values,
        id: event.id,
        endDate: values.endDate && values.endDate !== values.date ? values.endDate : undefined,
        time: values.time || undefined,
        endTime: values.endTime || undefined,
        timeZone: event.timeZone || getBrowserTimeZone(),
        description: values.description || undefined,
        sourceProvider: event.sourceProvider,
        googleEventId: event.googleEventId,
        googleCalendarId: event.googleCalendarId,
        recurringSeriesId: event.recurringSeriesId,
        recurrenceOriginalStart: event.recurrenceOriginalStart,
        courseId: values.courseId || undefined,
        academicKind: values.courseId && values.academicClass ? 'class' : undefined,
      });
      form.reset();
      onOpenChange(false);
    }
  };

  const handleDelete = () => {
    if (event && onDelete && confirm('Are you sure you want to delete this event?')) {
      onDelete(event.id);
      form.reset();
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit Event</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Event Title</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Study Group" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course association (optional)</FormLabel>
                  <FormControl>
                    <select className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" {...field}>
                      <option value="">No course</option>
                      {courses.map((course) => <option key={course.id} value={course.id}>{course.code} — {course.name}</option>)}
                    </select>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {form.watch('courseId') && <FormField
              control={form.control}
              name="academicClass"
              render={({ field }) => (
                <FormItem>
                  <label className="flex items-center gap-2 text-sm">
                    <input type="checkbox" checked={field.value} onChange={field.onChange} />
                    Treat this event as an academic class
                  </label>
                </FormItem>
              )}
            />}
            <FormField
              control={form.control}
              name="date"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Date (optional)</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="time"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Time (optional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="endTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>End Time (optional)</FormLabel>
                  <FormControl>
                    <Input type="time" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Description (optional)</FormLabel>
                  <FormControl>
                    <Textarea placeholder="Details about the event" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex items-center justify-between">
              <Button type="button" variant="destructive" onClick={handleDelete}>
                Delete
              </Button>
              <Button type="submit">Save Changes</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default EditEventDialog;
