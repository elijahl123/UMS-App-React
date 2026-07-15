import { describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import AddEventDialog from '@/app/components/widgets/AddEventDialog';
import AssignmentFormDialog from '@/app/components/widgets/AssignmentFormDialog';
import ClassSessionFormDialog from '@/app/components/widgets/ClassSessionFormDialog';
import CourseFormDialog from '@/app/components/widgets/CourseFormDialog';
import CourseLinkFormDialog from '@/app/components/widgets/CourseLinkFormDialog';
import ClassesTodayWidget from '@/app/components/widgets/ClassesTodayWidget';
import LateAssignmentsWidget from '@/app/components/widgets/LateAssignmentsWidget';
import Sidebar from '@/app/components/Sidebar';
import UpcomingAssignmentsWidget from '@/app/components/widgets/UpcomingAssignmentsWidget';
import UpcomingEventsWidget from '@/app/components/widgets/UpcomingEventsWidget';
import CalendarMonthGrid from '@/app/components/calendar/CalendarMonthGrid';
import DayDetailsDialog from '@/app/components/calendar/DayDetailsDialog';
import GoogleSignInButton from '@/app/components/auth/GoogleSignInButton';
import MobileBottomNavigation from '@/app/components/MobileBottomNavigation';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Textarea } from '@/components/ui/textarea';
import { assignments, courses, events, sessions } from '@/app/test/fixtures';
import { apiState, authActions } from '@/app/test/mocks';
import { renderWithRouter } from '@/app/test/render';
import type { CalendarItem } from '@/app/data/calendarUtils';
import { Route, Routes } from 'react-router-dom';

describe('widgets and calendar components', () => {
  it('renders assignment, event, class, and late-assignment widgets', () => {
    renderWithRouter(
      <>
        <UpcomingAssignmentsWidget assignments={[assignments[0]]} courses={courses} onAdd={vi.fn()} />
        <LateAssignmentsWidget assignments={[assignments[1]]} courses={courses} />
        <ClassesTodayWidget sessions={[sessions[0]]} courses={courses} />
        <UpcomingEventsWidget events={events} onAdd={vi.fn()} />
      </>
    );

    expect(screen.getByText(/limits worksheet/i)).toBeInTheDocument();
    expect(screen.getByText(/derivative quiz/i)).toBeInTheDocument();
    expect(screen.getByText(/open notes/i)).toBeInTheDocument();
    expect(screen.getByText(/study group/i)).toBeInTheDocument();
  });

  it('renders empty widget states', () => {
    renderWithRouter(
      <>
        <UpcomingAssignmentsWidget assignments={[]} courses={courses} onAdd={vi.fn()} />
        <LateAssignmentsWidget assignments={[]} courses={courses} />
        <ClassesTodayWidget sessions={[]} courses={courses} />
        <UpcomingEventsWidget events={[]} onAdd={vi.fn()} />
      </>
    );

    expect(screen.getByText(/no upcoming assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/no late assignments/i)).toBeInTheDocument();
    expect(screen.getByText(/no classes today/i)).toBeInTheDocument();
    expect(screen.getByText(/no upcoming events/i)).toBeInTheDocument();
  });

  it('creates a dated course note from class Open Notes buttons', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 9, 30));

    try {
      renderWithRouter(<ClassesTodayWidget sessions={[sessions[0]]} courses={courses} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /open notes/i }));
        await Promise.resolve();
      });

      expect(apiState.mutations).toContainEqual({
        name: 'createNote',
        params: expect.objectContaining({
          courseId: '1',
          title: 'Calculus I Notes for 2026-07-10',
          content: '',
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('opens an existing dated class note without creating a duplicate', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 9, 30));
    apiState.loads.loadNotes = [
      {
        id: 42,
        course_id: 1,
        title: 'Calculus I Notes for 2026-07-10',
        content: '<p>Already started.</p>',
        created_at: '2026-07-10T16:00:00.000Z',
        updated_at: '2026-07-10T16:00:00.000Z',
      },
    ];

    try {
      renderWithRouter(<ClassesTodayWidget sessions={[sessions[0]]} courses={courses} />);

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /open notes/i }));
        await Promise.resolve();
      });

      expect(apiState.mutations).not.toContainEqual(expect.objectContaining({ name: 'createNote' }));
    } finally {
      vi.useRealTimers();
    }
  });

  it('shows the current class card in the sidebar and opens notes for it', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 9, 30));

    try {
      renderWithRouter(<Sidebar />);

      expect(screen.getByText(/current class/i)).toBeInTheDocument();
      expect(screen.getByText(/math 101/i)).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(screen.getByRole('button', { name: /open notes/i }));
        await Promise.resolve();
      });

      expect(apiState.mutations).toContainEqual({
        name: 'createNote',
        params: expect.objectContaining({
          courseId: '1',
          title: 'Calculus I Notes for 2026-07-10',
          content: '',
        }),
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('updates the sidebar class card at the class boundary', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 6, 10, 10, 14, 59));

    try {
      renderWithRouter(<Sidebar />);

      expect(screen.getByText(/current class/i)).toBeInTheDocument();
      expect(screen.getByText(/math 101/i)).toBeInTheDocument();

      await act(async () => {
        vi.advanceTimersByTime(1000);
      });

      expect(screen.getByText(/no more classes today/i)).toBeInTheDocument();
      expect(screen.getByText(/your schedule is clear for the rest of the day/i)).toBeInTheDocument();
      expect(screen.getByText(/no more classes today/i).closest('[style]')).toHaveStyle({
        backgroundColor: 'var(--course-gray)',
      });
    } finally {
      vi.useRealTimers();
    }
  });

  it('renders calendar grid items and day details', async () => {
    const onDayClick = vi.fn();
    const onEventClick = vi.fn();
    const item: CalendarItem = {
      id: 'event-1',
      type: 'event',
      title: 'Study Group',
      date: '2026-07-10',
      time: '16:00',
      color: '#fff',
      textColor: '#1F3A66',
      borderColor: '#9fb6e6',
      raw: events[0],
    };

    const { rerender } = render(
      <CalendarMonthGrid year={2026} month={6} itemsByDate={new Map([['2026-07-10', [item]]])} onDayClick={onDayClick} />
    );

    fireEvent.click(screen.getAllByRole('button', { name: /10/i })[0]);
    expect(onDayClick).toHaveBeenCalledWith('2026-07-10');

    rerender(<DayDetailsDialog open onOpenChange={vi.fn()} date="2026-07-10" items={[item]} onEventClick={onEventClick} />);
    fireEvent.click(screen.getByText(/study group/i));
    expect(onEventClick).toHaveBeenCalledWith(item);
  });

  it('renders mobile bottom navigation and opens the global add sheet', async () => {
    const user = userEvent.setup();
    renderWithRouter(<MobileBottomNavigation />);

    expect(screen.getByRole('navigation', { name: /mobile primary navigation/i })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /toggle menu/i })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /add anything/i }));

    expect(screen.getByRole('heading', { name: /^add$/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /add assignment/i }));
    expect(screen.getByRole('heading', { name: /add assignment/i })).toBeInTheDocument();
  });

  it('navigates from the mobile more sheet and logs out', async () => {
    const user = userEvent.setup();
    renderWithRouter(
      <>
        <MobileBottomNavigation />
        <Routes>
          <Route path="/notes" element={<div>Notes destination</div>} />
          <Route path="/login" element={<div>Login destination</div>} />
        </Routes>
      </>
    );

    await user.click(screen.getByRole('button', { name: /^more$/i }));
    await user.click(screen.getByRole('button', { name: /^notes$/i }));
    expect(screen.getByText(/notes destination/i)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /^more$/i }));
    await user.click(screen.getByRole('button', { name: /log out/i }));

    expect(authActions.logout).toHaveBeenCalled();
    expect(screen.getByText(/login destination/i)).toBeInTheDocument();
  });
});

describe('form dialogs', () => {
  it('submits an edited assignment', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AssignmentFormDialog
        open
        onOpenChange={vi.fn()}
        courses={courses}
        assignment={assignments[0]}
        onSubmit={onSubmit}
      />
    );

    const nameInput = screen.getByLabelText(/assignment name/i);
    await user.clear(nameInput);
    await user.type(nameInput, 'Updated worksheet');
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Updated worksheet' }));
  });

  it('lets a completed assignment be marked incomplete from the edit dialog', async () => {
    const onSubmit = vi.fn();
    const user = userEvent.setup();
    render(
      <AssignmentFormDialog
        open
        onOpenChange={vi.fn()}
        courses={courses}
        assignment={assignments[2]}
        onSubmit={onSubmit}
      />
    );

    await user.click(screen.getByLabelText(/completed/i));
    await user.click(screen.getByRole('button', { name: /save changes/i }));

    expect(onSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: '3', status: 'upcoming' }));
  });

  it('submits course, class session, event, and link forms', async () => {
    const user = userEvent.setup();
    const onCourseSubmit = vi.fn();
    const onSessionSubmit = vi.fn();
    const onEventSubmit = vi.fn();
    const onLinkSubmit = vi.fn();

    const { rerender } = render(
      <CourseFormDialog open onOpenChange={vi.fn()} course={courses[0]} onSubmit={onCourseSubmit} />
    );
    await user.clear(screen.getByLabelText(/course name/i));
    await user.type(screen.getByLabelText(/course name/i), 'Advanced Calculus');
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onCourseSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: '1', name: 'Advanced Calculus' }));

    rerender(<ClassSessionFormDialog open onOpenChange={vi.fn()} courses={courses} session={sessions[0]} onSubmit={onSessionSubmit} />);
    fireEvent.change(screen.getByLabelText(/start time/i), { target: { value: '10:00' } });
    await user.click(screen.getByRole('button', { name: /save changes/i }));
    expect(onSessionSubmit).toHaveBeenCalledWith(expect.objectContaining({ id: '1', startTime: '10:00' }));

    rerender(<AddEventDialog open onOpenChange={vi.fn()} onSubmit={onEventSubmit} />);
    await user.type(screen.getByLabelText(/event title/i), 'Office Hours');
    fireEvent.change(screen.getByLabelText(/^date$/i), { target: { value: '2026-07-11' } });
    await user.click(screen.getByRole('button', { name: /add event/i }));
    expect(onEventSubmit).toHaveBeenCalledWith(expect.objectContaining({ title: 'Office Hours', date: '2026-07-11' }));

    rerender(<CourseLinkFormDialog open onOpenChange={vi.fn()} onSubmit={onLinkSubmit} />);
    await user.type(screen.getByLabelText(/label/i), 'Portal');
    await user.type(screen.getByLabelText(/url/i), 'https://example.com/portal');
    await user.click(screen.getByRole('button', { name: /add link/i }));
    expect(onLinkSubmit).toHaveBeenCalledWith(expect.objectContaining({ label: 'Portal', url: 'https://example.com/portal' }));
  });

  it('shows validation for invalid course links', async () => {
    const user = userEvent.setup();
    render(<CourseLinkFormDialog open onOpenChange={vi.fn()} onSubmit={vi.fn()} />);

    await user.type(screen.getByLabelText(/label/i), 'Portal');
    await user.type(screen.getByLabelText(/url/i), 'example.com');
    await user.click(screen.getByRole('button', { name: /add link/i }));

    expect(await screen.findByText(/must be a valid url/i)).toBeInTheDocument();
  });
});

describe('shared UI and auth button components', () => {
  it('renders shared UI primitives with accessible roles', () => {
    render(
      <Card>
        <CardHeader>
          <CardTitle>Primitive card</CardTitle>
        </CardHeader>
        <CardContent>
          <Label htmlFor="name">Name</Label>
          <Input id="name" defaultValue="Jane" />
          <Textarea aria-label="Notes" defaultValue="Hello" />
          <Badge>Active</Badge>
          <Separator />
          <Button>Save</Button>
        </CardContent>
      </Card>
    );

    expect(screen.getByRole('heading', { name: /primitive card/i })).toBeInTheDocument();
    expect(screen.getByLabelText(/name/i)).toHaveValue('Jane');
    expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
  });

  it('calls Google sign-in when enabled', async () => {
    const user = userEvent.setup();
    render(<GoogleSignInButton />);

    await user.click(screen.getByRole('button', { name: /continue with google/i }));

    await waitFor(() => expect(authActions.signInWithGoogle).toHaveBeenCalled());
  });
});
