import { Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import CalendarPage from '@/app/pages/CalendarPage';
import CoursePage from '@/app/pages/CoursePage';
import DashboardPage from '@/app/pages/DashboardPage';
import StudyPlanPage from '@/app/pages/StudyPlanPage';
import StudyPlanSetupPage from '@/app/pages/StudyPlanSetupPage';
import type { StudyPlan, StudyRecoveryPreview } from '@/app/data/types';
import { studyPlanActions, studyPlanState } from '@/app/test/mocks';
import { mockUser } from '@/app/test/fixtures';
import { renderWithRouter } from '@/app/test/render';

const plan: StudyPlan = {
  id: 'plan-1',
  courseId: '1',
  courseCode: 'MATH 101',
  courseName: 'Calculus I',
  courseColor: 'course-blue',
  courseHomepageUrl: 'https://courses.example.edu/math-101',
  examType: 'final',
  examDate: '2026-07-31',
  targetType: 'exam',
  targetTitle: 'Final exam',
  targetDate: '2026-07-31',
  targetTime: null,
  targetAssignmentId: null,
  estimatedMinutes: null,
  dailyCapMinutes: null,
  schedulerVersion: 1,
  schedulerExplanation: null,
  unscheduledMinutes: 0,
  partialPlanAcknowledged: false,
  startDate: '2026-07-01',
  timeZone: 'America/Los_Angeles',
  archived: false,
  createdAt: '2026-07-01T00:00:00.000Z',
  updatedAt: '2026-07-01T00:00:00.000Z',
  totalTasks: 1,
  completedTasks: 0,
  overdueTasks: 1,
  overCapacityMinutes: 0,
  overCapacityDays: 0,
  recoveryNeeded: true,
  studyDaysLeft: 1,
  activeTopics: 1,
  nextStudyDate: '2026-07-22',
  nextTaskTitle: 'Learn & review: Graph algorithms',
  availability: [{ weekday: 3, minutes: 60 }],
  topics: [
    {
      id: 'topic-1',
      planId: 'plan-1',
      title: 'Graph algorithms',
      difficulty: 'medium',
      position: 0,
      active: true,
      totalTasks: 1,
      completedTasks: 0,
    },
  ],
  tasks: [
    {
      id: 'task-1',
      planId: 'plan-1',
      topicId: 'topic-1',
      phase: 'learn',
      title: 'Learn & review: Graph algorithms',
      scheduledDate: '2026-07-22',
      estimatedMinutes: 60,
      completedAt: null,
      sequence: 0,
    },
  ],
};

function renderRoute(path: string, element: React.ReactElement, route: string) {
  return renderWithRouter(
    <Routes>
      <Route path={path} element={element} />
    </Routes>,
    { route }
  );
}

describe('study plans', () => {
  it('adds a study plan section to the course page', () => {
    studyPlanState.plans = [plan];
    renderRoute('/courses/:courseId', <CoursePage />, '/courses/1');

    expect(screen.getByRole('heading', { name: /study plans/i })).toBeInTheDocument();
    expect(screen.getByText(/^final exam$/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create plan/i })).toBeInTheDocument();
  });

  it('turns pasted topics into an available plan definition', async () => {
    const user = userEvent.setup();
    renderRoute('/courses/:courseId/study-plans/new', <StudyPlanSetupPage />, '/courses/1/study-plans/new');

    await user.type(screen.getByLabelText(/paste modules or topics/i), '1. Limits\nWeek 2: Derivatives');
    await user.click(screen.getByRole('button', { name: /add topics/i }));
    expect(screen.getByDisplayValue('Limits')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Derivatives')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /create study plan/i }));
    await waitFor(() =>
      expect(studyPlanActions.saveStudyPlan).toHaveBeenCalledWith(
        expect.objectContaining({
          courseId: '1',
          examType: 'final',
          topics: expect.arrayContaining([
            expect.objectContaining({ title: 'Limits', difficulty: 'light' }),
            expect.objectContaining({ title: 'Derivatives', difficulty: 'light' }),
          ]),
        }),
        undefined,
        mockUser.id
      )
    );
  });

  it('previews and confirms Recovery Mode for overdue incomplete work', async () => {
    const user = userEvent.setup();
    studyPlanState.plans = [{ ...plan, examDate: '2099-07-31', targetDate: '2099-07-31' }];
    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );

    expect(screen.getByText(/plan needs replanning/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /start recovery mode/i }));
    expect(await screen.findByRole('heading', { name: /recovery mode/i })).toBeInTheDocument();
    await waitFor(() => expect(studyPlanActions.previewStudyPlanRecovery).toHaveBeenCalledWith('plan-1', [], 0, mockUser.id));
    await user.click(screen.getByRole('button', { name: /confirm recovery/i }));
    await waitFor(() => expect(studyPlanActions.confirmStudyPlanRecovery).toHaveBeenCalledWith(
      'plan-1', 'a'.repeat(64), [], 0, mockUser.id
    ));
  });

  it('requires an explicit dependency-safe omission when recovery is short on capacity', async () => {
    const user = userEvent.setup();
    studyPlanState.plans = [{ ...plan, examDate: '2099-07-31', targetDate: '2099-07-31' }];
    const shortfallPreview: StudyRecoveryPreview = {
      planId: 'plan-1', stateToken: 'b'.repeat(64), needsRecovery: true, canConfirm: false,
      reasons: ['overdue'], requiredOmissionMinutes: 45, shortfallMinutes: 45,
      selectedOmissionMinutes: 0, additionalMinutesPerDay: 0,
      effectiveOmittedGroupIds: [], recommendedOmittedGroupIds: ['topic-1:practice'],
      unresolvedTasks: [], dayChanges: [], capacityChanges: [],
      omissionGroups: [{
        id: 'topic-1:practice', topicId: 'topic-1', phase: 'practice',
        title: 'Practice: Graph algorithms', minutes: 45, cascadesTo: ['topic-1:recall'],
      }],
      taskChanges: [],
      totals: {
        before: { scheduledMinutes: 105, overdueMinutes: 105, overCapacityMinutes: 0, unscheduledMinutes: 0 },
        after: { scheduledMinutes: 60, overdueMinutes: 0, overCapacityMinutes: 0, unscheduledMinutes: 45 },
        movedMinutes: 60,
      },
    };
    studyPlanActions.previewStudyPlanRecovery
      .mockResolvedValueOnce(shortfallPreview)
      .mockResolvedValueOnce({
        ...shortfallPreview,
        canConfirm: true,
        shortfallMinutes: 0,
        selectedOmissionMinutes: 45,
        effectiveOmittedGroupIds: ['topic-1:practice', 'topic-1:recall'],
      });

    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );
    await user.click(screen.getByRole('button', { name: /start recovery mode/i }));
    const confirmButton = await screen.findByRole('button', { name: /confirm recovery/i });
    expect(confirmButton).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /practice: graph algorithms/i })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /leave the remaining work unscheduled/i }));
    await waitFor(() => expect(studyPlanActions.previewStudyPlanRecovery).toHaveBeenLastCalledWith(
      'plan-1', ['topic-1:practice'], 0, mockUser.id
    ));
    await waitFor(() => expect(confirmButton).toBeEnabled());
    await user.click(confirmButton);
    await waitFor(() => expect(studyPlanActions.confirmStudyPlanRecovery).toHaveBeenCalledWith(
      'plan-1', 'b'.repeat(64), ['topic-1:practice'], 0, mockUser.id
    ));
  });

  it('can add only the daily capacity needed to schedule all remaining work', async () => {
    const user = userEvent.setup();
    studyPlanState.plans = [{ ...plan, examDate: '2099-07-31', targetDate: '2099-07-31' }];
    const shortfallPreview = await studyPlanActions.previewStudyPlanRecovery('plan-1');
    const shortfall = {
      ...shortfallPreview,
      stateToken: 'c'.repeat(64),
      canConfirm: false,
      requiredOmissionMinutes: 45,
      shortfallMinutes: 45,
      recommendedOmittedGroupIds: ['topic-1:practice'],
      omissionGroups: [{
        id: 'topic-1:practice', topicId: 'topic-1', phase: 'practice' as const,
        title: 'Practice: Graph algorithms', minutes: 45, cascadesTo: [],
      }],
    };
    studyPlanActions.previewStudyPlanRecovery
      .mockResolvedValueOnce(shortfall)
      .mockResolvedValueOnce({
        ...shortfall,
        canConfirm: true,
        requiredOmissionMinutes: 0,
        shortfallMinutes: 0,
        additionalMinutesPerDay: 720,
        capacityChanges: [
          { date: '2099-07-27', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
          { date: '2099-07-28', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
          { date: '2099-07-29', beforeMinutes: 60, afterMinutes: 75, addedMinutes: 15 },
        ],
        totals: {
          ...shortfall.totals,
          after: { ...shortfall.totals.after, unscheduledMinutes: 0 },
        },
      });

    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );
    await user.click(screen.getByRole('button', { name: /start recovery mode/i }));
    await screen.findByRole('button', { name: /add time needed/i });
    await user.click(screen.getByRole('button', { name: /add time needed/i }));
    await waitFor(() => expect(studyPlanActions.previewStudyPlanRecovery).toHaveBeenLastCalledWith(
      'plan-1', [], 720, mockUser.id
    ));
    expect(await screen.findByText(/45 min added across 3 study days/i)).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /confirm recovery/i }));
    await waitFor(() => expect(studyPlanActions.confirmStudyPlanRecovery).toHaveBeenCalledWith(
      'plan-1', 'c'.repeat(64), [], 720, mockUser.id
    ));
  });

  it('links the plan summary to the full editor', () => {
    studyPlanState.plans = [plan];
    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );

    expect(screen.getByRole('link', { name: /edit plan/i })).toHaveAttribute(
      'href',
      '/courses/1/study-plans/plan-1/edit'
    );
  });

  it('opens a task note without toggling completion and exposes the course homepage', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    studyPlanState.plans = [{
      ...plan,
      examDate: '2099-07-31',
      overdueTasks: 0,
      tasks: [{ ...plan.tasks[0], scheduledDate: '2026-07-29' }],
    }];
    const view = renderWithRouter(
      <Routes>
        <Route path="/courses/:courseId/study-plans/:planId" element={<StudyPlanPage />} />
        <Route path="/notes/:noteId" element={<div>Task note destination</div>} />
      </Routes>,
      { route: '/courses/1/study-plans/plan-1' }
    );

    await user.click(screen.getByRole('button', { name: /open notes for learn & review: graph algorithms/i }));
    await waitFor(() =>
      expect(studyPlanActions.openStudyTaskNote).toHaveBeenCalledWith('plan-1', 'task-1', mockUser.id)
    );
    expect(await screen.findByText(/task note destination/i)).toBeInTheDocument();
    expect(studyPlanActions.setStudyTaskCompleted).not.toHaveBeenCalled();

    view.unmount();
    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );
    await user.click(screen.getByRole('button', { name: /open math 101 homepage/i }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://courses.example.edu/math-101',
      '_blank',
      'noopener,noreferrer'
    );
  });

  it('shows study sessions and the linked exam marker in UMS Calendar', async () => {
    const user = userEvent.setup();
    studyPlanState.plans = [plan];
    renderWithRouter(<CalendarPage />, { route: '/calendar?date=2026-07-22' });

    await user.click(screen.getAllByRole('button', { name: /july 22/i })[0]);
    expect(await screen.findByText(/math 101: study plan/i)).toBeInTheDocument();
    await user.click(screen.getAllByRole('button', { name: /july 31/i })[0]);
    expect(await screen.findByText(/math 101: final exam/i)).toBeInTheDocument();
  });

  it('replaces the visible plan tasks when navigating four-week windows', async () => {
    const user = userEvent.setup();
    studyPlanState.plans = [{
      ...plan,
      examDate: '2026-10-01',
      targetDate: '2026-10-01',
      overdueTasks: 0,
      totalTasks: 2,
      studyDaysLeft: 2,
      tasks: [
        {
          ...plan.tasks[0],
          id: 'task-today',
          title: 'Current window topic',
          scheduledDate: '2026-07-29',
        },
        {
          ...plan.tasks[0],
          id: 'task-later',
          title: 'Next window topic',
          scheduledDate: '2026-08-27',
          sequence: 1,
        },
      ],
    }];
    renderRoute(
      '/courses/:courseId/study-plans/:planId',
      <StudyPlanPage />,
      '/courses/1/study-plans/plan-1'
    );

    expect(await screen.findByText('Current window topic')).toBeInTheDocument();
    expect(screen.queryByText('Next window topic')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /next 4 weeks/i }));
    expect(await screen.findByText('Next window topic')).toBeInTheDocument();
    expect(screen.queryByText('Current window topic')).not.toBeInTheDocument();
  });

  it('renders a themed study focus and completes a Dashboard task inline', async () => {
    const user = userEvent.setup();
    const today = new Date().toISOString().slice(0, 10);
    studyPlanState.plans = [{
      ...plan,
      examDate: '2099-07-31',
      overdueTasks: 0,
      tasks: [{
        ...plan.tasks[0],
        title: 'Review graph algorithms',
        scheduledDate: today,
      }],
    }];
    renderWithRouter(<DashboardPage />);

    expect(screen.getByRole('heading', { name: /study focus/i })).toBeInTheDocument();
    expect(screen.getByText(/math 101 final/i)).toBeInTheDocument();
    const taskButton = screen.getByRole('button', { name: /complete review graph algorithms for math 101/i });
    await user.click(taskButton);
    await waitFor(() =>
      expect(studyPlanActions.setStudyTaskCompleted).toHaveBeenCalledWith('plan-1', 'task-1', true, mockUser.id)
    );
  });

  it('opens a shared topic note and course homepage from the Dashboard without completing the task', async () => {
    const user = userEvent.setup();
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const today = new Date().toISOString().slice(0, 10);
    studyPlanState.plans = [{
      ...plan,
      examDate: '2099-07-31',
      overdueTasks: 0,
      tasks: [{
        ...plan.tasks[0],
        title: 'Review graph algorithms',
        scheduledDate: today,
      }],
    }];
    const view = renderWithRouter(
      <Routes>
        <Route path="/" element={<DashboardPage />} />
        <Route path="/notes/:noteId" element={<div>Topic note destination</div>} />
      </Routes>
    );

    await user.click(screen.getByRole('button', { name: /open notes for review graph algorithms/i }));
    await waitFor(() =>
      expect(studyPlanActions.openStudyTaskNote).toHaveBeenCalledWith('plan-1', 'task-1', mockUser.id)
    );
    expect(await screen.findByText(/topic note destination/i)).toBeInTheDocument();
    expect(studyPlanActions.setStudyTaskCompleted).not.toHaveBeenCalled();

    view.unmount();
    renderWithRouter(<DashboardPage />);
    await user.click(screen.getByRole('button', { name: /open math 101 homepage/i }));
    expect(openSpy).toHaveBeenCalledWith(
      'https://courses.example.edu/math-101',
      '_blank',
      'noopener,noreferrer'
    );
    expect(studyPlanActions.setStudyTaskCompleted).not.toHaveBeenCalled();
  });
});
