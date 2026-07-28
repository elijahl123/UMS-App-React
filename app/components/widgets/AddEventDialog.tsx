import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import type { CalendarEvent } from '@/app/data/types';
import { getBrowserTimeZone } from '@/app/data/assignmentDates';

const schema = z.object({
  title: z.string().min(1, 'Title is required'),
  date: z.string().min(1, 'Date is required'),
  endDate: z.string().optional(),
  time: z.string().optional(),
  endTime: z.string().optional(),
  description: z.string().optional(),
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
  onSubmit: (event: Omit<CalendarEvent, 'id'>) => void;
}

function AddEventDialog({ open, onOpenChange, onSubmit }: Props) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { title: '', date: '', endDate: '', time: '', endTime: '', description: '' },
  });

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      ...values,
      endDate: values.endDate && values.endDate !== values.date ? values.endDate : undefined,
      time: values.time || undefined,
      endTime: values.endTime || undefined,
      timeZone: getBrowserTimeZone(),
      description: values.description || undefined,
    });
    form.reset();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Event</DialogTitle>
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
            <DialogFooter>
              <Button type="submit">Add Event</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default AddEventDialog;
