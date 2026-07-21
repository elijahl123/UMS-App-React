import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { ChevronRight, MoreHorizontal, Plus, Search, SlidersHorizontal, Star, StickyNote, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { mapCourse, mapNote } from '@/app/data/mappers';
import { getCourseColor } from '@/app/data/courseColors';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { cn } from '@/lib/utils';
import type { Note } from '@/app/data/types';

type NoteTab = 'all' | 'recent' | 'favorites' | 'shared';
type SortMode = 'newest' | 'oldest' | 'title';

const tabLabels: Record<NoteTab, string> = {
  all: 'All Notes',
  recent: 'Recent',
  favorites: 'Favorites',
  shared: 'Shared',
};

const favoriteNotesStoragePrefix = 'ums.favoriteNoteIds';

function stripHtml(html: string): string {
  return html.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function getFavoriteNotesStorageKey(userId?: string) {
  return `${favoriteNotesStoragePrefix}:${userId ?? 'guest'}`;
}

function readFavoriteNoteIds(userId?: string): Set<string> {
  if (typeof window === 'undefined') return new Set();

  try {
    const raw = window.localStorage.getItem(getFavoriteNotesStorageKey(userId));
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return new Set();
    return new Set(parsed.filter((value): value is string => typeof value === 'string'));
  } catch {
    return new Set();
  }
}

function writeFavoriteNoteIds(userId: string | undefined, favoriteIds: Set<string>) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(getFavoriteNotesStorageKey(userId), JSON.stringify([...favoriteIds]));
  } catch {
    // Favorites are a convenience; storage failures should not block note browsing.
  }
}

function NotesPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { user } = useAuth();
  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const [noteRows, notesLoading, , refresh] = useLoadAction('loadNotes', [], { userId: user?.id });
  const [removeNote] = useMutateAction('deleteNote');

  const [courseFilter, setCourseFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [activeTab, setActiveTab] = useState<NoteTab>('all');
  const [sortMode, setSortMode] = useState<SortMode>('newest');
  const [favoriteNoteIds, setFavoriteNoteIds] = useState(() => readFavoriteNoteIds(user?.id));

  const courses = (courseRows ?? []).map(mapCourse);
  const notes = (noteRows ?? []).map(mapNote);

  const courseById = useMemo(() => new Map(courses.map((course) => [course.id, course])), [courses]);
  const getCourse = (courseId?: string) => (courseId ? courseById.get(courseId) : undefined);

  useEffect(() => {
    const courseId = searchParams.get('courseId');
    if (courseId) {
      setCourseFilter(courseId);
    }
  }, [searchParams]);

  useEffect(() => {
    setFavoriteNoteIds(readFavoriteNoteIds(user?.id));
  }, [user?.id]);

  useEffect(() => {
    const noteIds = new Set(notes.map((note) => note.id));
    setFavoriteNoteIds((current) => {
      const next = new Set([...current].filter((id) => noteIds.has(id)));
      if (next.size === current.size) return current;
      writeFavoriteNoteIds(user?.id, next);
      return next;
    });
  }, [notes, user?.id]);

  const isRecent = (note: Note) => {
    const updatedAt = new Date(note.updatedAt).getTime();
    if (Number.isNaN(updatedAt)) return false;
    const thirtyDays = 30 * 24 * 60 * 60 * 1000;
    return Date.now() - updatedAt <= thirtyDays;
  };

  const searched = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    return notes.filter((note) => {
      const course = note.courseId ? courseById.get(note.courseId) : undefined;
      const matchesCourse = courseFilter === 'all' || note.courseId === courseFilter;
      if (!matchesCourse) return false;

      if (!normalizedQuery) return true;

      const preview = stripHtml(note.content).toLowerCase();
      const courseText = [course?.code, course?.name].filter(Boolean).join(' ').toLowerCase();
      return `${note.title} ${preview} ${courseText}`.toLowerCase().includes(normalizedQuery);
    });
  }, [notes, courseFilter, searchQuery, courseById]);

  const tabCounts = useMemo<Record<NoteTab, number>>(
    () => ({
      all: searched.length,
      recent: searched.filter(isRecent).length,
      favorites: searched.filter((note) => favoriteNoteIds.has(note.id)).length,
      shared: 0,
    }),
    [searched, favoriteNoteIds]
  );

  const filtered = useMemo(() => {
    const byTab = searched.filter((note) => {
      if (activeTab === 'recent') return isRecent(note);
      if (activeTab === 'favorites') return favoriteNoteIds.has(note.id);
      if (activeTab === 'shared') return false;
      return true;
    });

    return [...byTab].sort((a, b) => {
      if (sortMode === 'oldest') return a.updatedAt.localeCompare(b.updatedAt);
      if (sortMode === 'title') return a.title.localeCompare(b.title);
      return b.updatedAt.localeCompare(a.updatedAt);
    });
  }, [searched, activeTab, sortMode, favoriteNoteIds]);

  const toggleFavorite = (id: string) => {
    setFavoriteNoteIds((current) => {
      const next = new Set(current);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      writeFavoriteNoteIds(user?.id, next);
      return next;
    });
  };

  const handleDelete = async (id: string) => {
    if (confirm('Are you sure you want to delete this note?')) {
      await removeNote({ id, userId: user?.id });
      refresh();
    }
  };

  if (notesLoading && notes.length === 0) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-center text-sm font-medium text-[var(--text-secondary)]">
        Loading notes...
      </div>
    );
  }

  return (
    <div className="mx-auto flex h-full w-full max-w-5xl flex-col overflow-hidden text-[var(--secondary-accent)]">
      <div className="min-h-0 flex-1 overflow-y-auto pb-3">
        <div className="mobile-page-stack px-1 pb-1 md:gap-5 md:px-0">
          <header className="mobile-page-header md:pr-0 md:pt-2">
            <div>
              <h1 className="mobile-page-title sm:text-[2.25rem]">Notes</h1>
              <p className="mobile-page-kicker">Organize your notes by course.</p>
            </div>
          </header>

          <section className="grid grid-cols-[minmax(0,1fr)_7.75rem] gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
            <label className="relative block">
              <span className="sr-only">Search notes</span>
              <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-secondary)] sm:left-4 sm:h-5 sm:w-5" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search notes..."
                className="mobile-control pl-10 pr-3 placeholder:text-[var(--text-secondary)] sm:pl-12 sm:pr-4"
              />
            </label>
            <Button
              type="button"
              onClick={() => navigate('/notes/new')}
              className="mobile-primary-action px-3 sm:min-w-40 sm:px-6"
            >
              <Plus className="h-4 w-4 sm:h-5 sm:w-5" />
              Add Note
            </Button>
          </section>

          <section className="grid grid-cols-[minmax(0,1fr)_auto] gap-3">
            <Select value={courseFilter} onValueChange={setCourseFilter}>
              <SelectTrigger className="mobile-control px-3 font-bold sm:px-4">
                <SelectValue placeholder="All Courses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Courses</SelectItem>
                {courses.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.code}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button
                  type="button"
                  variant="outline"
                  className="mobile-control px-3 hover:bg-[var(--secondary-accent-soft)] hover:text-[var(--secondary-accent)] sm:min-w-32 sm:px-4"
                >
                  <SlidersHorizontal className="h-4 w-4 sm:h-5 sm:w-5" />
                  <span className="hidden sm:inline">Filter</span>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuRadioGroup value={sortMode} onValueChange={(value) => setSortMode(value as SortMode)}>
                  <DropdownMenuRadioItem value="newest">Newest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="oldest">Oldest first</DropdownMenuRadioItem>
                  <DropdownMenuRadioItem value="title">Title A-Z</DropdownMenuRadioItem>
                </DropdownMenuRadioGroup>
              </DropdownMenuContent>
            </DropdownMenu>
          </section>

          <div className="flex gap-3 overflow-x-auto pb-1">
            {(Object.keys(tabLabels) as NoteTab[]).map((tab) => (
              <button
                key={tab}
                type="button"
                className={cn(
                  'flex h-10 shrink-0 items-center gap-2 rounded-lg px-3 text-xs font-bold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color-shade)] sm:h-11 sm:gap-3 sm:px-4 sm:text-sm',
                  activeTab === tab
                    ? 'bg-[color-mix(in_srgb,var(--main-color)_16%,white)] text-[var(--main-color-shade)]'
                    : 'bg-transparent text-[var(--secondary-accent)] hover:bg-[var(--secondary-accent-soft)]'
                )}
                onClick={() => setActiveTab(tab)}
              >
                <span>{tabLabels[tab]}</span>
                <span
                  className={cn(
                    'min-w-6 rounded-full px-2 py-0.5 text-center text-[11px] sm:min-w-7 sm:py-1 sm:text-xs',
                    activeTab === tab
                      ? 'bg-white/70 text-[var(--secondary-accent)]'
                      : 'bg-[var(--secondary-accent-soft)] text-[var(--secondary-accent)]'
                  )}
                >
                  {tabCounts[tab]}
                </span>
              </button>
            ))}
          </div>

          <section className="flex items-center justify-between gap-4">
            <p className="text-base font-bold text-[var(--secondary-accent)] sm:text-lg">
              {activeTab === 'all' ? 'Recent Notes' : tabLabels[activeTab]}
            </p>
            {(searchQuery || courseFilter !== 'all' || activeTab !== 'all') && (
              <Button
                type="button"
                variant="ghost"
                className="h-8 gap-1 px-1 text-xs font-bold text-[var(--main-color-shade)] hover:bg-[color-mix(in_srgb,var(--main-color)_14%,white)] hover:text-[var(--main-color-shade)] sm:h-9 sm:text-sm"
                onClick={() => {
                  setSearchQuery('');
                  setCourseFilter('all');
                  setActiveTab('all');
                }}
              >
                View all
                <ChevronRight className="h-4 w-4" />
              </Button>
            )}
          </section>

          {filtered.length === 0 ? (
            <div className="mobile-surface flex flex-col items-center justify-center gap-2 px-4 py-12 text-center sm:py-16">
              <StickyNote className="h-8 w-8 text-[var(--main-color-shade)] sm:h-9 sm:w-9" />
              <p className="text-sm font-bold text-[var(--secondary-accent)]">No notes found</p>
              <p className="max-w-xs text-xs font-medium text-[var(--text-secondary)]">
                {activeTab === 'favorites' || activeTab === 'shared'
                  ? `${tabLabels[activeTab]} notes will appear here when that detail is available.`
                  : 'Try a different search or course filter.'}
              </p>
            </div>
          ) : (
            <div className="grid gap-2 lg:grid-cols-2">
              {filtered.map((note, index) => {
                const course = getCourse(note.courseId);
                const colors = course ? getCourseColor(course.color) : getCourseColor('course-pink');
                const preview = stripHtml(note.content);
                const isFavorite = favoriteNoteIds.has(note.id);
                const railColor = isFavorite ? 'var(--main-color)' : index % 4 === 3 ? 'var(--course-yellow)' : colors.border;
                const itemStyle = {
                  '--mobile-item-bg': colors.bg,
                  '--mobile-item-border': isFavorite ? 'var(--main-color)' : colors.border,
                  '--mobile-item-text': colors.text,
                  '--mobile-rail-color': railColor,
                } as React.CSSProperties;
                return (
                  <article
                    key={note.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => navigate(`/notes/${note.id}`)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        navigate(`/notes/${note.id}`);
                      }
                    }}
                    className="mobile-list-item group grid cursor-pointer grid-cols-[0.25rem_minmax(0,1fr)_auto] items-center gap-3 outline-none focus-visible:ring-2 focus-visible:ring-ring sm:grid-cols-[0.3rem_minmax(0,1fr)_auto]"
                    style={itemStyle}
                  >
                    <div className="mobile-list-rail h-14 bg-[var(--mobile-rail-color)]" />
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold sm:text-sm">
                        {course ? `${course.code}: ` : ''}
                        {note.title}
                      </p>
                      <p className="mt-1 line-clamp-1 text-[11px] font-medium opacity-80 sm:text-xs">{preview || 'No content yet.'}</p>
                      <p className="mt-1 text-[10px] font-semibold opacity-70 sm:text-[11px]">{formatDate(note.updatedAt)}</p>
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        title={isFavorite ? 'Remove favorite' : 'Favorite note'}
                        aria-label={isFavorite ? 'Remove favorite' : 'Favorite note'}
                        aria-pressed={isFavorite}
                        className={cn(
                          'h-8 w-8 shrink-0 hover:bg-white/45',
                          isFavorite ? 'text-[var(--main-color-shade)]' : 'opacity-80 hover:text-[var(--main-color-shade)]'
                        )}
                        onClick={(event) => {
                          event.stopPropagation();
                          toggleFavorite(note.id);
                        }}
                      >
                        <Star className={cn('h-4 w-4', isFavorite && 'fill-current')} />
                      </Button>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            title="Note actions"
                            className="h-8 w-8 opacity-80 hover:bg-white/45"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" onClick={(event) => event.stopPropagation()} className="text-[var(--secondary-accent)]">
                          <DropdownMenuItem onClick={() => navigate(`/notes/${note.id}`)}>Open note</DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            className="text-[var(--main-accent)] focus:bg-[color-mix(in_srgb,var(--main-color)_16%,white)] focus:text-[var(--main-accent)]"
                            onClick={() => handleDelete(note.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      <ChevronRight className="hidden h-5 w-5 shrink-0 opacity-70 sm:block" />
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default NotesPage;
