import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import type { Assignment, Course } from '@/app/data/types';
import { getBrowserTimeZone } from '@/app/data/assignmentDates';

const schema = z.object({
  name: z.string().min(1, 'Assignment name is required'),
  courseId: z.string().min(1, 'Course is required'),
  dueDate: z.string().min(1, 'Due date is required'),
  dueTime: z.string().optional(),
  dueTimeZone: z.string().min(1, 'Time zone is required'),
  completed: z.boolean(),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  courses: Course[];
  assignment?: Assignment | null;
  onSubmit: (values: Omit<Assignment, 'id'> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

const emptyValues: FormValues = {
  name: '',
  courseId: '',
  dueDate: '',
  dueTime: '',
  dueTimeZone: getBrowserTimeZone(),
  completed: false,
  description: '',
};

function AssignmentFormDialog({ open, onOpenChange, courses, assignment, onSubmit, onDelete }: Props) {
  const isEdit = Boolean(assignment);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        assignment
          ? {
              name: assignment.name,
              courseId: assignment.courseId,
              dueDate: assignment.dueDate,
              dueTime: assignment.dueTime ?? '',
              dueTimeZone: assignment.dueTimeZone,
              completed: assignment.status === 'completed',
              description: assignment.description ?? '',
            }
          : { ...emptyValues, dueTimeZone: getBrowserTimeZone() }
      );
    }
  }, [open, assignment, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({
      ...values,
      dueTime: values.dueTime || undefined,
      description: values.description || undefined,
      status: values.completed ? 'completed' : 'upcoming',
      id: assignment?.id,
    });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (assignment && onDelete && confirm('Are you sure you want to delete this assignment?')) {
      onDelete(assignment.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Assignment' : 'Add Assignment'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Assignment Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Project Report" {...field} />
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
              name="dueDate"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Date</FormLabel>
                  <FormControl>
                    <Input type="date" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="dueTime"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Due Time (optional)</FormLabel>
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
                    <Textarea placeholder="Details about the assignment" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            {isEdit && (
              <FormField
                control={form.control}
                name="completed"
                render={({ field }) => (
                  <FormItem>
                    <FormControl>
                      <label className="flex items-center gap-2 text-sm font-medium text-[var(--text-secondary)]">
                        <Input
                          type="checkbox"
                          className="h-4 w-4"
                          checked={field.value}
                          onChange={(event) => field.onChange(event.target.checked)}
                        />
                        Completed
                      </label>
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            )}
            <DialogFooter className="flex items-center justify-between">
              {isEdit && onDelete ? (
                <Button type="button" variant="destructive" onClick={handleDelete}>
                  Delete
                </Button>
              ) : (
                <span />
              )}
              <Button type="submit">{isEdit ? 'Save Changes' : 'Add Assignment'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default AssignmentFormDialog;
