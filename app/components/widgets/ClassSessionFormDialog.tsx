import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { ClassSession, Course } from '@/app/data/types';

const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] as const;

const schema = z.object({
  courseId: z.string().min(1, 'Course is required'),
  day: z.enum(days),
  startTime: z.string().min(1, 'Start time is required').regex(/^\d{2}:\d{2}$/, 'Start time must be in HH:MM format'),
  endTime: z.string().min(1, 'End time is required').regex(/^\d{2}:\d{2}$/, 'End time must be in HH:MM format'),
  location: z.string().max(120, 'Location must be 120 characters or fewer').optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  session?: ClassSession | null;
  onSubmit: (values: Omit<ClassSession, 'id'> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

const emptyValues: FormValues = { courseId: '', day: 'Mon', startTime: '', endTime: '', location: '' };

// Normalize time to HH:MM format, handling HH:MM:SS from database
function normalizeTime(time: string): string {
  if (!time) return '';
  // If it's already HH:MM, return as-is
  if (/^\d{2}:\d{2}$/.test(time)) return time;
  // Extract HH:MM from HH:MM:SS or other formats
  const match = time.match(/(\d{1,2}):(\d{2})/);
  if (match) {
    const hour = match[1].padStart(2, '0');
    const minute = match[2];
    return `${hour}:${minute}`;
  }
  return time;
}

function ClassSessionFormDialog({ open, onOpenChange, courses, session, onSubmit, onDelete }: Props) {
  const isEdit = Boolean(session);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        session
          ? {
              courseId: session.courseId,
              day: session.day,
              startTime: normalizeTime(session.startTime),
              endTime: normalizeTime(session.endTime),
              location: session.location ?? '',
            }
          : emptyValues
      );
    }
  }, [open, session, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      ...values,
      startTime: normalizeTime(values.startTime),
      endTime: normalizeTime(values.endTime),
      location: values.location?.trim() || undefined,
      id: session?.id,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (session && onDelete && confirm('Are you sure you want to delete this class session?')) {
      onDelete(session.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Class Session' : 'Add Class Session'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="courseId"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a course" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {courses.map((c) => (
                        <SelectItem key={c.id} value={c.id}>
                          {c.code} - {c.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="day"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Day</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue placeholder="Select a day" />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {days.map((d) => (
                        <SelectItem key={d} value={d}>
                          {d}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="flex flex-col gap-4 sm:grid sm:grid-cols-2">
              <FormField
                control={form.control}
                name="startTime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={field.value}
                        onChange={(e) => field.onChange(normalizeTime(e.target.value))}
                        onBlur={field.onBlur}
                      />
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
                    <FormLabel>End Time</FormLabel>
                    <FormControl>
                      <Input
                        type="time"
                        value={field.value}
                        onChange={(e) => field.onChange(normalizeTime(e.target.value))}
                        onBlur={field.onBlur}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="location"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Location</FormLabel>
                  <FormControl>
                    <Input placeholder="Science Center S202" {...field} value={field.value ?? ''} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <DialogFooter className="flex items-center justify-between">
              {isEdit && onDelete ? (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit">{isEdit ? 'Save Changes' : 'Add Class'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default ClassSessionFormDialog;
