import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Check } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { getCourseColor } from '@/app/data/courseColors';
import type { Course } from '@/app/data/types';

const COLOR_OPTIONS = [
  { key: 'course-green', label: 'Green' },
  { key: 'course-blue', label: 'Blue' },
  { key: 'course-yellow', label: 'Yellow' },
  { key: 'course-gray', label: 'Gray' },
];

const schema = z.object({
  code: z.string().min(1, 'Course code is required'),
  name: z.string().min(1, 'Course name is required'),
  color: z.string().min(1, 'Please pick a color'),
});

type FormValues = z.infer<typeof schema>;

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  course?: Course | null;
  onSubmit: (values: Omit<Course, 'id'> & { id?: string }) => void;
  onDelete?: (id: string) => void;
}

const emptyValues: FormValues = { code: '', name: '', color: 'course-gray' };

function CourseFormDialog({ open, onOpenChange, course, onSubmit, onDelete }: Props) {
  const isEdit = Boolean(course);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: emptyValues,
  });

  useEffect(() => {
    if (open) {
      form.reset(
        course
          ? { code: course.code, name: course.name, color: course.color }
          : emptyValues
      );
    }
  }, [open, course, form]);

  const handleSubmit = (values: FormValues) => {
    onSubmit({ ...values, id: course?.id });
    onOpenChange(false);
  };

  const handleDelete = () => {
    if (course && onDelete && confirm('Deleting this course also removes its assignments and class sessions. Continue?')) {
      onDelete(course.id);
      onOpenChange(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? 'Edit Course' : 'Add Course'}</DialogTitle>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="flex flex-col gap-4">
            <FormField
              control={form.control}
              name="code"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Code</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. CS 101" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Course Name</FormLabel>
                  <FormControl>
                    <Input placeholder="e.g. Intro to Computer Science" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="color"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Color</FormLabel>
                  <FormControl>
                    <div className="flex items-center gap-3">
                      {COLOR_OPTIONS.map((opt) => {
                        const colors = getCourseColor(opt.key);
                        const selected = field.value === opt.key;
                        return (
                          <button
                            key={opt.key}
                            type="button"
                            title={opt.label}
                            onClick={() => field.onChange(opt.key)}
                            className={cn(
                              'flex h-9 w-9 items-center justify-center rounded-full border-2 transition-transform',
                              selected ? 'scale-110 border-primary' : 'border-transparent'
                            )}
                            style={{ backgroundColor: colors.bg }}
                          >
                            {selected && <Check className="h-4 w-4" style={{ color: colors.text }} />}
                          </button>
                        );
                      })}
                    </div>
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
              <Button type="submit">{isEdit ? 'Save Changes' : 'Add Course'}</Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

export default CourseFormDialog;
