import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { Plus, Pencil, Trash2, GraduationCap, ChevronRight } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import CourseFormDialog from '@/app/components/widgets/CourseFormDialog';
import { mapCourse } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import type { Course } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

function CoursesPage() {
  const { user } = useAuth();
  const [courseRows, loading, , refresh] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [addCourse] = useMutateAction('createCourse');
  const [editCourse] = useMutateAction('updateCourse');
  const [removeCourse] = useMutateAction('deleteCourse');
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);

  const courses = (courseRows ?? []).map(mapCourse);

  const openAddDialog = () => {
    setEditing(null);
    setDialogOpen(true);
  };

  const openEditDialog = (course: Course, e: React.MouseEvent) => {
    e.stopPropagation();
    setEditing(course);
    setDialogOpen(true);
  };

  const handleSubmit = async (values: Omit<Course, 'id'> & { id?: string }) => {
    if (values.id) {
      await editCourse({ id: values.id, code: values.code, name: values.name, color: values.color, userId: user?.id });
    } else {
      await addCourse({ code: values.code, name: values.name, color: values.color, userId: user?.id });
    }
    refresh();
  };

  const handleDelete = async (id: string) => {
    await removeCourse({ id, userId: user?.id });
    refresh();
  };

  if (loading && courses.length === 0) {
    return <div className="p-6 text-center text-muted-foreground">Loading courses...</div>;
  }

  return (
    <div className="flex h-full flex-col gap-4">
      <Card className="flex min-h-0 flex-1 flex-col">
        <CardHeader className="flex flex-row items-center justify-between gap-4">
          <CardTitle>Courses</CardTitle>
          <Button onClick={openAddDialog} className="gap-2">
            <Plus className="h-4 w-4" />
            Add Course
          </Button>
        </CardHeader>
        <CardContent className="min-h-0 flex-1 overflow-auto">
          {courses.length === 0 ? (
            <div className="flex flex-col items-center justify-center gap-2 py-16 text-center">
              <GraduationCap className="h-8 w-8 text-muted-foreground" />
              <p className="text-sm font-semibold text-primary">No courses yet</p>
              <p className="text-xs text-muted-foreground">Add your first course to get started.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {courses.map((course) => {
                const colors = getCourseColor(course.color);
                return (
                  <div
                    key={course.id}
                    role="button"
                    onClick={() => navigate(`/courses/${course.id}`)}
                    className="group flex cursor-pointer flex-col gap-3 rounded-xl border-l-4 bg-card p-4 shadow-sm transition-shadow hover:shadow-md"
                    style={{ borderLeftColor: colors.border }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span
                        className="rounded-full px-2.5 py-1 text-xs font-bold"
                        style={{ backgroundColor: colors.bg, color: colors.text }}
                      >
                        {course.code}
                      </span>
                      <div className="flex shrink-0 items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100">
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="Edit" onClick={(e) => openEditDialog(course, e)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Delete"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (confirm('Deleting this course also removes its assignments and class sessions. Continue?')) {
                              handleDelete(course.id);
                            }
                          }}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-destructive" />
                        </Button>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold text-foreground">{course.name}</p>
                      <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <CourseFormDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        course={editing}
        onSubmit={handleSubmit}
        onDelete={editing ? handleDelete : undefined}
      />
    </div>
  );
}

export default CoursesPage;
