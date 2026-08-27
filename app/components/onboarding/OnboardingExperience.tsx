import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import * as DialogPrimitive from '@radix-ui/react-dialog';
import {
  BellRing,
  BookOpen,
  BookOpenCheck,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronRight,
  Clock,
  FileText,
  Gauge,
  GraduationCap,
  ListChecks,
  Loader2,
  Map,
  Settings,
  Sparkles,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { useLoadAction, useMutateAction } from '@/app/lib/api/hooks';
import { mapCourse } from '@/app/data/mappers';
import { getBrowserTimeZone } from '@/app/data/assignmentDates';
import { getNotificationPreferences, updateNotificationPreferences } from '@/app/lib/notifications/client';
import {
  getNotificationPermissionStatus,
  requestNotificationPermission,
  syncAndScheduleNotifications,
  type NotificationPermissionStatus,
} from '@/app/lib/notifications/scheduler';
import { connectGoogleCalendar, getGoogleCalendarStatus } from '@/app/lib/googleCalendar/client';
import { trackProductEvent } from '@/app/lib/launch/client';
import {
  getOnboarding,
  initializeOnboarding,
  ONBOARDING_INITIALIZE_PENDING_KEY,
  ONBOARDING_STEPS,
  restartOnboarding,
  updateOnboarding,
  type OnboardingState,
  type OnboardingStep,
} from '@/app/lib/onboarding/client';

const tourSteps: Partial<Record<OnboardingStep, {
  title: string;
  body: string;
  path: string;
  selector: string;
  icon: typeof Gauge;
}>> = {
  dashboard: {
    title: 'Your day at a glance',
    body: 'Dashboard brings together deadlines, classes, upcoming events, and today\'s plan tasks so you know what needs attention first.',
    path: '/',
    selector: '[data-tour="dashboard"]',
    icon: Gauge,
  },
  calendar: {
    title: 'Plan everything in Calendar',
    body: 'See academic and personal events together, add one-off events, and sync connected Google calendars.',
    path: '/calendar',
    selector: '[data-tour="calendar"]',
    icon: CalendarDays,
  },
  homework: {
    title: 'Keep deadlines under control',
    body: 'Homework separates late, due-today, and upcoming work. Add assignments manually or import a Brightspace PDF or Canvas calendar.',
    path: '/homework',
    selector: '[data-tour="homework"]',
    icon: BookOpen,
  },
  class_schedule: {
    title: 'Build your weekly rhythm',
    body: 'Class Schedule keeps recurring meeting times and locations close at hand and powers today’s class view.',
    path: '/class-schedule',
    selector: '[data-tour="class-schedule"]',
    icon: Clock,
  },
  notes: {
    title: 'Write notes where they belong',
    body: 'Create rich notes, connect them to courses, and open a daily course note directly from the current-class card.',
    path: '/notes',
    selector: '[data-tour="notes"]',
    icon: FileText,
  },
  courses: {
    title: 'Courses connect everything',
    body: 'Each course collects assignments, classes, notes, quick links, and plans that break any topic list into a daily schedule.',
    path: '/courses',
    selector: '[data-tour="courses"]',
    icon: GraduationCap,
  },
  navigation: {
    title: 'Move quickly and add from anywhere',
    body: 'Use the sidebar on larger screens or the bottom navigation and Add button on mobile to reach every core tool.',
    path: '/',
    selector: '[data-tour="navigation"]',
    icon: Map,
  },
  account: {
    title: 'Connections and preferences',
    body: 'Account is where you manage Google Calendar, school calendar imports, notification rules, profile details, billing, exports, and this walkthrough.',
    path: '/account',
    selector: '[data-tour="account"]',
    icon: Settings,
  },
};

const nextStep: Record<OnboardingStep, OnboardingStep> = {
  welcome: 'course',
  course: 'coursework',
  coursework: 'schedule',
  schedule: 'services',
  services: 'dashboard',
  dashboard: 'calendar',
  calendar: 'homework',
  homework: 'class_schedule',
  class_schedule: 'notes',
  notes: 'courses',
  courses: 'study_plan',
  study_plan: 'navigation',
  navigation: 'account',
  account: 'complete',
  complete: 'complete',
};

const setupSteps = new Set<OnboardingStep>(['welcome', 'course', 'coursework', 'schedule', 'services', 'study_plan', 'complete']);

function tomorrowIso() {
  const date = new Date();
  date.setDate(date.getDate() + 1);
  return date.toISOString().slice(0, 10);
}

function errorMessage(error: unknown) {
  const message = (error as { error?: { message?: string } })?.error?.message;
  return message ?? (error instanceof Error ? error.message : 'Something went wrong. Please try again.');
}

function findTourTarget(selector: string): Element | null {
  return [...document.querySelectorAll(selector)].find((candidate) => {
    const rect = candidate.getBoundingClientRect();
    return rect.width > 0 && rect.height > 0;
  }) ?? null;
}

type SpotlightRect = {
  step: OnboardingStep;
  left: number;
  top: number;
  width: number;
  height: number;
};

function rectChanged(previous: SpotlightRect | null, next: SpotlightRect) {
  return !previous
    || previous.step !== next.step
    || Math.abs(previous.left - next.left) > 0.5
    || Math.abs(previous.top - next.top) > 0.5
    || Math.abs(previous.width - next.width) > 0.5
    || Math.abs(previous.height - next.height) > 0.5;
}

export default function OnboardingExperience() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const headingRef = useRef<HTMLHeadingElement>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const [state, setState] = useState<OnboardingState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [targetRect, setTargetRect] = useState<SpotlightRect | null>(null);
  const [courseCode, setCourseCode] = useState('');
  const [courseName, setCourseName] = useState('');
  const [assignmentName, setAssignmentName] = useState('');
  const [assignmentDate, setAssignmentDate] = useState(tomorrowIso);
  const [classDay, setClassDay] = useState('Mon');
  const [classStart, setClassStart] = useState('09:00');
  const [classEnd, setClassEnd] = useState('10:00');
  const [classLocation, setClassLocation] = useState('');
  const [serviceMessage, setServiceMessage] = useState<string | null>(null);
  const [serviceStatusLoading, setServiceStatusLoading] = useState(false);
  const [remindersEnabled, setRemindersEnabled] = useState<boolean | null>(null);
  const [reminderPermission, setReminderPermission] = useState<NotificationPermissionStatus | null>(null);
  const [calendarConnection, setCalendarConnection] = useState<{ connected: boolean; email: string | null } | null>(null);
  const [mobileChecklistExpanded, setMobileChecklistExpanded] = useState(false);
  const [courseRows, , , reloadCourses] = useLoadAction<unknown[]>('loadCourses', [], { userId: user?.id });
  const [createCourse] = useMutateAction<Record<string, unknown>, unknown[]>('createCourse');
  const [createAssignment] = useMutateAction<Record<string, unknown>, unknown[]>('createAssignment');
  const [createClassSession] = useMutateAction<Record<string, unknown>, unknown[]>('createClassSession');
  const courses = useMemo(() => courseRows.map((row) => mapCourse(row as never)), [courseRows]);
  const currentCourse = courses[0];

  const refreshServiceConnections = useCallback(async () => {
    setServiceStatusLoading(true);
    const [remindersResult, permissionResult, calendarResult] = await Promise.allSettled([
      getNotificationPreferences(),
      getNotificationPermissionStatus(),
      getGoogleCalendarStatus(),
    ]);
    setRemindersEnabled(remindersResult.status === 'fulfilled' ? remindersResult.value.enabled : false);
    setReminderPermission(permissionResult.status === 'fulfilled' ? permissionResult.value : 'unsupported');
    if (calendarResult.status === 'fulfilled') {
      setCalendarConnection({
        connected: calendarResult.value.connected,
        email: calendarResult.value.googleEmail,
      });
    } else {
      setCalendarConnection({ connected: false, email: null });
    }
    setServiceStatusLoading(false);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const pendingUser = window.localStorage?.getItem(ONBOARDING_INITIALIZE_PENDING_KEY) ?? null;
      const next = pendingUser === user.id ? await initializeOnboarding() : await getOnboarding();
      if (pendingUser === user.id && next) window.localStorage?.removeItem(ONBOARDING_INITIALIZE_PENDING_KEY);
      setState(next);
    } catch {
      // Onboarding must never block the rest of the application.
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => { void load(); }, [load]);

  useEffect(() => {
    if (state?.status === 'active' && state.currentStep === 'services') {
      void refreshServiceConnections();
    }
  }, [refreshServiceConnections, state?.currentStep, state?.status]);

  useEffect(() => {
    const refreshProgress = () => { if (state && state.status !== 'active') void load(); };
    window.addEventListener('ums-api-action-mutated', refreshProgress);
    window.addEventListener('ums-notifications-changed', refreshProgress);
    return () => {
      window.removeEventListener('ums-api-action-mutated', refreshProgress);
      window.removeEventListener('ums-notifications-changed', refreshProgress);
    };
  }, [load, state]);

  useEffect(() => {
    const restart = () => {
      setBusy(true);
      void restartOnboarding()
        .then((next) => {
          setState(next);
          setError(null);
          navigate('/');
        })
        .catch((err) => setError(errorMessage(err)))
        .finally(() => setBusy(false));
    };
    window.addEventListener('ums-onboarding-restart', restart);
    return () => window.removeEventListener('ums-onboarding-restart', restart);
  }, [navigate]);

  const activeStep = state?.currentStep;
  const tour = activeStep ? tourSteps[activeStep] : undefined;

  useEffect(() => {
    if (state?.status !== 'active' || !tour || !activeStep) {
      setTargetRect(null);
      return;
    }
    const spotlightStep = activeStep;
    setTargetRect(null);
    if (location.pathname !== tour.path) {
      navigate(tour.path);
      return;
    }

    let animationFrame = 0;
    let observedTarget: Element | null = null;
    let didInitialScroll = false;
    let resizeObserver: ResizeObserver | null = null;

    const measure = () => {
      const target = findTourTarget(tour.selector);
      if (!target) {
        observedTarget = null;
        resizeObserver?.disconnect();
        setTargetRect(null);
        return;
      }

      if (target !== observedTarget) {
        observedTarget = target;
        resizeObserver?.disconnect();
        resizeObserver?.observe(target);
        didInitialScroll = false;
      }

      const rect = target.getBoundingClientRect();
      if (!didInitialScroll && (rect.top < 0 || rect.bottom > window.innerHeight || rect.left < 0 || rect.right > window.innerWidth)) {
        didInitialScroll = true;
        target.scrollIntoView({
          block: 'center',
          inline: 'nearest',
          behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
        });
      }

      const next: SpotlightRect = {
        step: spotlightStep,
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
      };
      setTargetRect((previous) => rectChanged(previous, next) ? next : previous);
    };

    const scheduleMeasure = () => {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = window.requestAnimationFrame(measure);
    };

    if (typeof ResizeObserver !== 'undefined') {
      resizeObserver = new ResizeObserver(scheduleMeasure);
      resizeObserver.observe(document.documentElement);
    }
    const mutationObserver = new MutationObserver(scheduleMeasure);
    mutationObserver.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'style', 'data-tour'],
    });

    const interval = window.setInterval(scheduleMeasure, 250);
    const initialTimeouts = [0, 50, 100, 200, 400, 800, 1_200].map((delay) => window.setTimeout(scheduleMeasure, delay));
    if (document.fonts) void document.fonts.ready.then(scheduleMeasure).catch(() => undefined);

    window.addEventListener('resize', scheduleMeasure);
    window.addEventListener('orientationchange', scheduleMeasure);
    window.addEventListener('scroll', scheduleMeasure, true);
    document.addEventListener('transitionend', scheduleMeasure, true);
    document.addEventListener('animationend', scheduleMeasure, true);
    window.visualViewport?.addEventListener('resize', scheduleMeasure);
    window.visualViewport?.addEventListener('scroll', scheduleMeasure);

    return () => {
      window.cancelAnimationFrame(animationFrame);
      window.clearInterval(interval);
      initialTimeouts.forEach((timeout) => window.clearTimeout(timeout));
      resizeObserver?.disconnect();
      mutationObserver.disconnect();
      window.removeEventListener('resize', scheduleMeasure);
      window.removeEventListener('orientationchange', scheduleMeasure);
      window.removeEventListener('scroll', scheduleMeasure, true);
      document.removeEventListener('transitionend', scheduleMeasure, true);
      document.removeEventListener('animationend', scheduleMeasure, true);
      window.visualViewport?.removeEventListener('resize', scheduleMeasure);
      window.visualViewport?.removeEventListener('scroll', scheduleMeasure);
    };
  }, [activeStep, location.pathname, navigate, state?.status, tour]);

  useEffect(() => {
    if (state?.status === 'active') {
      window.setTimeout(() => headingRef.current?.focus(), 0);
    }
  }, [state?.currentStep, state?.status]);

  const mutateState = async (input: Parameters<typeof updateOnboarding>[0]) => {
    setBusy(true);
    setError(null);
    try {
      const next = await updateOnboarding(input);
      setState(next);
      return next;
    } catch (err) {
      setError(errorMessage(err));
      return null;
    } finally {
      setBusy(false);
    }
  };

  const advance = async (mode: 'complete_step' | 'defer_step' = 'complete_step') => {
    if (!activeStep || activeStep === 'complete') return;
    const next = await mutateState({ action: mode, step: activeStep, nextStep: nextStep[activeStep] });
    if (next) void trackProductEvent(mode === 'complete_step' ? 'onboarding_step_completed' : 'onboarding_step_deferred', { step: activeStep });
  };

  const skip = async () => {
    const next = await mutateState({ action: 'skip' });
    if (next) void trackProductEvent('onboarding_skipped', { step: activeStep ?? 'welcome' });
  };

  useEffect(() => {
    // Setup steps render through Radix Dialog (see `shell` below), which already
    // provides a focus trap, Escape handling, and scroll lock. This manual trap is
    // only needed for the tour/spotlight coachmark, which is intentionally a
    // non-blocking overlay (the page behind it stays visible and interactive) and
    // so can't use a real modal dialog.
    if (state?.status !== 'active' || !activeStep || setupSteps.has(activeStep)) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        void skip();
        return;
      }
      if (event.key !== 'Tab' || !dialogRef.current) return;
      const focusable = [...dialogRef.current.querySelectorAll<HTMLElement>('button:not([disabled]), input:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])')];
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state?.status, state?.currentStep]);

  const submitCourse = async (event: FormEvent) => {
    event.preventDefault();
    if (!courseCode.trim() || !courseName.trim()) {
      setError('Enter both a course code and course name.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createCourse({ code: courseCode.trim(), name: courseName.trim(), color: 'course-sapphire', homepageUrl: '', userId: user?.id });
      await reloadCourses();
      await advance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitAssignment = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentCourse || !assignmentName.trim() || !assignmentDate) return;
    setBusy(true);
    setError(null);
    try {
      await createAssignment({
        courseId: currentCourse.id,
        name: assignmentName.trim(),
        dueDate: assignmentDate,
        dueTime: null,
        dueTimeZone: getBrowserTimeZone(),
        description: null,
        userId: user?.id,
      });
      await advance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const submitSchedule = async (event: FormEvent) => {
    event.preventDefault();
    if (!currentCourse || !classStart || !classEnd) return;
    if (classEnd <= classStart) {
      setError('Class end time must be later than its start time.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await createClassSession({
        courseId: currentCourse.id,
        day: classDay,
        startTime: classStart,
        endTime: classEnd,
        location: classLocation.trim(),
        userId: user?.id,
      });
      await advance();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const enableNotifications = async () => {
    setBusy(true);
    setError(null);
    try {
      const permission = await requestNotificationPermission();
      const preferences = await getNotificationPreferences();
      await updateNotificationPreferences({
        ...preferences,
        enabled: true,
        timeZone: preferences.timeZone || getBrowserTimeZone(),
      });
      await syncAndScheduleNotifications();
      setRemindersEnabled(true);
      setReminderPermission(permission);
      setServiceMessage(permission === 'denied'
        ? 'In-app reminders are on. Device notifications remain blocked in system settings.'
        : 'Notifications are ready.');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const startCalendarConnection = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await connectGoogleCalendar();
      window.location.assign(result.authorizationUrl);
    } catch (err) {
      setError(errorMessage(err));
      setBusy(false);
    }
  };

  if (loading || !state) return null;

  const inferred = new Set(state.inferredCompletedSteps);
  const checklistItems = [
    { step: 'course' as const, label: 'Add your first course', icon: GraduationCap, path: '/courses' },
    { step: 'coursework' as const, label: 'Add or import coursework', icon: BookOpen, path: '/homework' },
    { step: 'schedule' as const, label: 'Add a class time', icon: Clock, path: '/class-schedule' },
    { step: 'services' as const, label: 'Enable reminders or Calendar', icon: BellRing, path: '/account' },
  ];
  const completedChecklistCount = checklistItems.filter((item) => inferred.has(item.step)).length;
  const nextChecklistItem = checklistItems.find((item) => !inferred.has(item.step));
  const showChecklist = state.status !== 'active'
    && !state.checklistDismissedAt
    && completedChecklistCount < checklistItems.length
    && location.pathname === '/';

  if (showChecklist) {
    const resumeWalkthrough = () => void mutateState({ action: 'resume' }).then((next) => {
      if (next) void trackProductEvent('onboarding_resumed', { step: next.currentStep });
    });

    return (
      <Card data-testid="getting-started-card" className="fixed inset-x-4 bottom-[calc(6.4rem+env(safe-area-inset-bottom))] z-20 h-auto overflow-hidden rounded-xl border-primary/25 bg-background/95 shadow-lg backdrop-blur sm:left-auto sm:right-5 sm:max-h-[70dvh] sm:w-[23rem] sm:overflow-y-auto sm:shadow-xl md:bottom-auto md:top-5">
        <CardHeader className="flex-row items-center justify-between space-y-0 px-4 pb-2 pt-3 sm:items-start sm:px-6 sm:pb-3 sm:pt-6">
          <div>
            <CardTitle className="flex items-center gap-2 text-base sm:text-lg"><ListChecks className="h-4 w-4 text-primary sm:h-5 sm:w-5" />Getting Started</CardTitle>
            <p className="mt-0.5 text-[11px] text-muted-foreground sm:mt-1 sm:text-xs">{completedChecklistCount} of {checklistItems.length} essentials ready</p>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 sm:h-9 sm:w-9"
            aria-label="Dismiss Getting Started checklist"
            onClick={() => void mutateState({ action: 'dismiss_checklist' }).then((next) => {
              if (next) void trackProductEvent('onboarding_checklist_dismissed');
            })}
          ><X className="h-4 w-4" /></Button>
        </CardHeader>
        <CardContent className="flex-none space-y-2 overflow-visible px-4 pb-3 sm:space-y-3 sm:px-6 sm:pb-6">
          <div className="h-1.5 overflow-hidden rounded-full bg-muted sm:h-2"><div className="h-full bg-primary" style={{ width: `${completedChecklistCount * 25}%` }} /></div>

          <div className="sm:hidden">
            {!mobileChecklistExpanded && nextChecklistItem && (() => {
              const NextIcon = nextChecklistItem.icon;
              return (
                <button type="button" onClick={() => navigate(nextChecklistItem.path)} className="mt-2 flex w-full items-center gap-2 rounded-md bg-muted/60 px-3 py-2 text-left">
                  <NextIcon className="h-4 w-4 shrink-0 text-primary" />
                  <span className="min-w-0 flex-1 truncate text-xs font-medium">Next: {nextChecklistItem.label}</span>
                  <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
                </button>
              );
            })()}
            {mobileChecklistExpanded && (
              <div className="mt-2 max-h-[32dvh] space-y-1 overflow-y-auto border-t pt-2">
                {checklistItems.map((item) => {
                  const done = inferred.has(item.step);
                  const Icon = item.icon;
                  return (
                    <button key={item.step} type="button" onClick={() => navigate(item.path)} className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-xs hover:bg-muted">
                      <span className={`flex h-6 w-6 items-center justify-center rounded-full ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                        {done ? <Check className="h-3.5 w-3.5" /> : <Icon className="h-3.5 w-3.5" />}
                      </span>
                      <span className={done ? 'line-through opacity-70' : 'font-medium'}>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            )}
            <div className="mt-2 grid grid-cols-[1fr_auto] gap-2">
              <Button size="sm" className="h-9 gap-1.5 text-xs" aria-label="Resume walkthrough" onClick={resumeWalkthrough}>
                <Sparkles className="h-3.5 w-3.5" />Resume
              </Button>
              <Button size="sm" variant="outline" className="h-9 text-xs" aria-expanded={mobileChecklistExpanded} onClick={() => setMobileChecklistExpanded((expanded) => !expanded)}>
                {mobileChecklistExpanded ? 'Hide steps' : 'View steps'}
              </Button>
            </div>
          </div>

          <div className="hidden space-y-1 sm:block">
            {checklistItems.map((item) => {
              const done = inferred.has(item.step);
              const Icon = item.icon;
              return (
                <button key={item.step} type="button" onClick={() => navigate(item.path)} className="flex w-full items-center gap-3 rounded-md px-2 py-2 text-left text-sm hover:bg-muted">
                  <span className={`flex h-7 w-7 items-center justify-center rounded-full ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                    {done ? <Check className="h-4 w-4" /> : <Icon className="h-4 w-4" />}
                  </span>
                  <span className={done ? 'line-through opacity-70' : 'font-medium'}>{item.label}</span>
                </button>
              );
            })}
          </div>
          <Button className="hidden w-full gap-2 sm:inline-flex" onClick={resumeWalkthrough}>
            <Sparkles className="h-4 w-4" />Resume walkthrough
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (state.status !== 'active' || !activeStep) return null;

  const stepIndex = ONBOARDING_STEPS.indexOf(activeStep);
  const progress = Math.max(0, Math.round(((stepIndex + 1) / ONBOARDING_STEPS.length) * 100));
  const serviceStatusPending = serviceStatusLoading || remindersEnabled === null || calendarConnection === null;

  const shell = (title: string, description: string, icon: typeof Gauge, content: ReactNode) => {
    const Icon = icon;
    return (
      <DialogPrimitive.Root open onOpenChange={(next) => { if (!next) void skip(); }}>
        <DialogPrimitive.Portal>
          <DialogPrimitive.Overlay className="fixed inset-0 z-[90] bg-black/55" />
          <DialogPrimitive.Content
            onInteractOutside={(event) => event.preventDefault()}
            className="fixed inset-x-0 bottom-0 z-[91] max-h-[92dvh] w-full overflow-y-auto rounded-t-2xl bg-background shadow-2xl outline-none sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl"
          >
            <div className="sticky top-0 z-10 border-b bg-background px-5 pb-4 pt-5 sm:px-6">
              <div className="mb-3 flex items-center justify-between gap-4 text-xs font-semibold text-muted-foreground">
                <span>Getting started · {stepIndex + 1} of {ONBOARDING_STEPS.length}</span>
                <Button variant="ghost" size="sm" onClick={() => void skip()} disabled={busy}>Skip walkthrough</Button>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary transition-[width]" style={{ width: `${progress}%` }} /></div>
            </div>
            <div className="p-5 sm:p-6">
              <p className="sr-only" aria-live="polite">Walkthrough step {stepIndex + 1} of {ONBOARDING_STEPS.length}: {title}</p>
              <div className="mb-5 flex items-start gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><Icon className="h-5 w-5" /></span>
                <div>
                  <DialogPrimitive.Title asChild>
                    <h2 ref={headingRef} tabIndex={-1} className="text-xl font-bold outline-none">{title}</h2>
                  </DialogPrimitive.Title>
                  <DialogPrimitive.Description asChild>
                    <p className="mt-1 text-sm text-muted-foreground">{description}</p>
                  </DialogPrimitive.Description>
                </div>
              </div>
              {content}
              {error && <p role="alert" className="mt-4 rounded-md bg-destructive/10 px-3 py-2 text-sm font-medium text-destructive">{error}</p>}
            </div>
          </DialogPrimitive.Content>
        </DialogPrimitive.Portal>
      </DialogPrimitive.Root>
    );
  };

  if (setupSteps.has(activeStep)) {
    if (activeStep === 'welcome') return shell(
      `Welcome${user?.firstName ? `, ${user.firstName}` : ''}!`,
      'In about three minutes, we’ll add the essentials and show you how UMS keeps schoolwork organized.',
      Sparkles,
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-3">
          {[['Set up', 'Add a course and key dates.'], ['Explore', 'See every core workspace.'], ['Stay flexible', 'Skip now and resume anytime.']].map(([label, text]) => (
            <div key={label} className="rounded-lg border bg-muted/30 p-3"><p className="text-sm font-bold">{label}</p><p className="mt-1 text-xs text-muted-foreground">{text}</p></div>
          ))}
        </div>
        <Button className="w-full gap-2" onClick={() => void advance()} disabled={busy}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}Start setup</Button>
      </div>
    );

    if (activeStep === 'course') return shell(
      'Add your first course',
      'Courses tie assignments, class times, notes, links, and plans together.',
      GraduationCap,
      currentCourse ? (
        <div className="space-y-4">
          <div className="rounded-lg border bg-muted/30 p-4"><p className="font-bold">{currentCourse.code}</p><p className="text-sm text-muted-foreground">{currentCourse.name}</p></div>
          <Button className="w-full" onClick={() => void advance()} disabled={busy}>Use this course</Button>
        </div>
      ) : (
        <form className="space-y-4" onSubmit={submitCourse}>
          <label className="grid gap-1.5 text-sm font-medium">Course code<Input value={courseCode} onChange={(event) => setCourseCode(event.target.value)} placeholder="e.g. CS 101" autoFocus /></label>
          <label className="grid gap-1.5 text-sm font-medium">Course name<Input value={courseName} onChange={(event) => setCourseName(event.target.value)} placeholder="e.g. Intro to Computer Science" /></label>
          <Button type="submit" className="w-full gap-2" disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Add course</Button>
        </form>
      )
    );

    if (activeStep === 'coursework') return shell(
      'Add an upcoming assignment',
      'Add one deadline now. You can import many at once from a Brightspace PDF or Canvas calendar later.',
      BookOpen,
      <form className="space-y-4" onSubmit={submitAssignment}>
        <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm">Course: <strong>{currentCourse?.code ?? 'Your first course'}</strong></div>
        <label className="grid gap-1.5 text-sm font-medium">Assignment name<Input value={assignmentName} onChange={(event) => setAssignmentName(event.target.value)} placeholder="e.g. Problem Set 1" required /></label>
        <label className="grid gap-1.5 text-sm font-medium">Due date<Input type="date" value={assignmentDate} onChange={(event) => setAssignmentDate(event.target.value)} required /></label>
        <Button type="submit" className="w-full" disabled={busy || !currentCourse}>Add assignment</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void advance('defer_step')} disabled={busy}>Do this later</Button>
      </form>
    );

    if (activeStep === 'schedule') return shell(
      'Add a weekly class time',
      'This powers your daily class view and makes course notes one tap away.',
      Clock,
      <form className="space-y-4" onSubmit={submitSchedule}>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1.5 text-sm font-medium">Day<select className="h-10 rounded-md border bg-background px-3" value={classDay} onChange={(event) => setClassDay(event.target.value)}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day) => <option key={day}>{day}</option>)}</select></label>
          <label className="grid gap-1.5 text-sm font-medium">Location<Input value={classLocation} onChange={(event) => setClassLocation(event.target.value)} placeholder="Optional" /></label>
          <label className="grid gap-1.5 text-sm font-medium">Starts<Input type="time" value={classStart} onChange={(event) => setClassStart(event.target.value)} /></label>
          <label className="grid gap-1.5 text-sm font-medium">Ends<Input type="time" value={classEnd} onChange={(event) => setClassEnd(event.target.value)} /></label>
        </div>
        <Button type="submit" className="w-full" disabled={busy || !currentCourse}>Add class time</Button>
        <Button type="button" variant="ghost" className="w-full" onClick={() => void advance('defer_step')} disabled={busy}>Do this later</Button>
      </form>
    );

    if (activeStep === 'services') return shell(
      'Connect your planning tools',
      'These are optional. UMS still works fully with manual entry and in-app reminders.',
      BellRing,
      <div className="space-y-3">
        <div className="flex items-center justify-between rounded-md bg-muted/50 px-3 py-2 text-sm" role="status">
          <span className="font-medium">Connection status</span>
          <span className="flex items-center gap-1.5 text-muted-foreground">
            {serviceStatusPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5 text-primary" />}
            {serviceStatusPending
              ? 'Checking…'
              : `${Number(remindersEnabled === true) + Number(calendarConnection?.connected === true)} of 2 connected`}
          </span>
        </div>
        <button
          type="button"
          className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left ${remindersEnabled ? 'border-primary/35 bg-primary/5' : 'hover:bg-muted'}`}
          onClick={() => void enableNotifications()}
          disabled={busy || serviceStatusPending || remindersEnabled === true}
        >
          {remindersEnabled ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <BellRing className="h-5 w-5 text-primary" />}
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{remindersEnabled ? 'Reminders connected' : 'Enable reminders'}</span>
            <span className="block text-xs text-muted-foreground">
              {remindersEnabled
                ? reminderPermission === 'denied'
                  ? 'In-app reminders enabled · device alerts blocked'
                  : 'Assignment, event, and class alerts are enabled'
                : 'Assignment, event, and class alerts'}
            </span>
          </span>
          {remindersEnabled ? <span className="text-xs font-semibold text-primary">Connected</span> : <ChevronRight className="h-4 w-4" />}
        </button>
        <button
          type="button"
          className={`flex w-full items-center gap-3 rounded-lg border p-4 text-left ${calendarConnection?.connected ? 'border-primary/35 bg-primary/5' : 'hover:bg-muted'}`}
          onClick={() => void startCalendarConnection()}
          disabled={busy || serviceStatusPending || calendarConnection?.connected === true}
        >
          {calendarConnection?.connected ? <CheckCircle2 className="h-5 w-5 text-primary" /> : <CalendarDays className="h-5 w-5 text-primary" />}
          <span className="min-w-0 flex-1">
            <span className="block font-bold">{calendarConnection?.connected ? 'Google Calendar connected' : 'Connect Google Calendar'}</span>
            <span className="block truncate text-xs text-muted-foreground">
              {calendarConnection?.connected
                ? calendarConnection.email ?? 'Primary calendar access is ready'
                : 'You’ll return here after Google authorization'}
            </span>
          </span>
          {calendarConnection?.connected ? <span className="text-xs font-semibold text-primary">Connected</span> : <ChevronRight className="h-4 w-4" />}
        </button>
        {serviceMessage && <p role="status" className="rounded-md bg-primary/10 px-3 py-2 text-sm text-primary">{serviceMessage}</p>}
        <Button className="w-full" onClick={() => void advance()} disabled={busy}>Continue to app tour</Button>
        <Button variant="ghost" className="w-full" onClick={() => void advance('defer_step')} disabled={busy}>Set up later</Button>
      </div>
    );

    if (activeStep === 'study_plan') return shell(
      'How Plans work',
      'List your topics, say how much time you have each day, and a plan spreads the work up to your target date.',
      BookOpenCheck,
      <div className="space-y-3">
        {[
          ['1. First pass', 'Get through the material once. Read, watch lectures, or build understanding.'],
          ['2. Deepen', 'Go back over what did not land with problems, examples, or your own notes.'],
          ['3. Review', 'Check what you can reconstruct on your own, close to your target date.'],
        ].map(([title, text]) => (
          <div key={title} className="rounded-lg border bg-muted/30 p-3">
            <p className="text-sm font-bold">{title}</p>
            <p className="mt-1 text-xs text-muted-foreground">{text}</p>
          </div>
        ))}
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-3 text-sm">
          <p className="font-bold">One note per topic</p>
          <p className="mt-1 text-muted-foreground">All three passes for a topic share the same note. What you write on the first pass carries forward as your reference later.</p>
        </div>
        <p className="text-xs text-muted-foreground">Studying for an exam? Pick the Learn, Practice, Recall style instead. Prefer one task per topic? Pick single pass. You choose when you create a plan.</p>
        <Button className="w-full gap-2" onClick={() => void advance()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}Continue</Button>
      </div>
    );

    return shell(
      'You’re ready to get organized',
      'Your setup is saved. Anything you deferred stays in the Getting Started checklist on Dashboard.',
      CheckCircle2,
      <div className="space-y-4">
        <div className="rounded-lg border border-primary/25 bg-primary/5 p-4 text-sm"><p className="font-bold">A solid starting point</p><p className="mt-1 text-muted-foreground">You can restart this walkthrough anytime from Account without changing your data.</p></div>
        <Button className="w-full gap-2" disabled={busy} onClick={() => void mutateState({ action: 'complete' }).then((next) => {
          if (next) { void trackProductEvent('onboarding_completed'); navigate('/'); }
        })}><CheckCircle2 className="h-4 w-4" />Finish walkthrough</Button>
      </div>
    );
  }

  if (!tour) return null;
  const TourIcon = tour.icon;
  return (
    <>
      {targetRect?.step === activeStep ? (
        <div
          data-testid="onboarding-spotlight"
          data-spotlight-status="target"
          aria-hidden="true"
          className="pointer-events-none fixed z-[80] rounded-xl ring-4 ring-primary ring-offset-4 ring-offset-background"
          style={{
            left: Math.max(8, targetRect.left - 4),
            top: Math.max(8, targetRect.top - 4),
            width: Math.max(24, targetRect.width + 8),
            height: Math.max(24, targetRect.height + 8),
            boxShadow: '0 0 0 9999px rgb(0 0 0 / 0.58)',
          }}
        />
      ) : <div data-testid="onboarding-spotlight" data-spotlight-status="fallback" aria-hidden="true" className="pointer-events-none fixed inset-0 z-[80] bg-black/55" />}
      <section ref={(node) => { dialogRef.current = node; }} role="dialog" aria-modal="true" aria-labelledby="onboarding-title" className="fixed inset-x-3 bottom-[calc(6.4rem+env(safe-area-inset-bottom))] z-[90] rounded-2xl bg-background p-5 shadow-2xl sm:left-auto sm:right-5 sm:w-[24rem] md:bottom-5">
        <p className="sr-only" aria-live="polite">Feature tour step {stepIndex + 1} of {ONBOARDING_STEPS.length}: {tour.title}</p>
        <div className="mb-3 flex items-center justify-between text-xs font-semibold text-muted-foreground"><span>Feature tour · {stepIndex + 1} of {ONBOARDING_STEPS.length}</span><Button variant="ghost" size="sm" onClick={() => void skip()} disabled={busy}>Skip</Button></div>
        <div className="mb-4 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full bg-primary" style={{ width: `${progress}%` }} /></div>
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary"><TourIcon className="h-5 w-5" /></span>
          <div><h2 ref={headingRef} tabIndex={-1} id="onboarding-title" className="font-bold outline-none">{tour.title}</h2><p className="mt-1 text-sm text-muted-foreground">{tour.body}</p></div>
        </div>
        {error && <p role="alert" className="mt-3 text-sm font-medium text-destructive">{error}</p>}
        <div className="mt-5 flex gap-2"><Button className="flex-1 gap-2" onClick={() => void advance()} disabled={busy}>{busy && <Loader2 className="h-4 w-4 animate-spin" />}{activeStep === 'account' ? 'Complete tour' : 'Next'}<ChevronRight className="h-4 w-4" /></Button></div>
      </section>
    </>
  );
}
