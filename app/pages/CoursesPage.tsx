import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { ChevronRight, GraduationCap, Pencil, Plus, Search, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import CourseFormDialog from '@/app/components/widgets/CourseFormDialog';
import { mapAssignment, mapCourse } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import type { Assignment, Course } from '@/app/data/types';
import { useAuth } from '@/app/lib/auth/AuthContext';

type CourseFilter = 'all' | 'current' | 'complete';

function CoursesPage() {
  const { user } = useAuth();
  const [courseRows, loading, , refresh] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [assignmentRows] = useLoadAction('loadAssignments', [], { userId: user?.id });
  const [addCourse] = useMutateAction('createCourse');
  const [editCourse] = useMutateAction('updateCourse');
  const [removeCourse] = useMutateAction('deleteCourse');
  const navigate = useNavigate();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Course | null>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [courseFilter, setCourseFilter] = useState<CourseFilter>('all');

  const courses = (courseRows ?? []).map(mapCourse);
  const assignments = (assignmentRows ?? []).map(mapAssignment);

  const courseStats = useMemo(() => {
    const stats = new Map<string, { completed: number; total: number }>();
    assignments.forEach((assignment: Assignment) => {
      const current = stats.get(assignment.courseId) ?? { completed: 0, total: 0 };
      current.total += 1;
      if (assignment.status === 'completed') current.completed += 1;
      stats.set(assignment.courseId, current);
    });
    return stats;
  }, [assignments]);

  const filterCounts = useMemo(() => {
    const current = courses.filter((course) => {
      const stats = courseStats.get(course.id) ?? { completed: 0, total: 0 };
      return stats.total === 0 || stats.completed < stats.total;
    }).length;
    const complete = courses.filter((course) => {
      const stats = courseStats.get(course.id) ?? { completed: 0, total: 0 };
      return stats.total > 0 && stats.completed === stats.total;
    }).length;
    return { all: courses.length, current, complete };
  }, [courseStats, courses]);

  const filteredCourses = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    return courses
      .filter((course) => !query || course.code.toLowerCase().includes(query) || course.name.toLowerCase().includes(query))
      .filter((course) => {
        const stats = courseStats.get(course.id) ?? { completed: 0, total: 0 };
        if (courseFilter === 'current') return stats.total === 0 || stats.completed < stats.total;
        if (courseFilter === 'complete') return stats.total > 0 && stats.completed === stats.total;
        return true;
      });
  }, [courseFilter, courseStats, courses, searchTerm]);

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

  const tabs: Array<{ value: CourseFilter; label: string; count: number }> = [
    { value: 'all', label: 'All Courses', count: filterCounts.all },
    { value: 'current', label: 'Current', count: filterCounts.current },
    { value: 'complete', label: 'Complete', count: filterCounts.complete },
  ];

  return (
    <div className="flex h-full min-h-0 flex-col">
      <section className="flex min-h-0 flex-1 flex-col gap-4 md:gap-0 md:rounded-lg md:border-2 md:border-primary md:bg-card md:text-card-foreground md:shadow-none">
      <header className="shrink-0 pr-20 md:flex md:flex-row md:items-center md:justify-between md:gap-4 md:p-6 md:pr-6">
        <div className="min-w-0">
          <h1 className="text-4xl font-bold leading-tight text-[var(--secondary-accent)] md:text-2xl md:leading-none md:text-primary">Courses</h1>
          <p className="mt-2 text-sm font-medium text-[var(--text-secondary)] md:hidden">Manage your courses and materials.</p>
        </div>
        <Button onClick={openAddDialog} className="hidden gap-2 md:inline-flex">
          <Plus className="h-4 w-4" />
          Add Course
        </Button>
      </header>

      <div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] gap-3 md:hidden">
        <div className="relative">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--text-secondary)]" />
          <Input
            value={searchTerm}
            onChange={(event) => setSearchTerm(event.target.value)}
            placeholder="Search courses..."
            className="h-14 rounded-lg border-[var(--border-light)] bg-[var(--surface)] pl-12 pr-4 text-base font-semibold text-[var(--secondary-accent)] shadow-[var(--shadow-xs)] placeholder:font-medium"
          />
        </div>
        <Button
          type="button"
          onClick={openAddDialog}
          className="h-14 rounded-lg border-[var(--main-color)] bg-[var(--main-color)] px-4 text-white shadow-[var(--shadow-sm)] hover:border-[var(--main-color-shade)] hover:bg-[var(--main-color-shade)] sm:px-5"
        >
          <Plus className="h-5 w-5" />
          <span className="hidden sm:inline">Add Course</span>
          <span className="sm:hidden">Add</span>
        </Button>
      </div>

      <div className="flex shrink-0 overflow-x-auto rounded-lg border border-[var(--border-light)] bg-[var(--surface)] p-1 shadow-[var(--shadow-xs)] md:hidden">
        {tabs.map((tab) => {
          const isActive = courseFilter === tab.value;
          return (
            <button
              key={tab.value}
              type="button"
              aria-pressed={isActive}
              onClick={() => setCourseFilter(tab.value)}
              className={`min-h-11 flex-1 whitespace-nowrap rounded-md px-2 text-xs font-bold leading-none transition-colors sm:px-3 sm:text-sm ${
                isActive
                  ? 'bg-[color-mix(in_srgb,var(--main-color)_18%,white)] text-[var(--main-accent)]'
                  : 'text-[var(--text-secondary)] hover:bg-[var(--secondary-color)]'
              }`}
            >
              {tab.label} ({tab.count})
            </button>
          );
        })}
      </div>

      <div className="min-h-0 flex-1 overflow-visible md:overflow-auto md:px-6 md:pb-6 md:pt-0">
        {courses.length === 0 ? (
          <div className="flex min-h-[18rem] flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-light)] bg-[var(--surface)] px-6 text-center shadow-[var(--shadow-xs)] md:min-h-0 md:border-0 md:bg-transparent md:py-16 md:shadow-none">
            <GraduationCap className="h-9 w-9 text-[var(--main-accent)] md:h-8 md:w-8 md:text-muted-foreground" />
            <p className="text-sm font-bold text-[var(--secondary-accent)] md:font-semibold md:text-primary">No courses yet</p>
            <p className="text-xs font-medium text-[var(--text-secondary)]">Add your first course to get started.</p>
          </div>
        ) : filteredCourses.length === 0 ? (
          <div className="flex min-h-[14rem] flex-col items-center justify-center gap-2 rounded-lg border border-[var(--border-light)] bg-[var(--surface)] px-6 text-center shadow-[var(--shadow-xs)]">
            <Search className="h-8 w-8 text-[var(--text-secondary)]" />
            <p className="text-sm font-bold text-[var(--secondary-accent)]">No matching courses</p>
            <p className="text-xs font-medium text-[var(--text-secondary)]">Try a different search or filter.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 pb-2 md:grid-cols-2 xl:grid-cols-3">
            {filteredCourses.map((course) => {
              const colors = getCourseColor(course.color);
              const stats = courseStats.get(course.id) ?? { completed: 0, total: 0 };
              const percent = stats.total > 0 ? Math.round((stats.completed / stats.total) * 100) : 0;
              const progressLabel = stats.total > 0 ? `${percent}% complete` : 'No assignments yet';

              return (
                <div
                  key={course.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/courses/${course.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') {
                      event.preventDefault();
                      navigate(`/courses/${course.id}`);
                    }
                  }}
                  className="group relative min-h-[142px] cursor-pointer overflow-hidden rounded-lg border border-[color-mix(in_srgb,var(--course-border)_58%,white)] bg-[linear-gradient(135deg,color-mix(in_srgb,var(--course-bg)_55%,white),color-mix(in_srgb,var(--course-bg)_18%,white))] p-3 pl-5 text-[var(--course-text)] shadow-[var(--shadow-xs)] transition-shadow hover:shadow-[var(--shadow-md)] sm:p-4 sm:pl-5 md:flex md:min-h-0 md:flex-col md:gap-3 md:rounded-xl md:border md:border-l-4 md:border-l-[var(--course-border)] md:bg-[var(--course-bg)] md:p-4 md:shadow-sm md:hover:shadow-md xl:[&_.course-actions]:opacity-0 xl:hover:[&_.course-actions]:opacity-100"
                  style={{
                    '--course-bg': colors.bg,
                    '--course-border': colors.border,
                    '--course-text': colors.text,
                  } as React.CSSProperties}
                >
                  <span className="absolute bottom-4 left-4 top-4 w-1 rounded-full bg-[var(--course-border)] md:hidden" />
                  <div className="flex min-w-0 pl-8 pr-24 sm:pr-28 md:contents">
                    <div className="min-w-0 flex-1 pt-0.5">
                      <span
                        className="inline-flex max-w-full items-center rounded-full bg-[color-mix(in_srgb,var(--course-bg)_62%,white)] px-2.5 py-1 text-xs font-bold leading-none text-[var(--course-text)] md:bg-white/45"
                      >
                        <span className="truncate">{course.code}</span>
                      </span>
                      <p className="mt-3 truncate text-base font-bold leading-snug text-[var(--secondary-accent)] sm:text-lg md:text-sm md:text-[var(--course-text)]" title={course.name}>
                        {course.name}
                      </p>
                    </div>
                  </div>

                  <div className="course-actions absolute right-4 top-4 flex items-center gap-1 opacity-100 transition-opacity md:static md:ml-auto md:gap-0.5">
                    <Button variant="ghost" size="icon" className="h-8 w-8 rounded-md text-[var(--secondary-accent)]" title="Edit" onClick={(e) => openEditDialog(course, e)}>
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 rounded-md text-[var(--main-accent)] hover:text-white"
                      title="Delete"
                      onClick={(e) => {
                        e.stopPropagation();
                        if (confirm('Deleting this course also removes its assignments and class sessions. Continue?')) {
                          handleDelete(course.id);
                        }
                      }}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>

                  <ChevronRight className="absolute right-5 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--secondary-accent)] opacity-75 md:bottom-4 md:right-4 md:top-auto md:translate-y-0 md:text-[var(--course-text)]" />

                  <div className="mt-5 grid grid-cols-[auto_minmax(4rem,1fr)_auto] items-center gap-3 pl-8 pr-12 text-[11px] font-bold text-[var(--course-text)] sm:pr-14 sm:text-xs md:hidden">
                    <span className="shrink-0 whitespace-nowrap">{progressLabel}</span>
                    <div className="h-2 min-w-0 overflow-hidden rounded-full bg-white/55">
                      <div className="h-full rounded-full" style={{ width: `${percent}%`, backgroundColor: colors.border }} />
                    </div>
                    {stats.total > 0 && (
                      <span className="shrink-0 whitespace-nowrap text-[var(--text-secondary)]">
                        {stats.completed}/{stats.total}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
      </section>

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
