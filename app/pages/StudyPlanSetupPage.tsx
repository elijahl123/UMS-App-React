import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, BookOpenCheck, CalendarDays, Check, Clock3, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useLoadAction } from '@/app/lib/api/hooks';
import { getCourseColor } from '@/app/data/courseColors';
import { mapCourse } from '@/app/data/mappers';
import type { ExamType, PhasePreset, StudyAvailability, StudyDifficulty, StudyPlanMode, StudyTargetType } from '@/app/data/types';
import {
  availableStudyMinutes,
  formatStudyMinutes,
  parseStudyTopics,
  STUDY_DIFFICULTIES,
  todayForTimeZone,
  topicWorkloadMinutes,
} from '@/app/data/studyPlans';
import { saveStudyPlan, studyPlanErrorMessage } from '@/app/lib/studyPlans/client';
import { useStudyPlanDefinition } from '@/app/lib/studyPlans/useStudyPlans';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { trackProductEvent } from '@/app/lib/launch/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const WEEKDAY_PRESETS = [
  { label: 'Weekdays', weekdays: [1, 2, 3, 4, 5] },
  { label: 'Weekends', weekdays: [0, 6] },
  { label: 'Every day', weekdays: [0, 1, 2, 3, 4, 5, 6] },
  { label: 'Clear', weekdays: [] as number[] },
];

type TopicDraft = { id?: string; title: string; difficulty: StudyDifficulty };

type PlanStyle = 'topics' | 'estimate';

type TaskStyle = {
  value: string;
  label: string;
  hint: string;
  topicMode: StudyPlanMode;
  phasePreset: PhasePreset;
};

const TASK_STYLES: TaskStyle[] = [
  { value: 'study', label: 'Learn, Practice, Recall', hint: 'Three passes tuned for studying', topicMode: 'phases', phasePreset: 'study' },
  { value: 'general', label: 'First pass, Deepen, Review', hint: 'Three passes for any material', topicMode: 'phases', phasePreset: 'general' },
  { value: 'single', label: 'Single pass', hint: 'One task per topic', topicMode: 'single', phasePreset: 'general' },
];

const DIFFICULTY_LABELS: Record<StudyDifficulty, string> = {
  light: 'Light',
  medium: 'Medium',
  heavy: 'Heavy',
};

const TARGET_TYPES: Array<{ value: StudyTargetType; label: string }> = [
  { value: 'exam', label: 'Exam' },
  { value: 'assignment', label: 'Assignment' },
  { value: 'project', label: 'Project' },
  { value: 'general', label: 'Something else' },
];

const TITLE_PLACEHOLDERS: Record<StudyTargetType, string> = {
  exam: '',
  assignment: 'Research essay',
  project: 'Group project',
  general: 'Statistics reading list',
};

function targetDateLabel(targetType: StudyTargetType): string {
  if (targetType === 'exam') return 'Exam date';
  if (targetType === 'general') return 'Target date';
  return 'Due date';
}

function taskStyleFor(topicMode: StudyPlanMode, phasePreset: PhasePreset): TaskStyle {
  if (topicMode === 'single') return TASK_STYLES[2];
  return phasePreset === 'general' ? TASK_STYLES[1] : TASK_STYLES[0];
}

type SectionHeadingProps = {
  step: number;
  title: string;
  description: string;
  icon: typeof CalendarDays;
};

function SectionHeading({ step, title, description, icon: Icon }: SectionHeadingProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_72%,var(--surface))] text-[var(--study-course-text)]">
        <Icon className="h-5 w-5" />
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-[0.68rem] font-bold uppercase tracking-[0.16em] text-[var(--study-course-text)]">Step {step}</span>
          <span className="h-1 w-1 rounded-full bg-[var(--border-light)]" />
          <h2 className="text-base font-bold text-[var(--secondary-accent)]">{title}</h2>
        </div>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground sm:text-sm">{description}</p>
      </div>
    </div>
  );
}

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00`);
  value.setDate(value.getDate() + days);
  return value.toISOString().slice(0, 10);
}

function StudyPlanSetupPage() {
  const { courseId = '', planId } = useParams<{ courseId: string; planId?: string }>();
  const navigate = useNavigate();
  const { user } = useAuth();
  const [courseRows] = useLoadAction('loadCourses', [], { userId: user?.id });
  const courses = (courseRows ?? []).map(mapCourse);
  const course = courses.find((item) => item.id === courseId);
  const [existing, planLoading] = useStudyPlanDefinition(planId, user?.id);
  const browserTimeZone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  const today = todayForTimeZone(browserTimeZone);

  const [examType, setExamType] = useState<ExamType>('final');
  const [targetType, setTargetType] = useState<StudyTargetType>('exam');
  const [targetTitle, setTargetTitle] = useState('');
  const [targetTime, setTargetTime] = useState('');
  const [partialPlanAcknowledged, setPartialPlanAcknowledged] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [targetDate, setTargetDate] = useState(addDays(today, 30));
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [planStyle, setPlanStyle] = useState<PlanStyle>('topics');
  const [estimatedMinutes, setEstimatedMinutes] = useState(180);
  const [dailyCapMinutes, setDailyCapMinutes] = useState(60);
  const [topicText, setTopicText] = useState('');
  const [topics, setTopics] = useState<TopicDraft[]>([]);
  const [taskStyle, setTaskStyle] = useState<TaskStyle>(TASK_STYLES[0]);
  const [availability, setAvailability] = useState<StudyAvailability[]>(
    DAYS.map((_, weekday) => ({ weekday, minutes: weekday >= 1 && weekday <= 5 ? 60 : 0 }))
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hydratedPlanId, setHydratedPlanId] = useState<string | null>(null);

  useEffect(() => {
    if (!existing || hydratedPlanId === existing.id) return;
    setExamType(existing.examType);
    setTargetType(existing.targetType);
    setTargetTitle(existing.targetTitle);
    setTargetTime(existing.targetTime ?? '');
    setPartialPlanAcknowledged(existing.partialPlanAcknowledged);
    setPlanStyle(existing.schedulerVersion === 2 ? 'estimate' : 'topics');
    setEstimatedMinutes(existing.estimatedMinutes ?? 180);
    setDailyCapMinutes(existing.dailyCapMinutes ?? 60);
    setTaskStyle(taskStyleFor(existing.topicMode, existing.phasePreset));
    setStartDate(existing.startDate);
    setTargetDate(existing.targetDate);
    setTimeZone(existing.timeZone);
    setTopics(existing.topics.filter((topic) => topic.active).map((topic) => ({
      id: topic.id,
      title: topic.title,
      difficulty: topic.difficulty,
    })));
    setAvailability(DAYS.map((_, weekday) => ({
      weekday,
      minutes: existing.availability.find((entry) => entry.weekday === weekday)?.minutes ?? 0,
    })));
    setHydratedPlanId(existing.id);
  }, [existing, hydratedPlanId]);

  // Exams are always broken into topics. Everything else may instead be a single
  // body of work with one estimate, which the scheduler splits evenly.
  const topicsOptional = targetType !== 'exam';
  const usesTopics = !topicsOptional || planStyle === 'topics';
  // Switching an existing even-split plan to topics rebuilds it, so warn first.
  const convertsFromEvenSplit = Boolean(planId && existing && existing.schedulerVersion === 2 && usesTopics);
  const requiredMinutes = useMemo(
    () => (usesTopics
      ? topics.reduce((total, topic) => total + topicWorkloadMinutes(topic.difficulty, taskStyle.topicMode), 0)
      : estimatedMinutes),
    [estimatedMinutes, taskStyle, topics, usesTopics]
  );
  const effortSummary = STUDY_DIFFICULTIES
    .map((difficulty) => `${DIFFICULTY_LABELS[difficulty]} ${formatStudyMinutes(topicWorkloadMinutes(difficulty, taskStyle.topicMode))}`)
    .join(', ');
  const scheduledAvailability = useMemo(
    () => (usesTopics
      ? availability
      : availability.map((entry) => ({ ...entry, minutes: entry.minutes > 0 ? dailyCapMinutes : 0 }))),
    [availability, dailyCapMinutes, usesTopics]
  );
  const availableMinutes = useMemo(
    () => (startDate < targetDate ? availableStudyMinutes(startDate, targetDate, scheduledAvailability) : 0),
    [scheduledAvailability, startDate, targetDate]
  );
  const missingMinutes = Math.max(0, requiredMinutes - availableMinutes);
  const blocked = (usesTopics && !topics.length)
    || (targetType !== 'exam' && !targetTitle.trim())
    || (missingMinutes > 0 && !partialPlanAcknowledged);

  const setWeekdayActive = (weekday: number, active: boolean) => {
    setAvailability((current) => current.map((item) => item.weekday === weekday
      ? { ...item, minutes: active ? dailyCapMinutes : 0 }
      : item));
    setPartialPlanAcknowledged(false);
  };

  const setWeekdays = (weekdays: number[]) => {
    setAvailability((current) => current.map((item) => ({
      ...item,
      minutes: weekdays.includes(item.weekday) ? dailyCapMinutes : 0,
    })));
    setPartialPlanAcknowledged(false);
  };

  const importTopics = () => {
    const parsed = parseStudyTopics(topicText);
    if (!parsed.length) return;
    setTopics((current) => [
      ...current,
      ...parsed.slice(0, Math.max(0, 100 - current.length)).map((title) => ({
        title,
        difficulty: 'light' as const,
      })),
    ]);
    setTopicText('');
  };

  const handleSave = async () => {
    setError(null);
    if (usesTopics && !topics.length) {
      setError('Add at least one topic.');
      return;
    }
    if (startDate >= targetDate) {
      setError('A plan needs at least one day between its start and its target date.');
      return;
    }
    if (targetType !== 'exam' && !targetTitle.trim()) {
      setError('Add a title for this plan.');
      return;
    }
    if (missingMinutes > 0 && !partialPlanAcknowledged) {
      setError(`Add at least ${formatStudyMinutes(missingMinutes)} of availability or reduce the workload.`);
      return;
    }

    setSaving(true);
    try {
      const result = await saveStudyPlan(
        {
          courseId,
          targetType,
          targetTitle: targetType === 'exam' ? (examType === 'midterm' ? 'Midterm exam' : 'Final exam') : targetTitle.trim(),
          targetDate,
          targetTime: targetType === 'exam' ? null : (targetTime || null),
          estimatedMinutes: usesTopics ? null : estimatedMinutes,
          dailyCapMinutes: usesTopics ? null : dailyCapMinutes,
          availableWeekdays: availability.filter((entry) => entry.minutes > 0).map((entry) => entry.weekday),
          partialPlanAcknowledged,
          examType,
          examDate: targetDate,
          startDate,
          timeZone,
          availability: scheduledAvailability,
          topics: usesTopics ? topics : [],
          topicMode: taskStyle.topicMode,
          phasePreset: taskStyle.phasePreset,
        },
        planId,
        user?.id
      );
      void trackProductEvent('study_plan_created', { targetType });
      navigate(`/courses/${courseId}/study-plans/${result.planId}`);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  if (planId && planLoading && !existing) {
    return <div className="p-6 text-center text-muted-foreground">Loading plan...</div>;
  }

  if (!course) {
    return <div className="p-6 text-center text-muted-foreground">Course not found.</div>;
  }

  const courseColors = getCourseColor(course.color);
  const courseTheme = {
    '--study-course-bg': courseColors.bg,
    '--study-course-border': courseColors.border,
    '--study-course-text': courseColors.text,
  } as CSSProperties;
  return (
    <div
      className="mobile-page-stack mx-auto w-full max-w-6xl pb-6 md:h-full md:overflow-y-auto md:pr-1"
      style={courseTheme}
    >
      <header className="mobile-page-header shrink-0 !pr-1">
        <button
          type="button"
          onClick={() => navigate(planId ? `/courses/${courseId}/study-plans/${planId}` : `/courses/${courseId}`)}
          className="mb-3 flex w-fit items-center gap-1.5 rounded-lg py-1 text-xs font-bold text-muted-foreground transition-colors hover:text-[var(--study-course-text)] sm:text-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to {planId ? 'plan' : course.code}
        </button>
        <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--study-course-bg)_72%,var(--surface))] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--study-course-text)]">
                {course.code}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{course.name}</span>
            </div>
            <h1 className="mobile-page-title">
              {planId ? 'Edit plan' : 'Create plan'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Break any set of topics into a day by day schedule that fits the time you actually have.
            </p>
        </div>
      </header>

      <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
        <Card className="mobile-surface h-auto overflow-hidden border border-[var(--border-light)] border-l-4 border-l-[var(--study-course-border)]">
          <CardContent className="flex-none overflow-visible p-0">
          <section>
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <SectionHeading
                step={1}
                title="What you're planning"
                description="Name what this is working toward, when it lands, and when work should begin."
                icon={CalendarDays}
              />
            </div>
            <div className="grid gap-4 p-4 pt-1 sm:grid-cols-2 sm:p-5 sm:pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-[var(--secondary-accent)]">Plan type</Label>
                <Select value={targetType} onValueChange={(value) => { setTargetType(value as StudyTargetType); setPartialPlanAcknowledged(false); }}>
                  <SelectTrigger className="h-12 rounded-lg bg-card" aria-label="Plan type"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {TARGET_TYPES.map((option) => (
                      <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {targetType === 'exam' ? <div className="space-y-2">
                <Label className="text-xs font-bold text-[var(--secondary-accent)]">Exam type</Label>
                <Select value={examType} onValueChange={(value) => setExamType(value as ExamType)}>
                  <SelectTrigger className="h-12 rounded-lg bg-card" aria-label="Exam type"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="midterm">Midterm</SelectItem><SelectItem value="final">Final</SelectItem></SelectContent>
                </Select>
              </div> : <div className="space-y-2">
                <Label htmlFor="target-title" className="text-xs font-bold text-[var(--secondary-accent)]">Title</Label>
                <Input id="target-title" className="h-12 rounded-lg bg-card" maxLength={200} placeholder={TITLE_PLACEHOLDERS[targetType]} value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="exam-date" className="text-xs font-bold text-[var(--secondary-accent)]">{targetDateLabel(targetType)}</Label>
                <Input className="h-12 rounded-lg bg-card" id="exam-date" type="date" min={addDays(today, 1)} value={targetDate} onChange={(e) => { setTargetDate(e.target.value); setPartialPlanAcknowledged(false); }} />
              </div>
              {targetType !== 'exam' && <div className="space-y-2">
                <Label htmlFor="target-time" className="text-xs font-bold text-[var(--secondary-accent)]">Time of day (optional)</Label>
                <Input className="h-12 rounded-lg bg-card" id="target-time" type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-xs font-bold text-[var(--secondary-accent)]">Start date</Label>
                <Input className="h-12 rounded-lg bg-card" id="start-date" type="date" min={today} max={addDays(targetDate, -1)} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs font-bold text-[var(--secondary-accent)]">Timezone</Label>
                <Input className="h-12 rounded-lg bg-card" id="timezone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
              </div>
            </div>
          </section>

          <section className="border-t border-[var(--border-light)]">
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <SectionHeading
                step={2}
                title={usesTopics ? 'Topics' : 'Workload'}
                description={usesTopics
                  ? 'List the modules, chapters, sections, or milestones you need to get through.'
                  : 'Estimate the work once and it gets divided evenly across the days you pick.'}
                icon={BookOpenCheck}
              />
            </div>
            <div className="space-y-4 p-4 pt-1 sm:p-5 sm:pt-2">
              {topicsOptional && (
                <div className="space-y-2">
                  <Label className="text-xs font-bold text-[var(--secondary-accent)]">How to plan it</Label>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {([
                      { value: 'topics' as const, label: 'Break it into topics', hint: 'Plan each part separately' },
                      { value: 'estimate' as const, label: 'One time estimate', hint: 'Split evenly across your days' },
                    ]).map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => { setPlanStyle(option.value); setPartialPlanAcknowledged(false); }}
                        className={`rounded-lg border p-3 text-left ${planStyle === option.value ? 'border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_30%,var(--surface))]' : 'border-[var(--border-light)] bg-card'}`}
                      >
                        <span className="block text-sm font-bold text-[var(--secondary-accent)]">{option.label}</span>
                        <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {!usesTopics && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-bold text-[var(--secondary-accent)]">Estimated total work
                    <span className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={15}
                        max={10080}
                        step={15}
                        aria-label="Estimated total work in minutes"
                        className="h-10 bg-card"
                        value={estimatedMinutes}
                        onChange={(event) => {
                          setEstimatedMinutes(Math.max(15, Math.round(Number(event.target.value || 15) / 15) * 15));
                          setPartialPlanAcknowledged(false);
                        }}
                      />
                      <span className="font-medium text-muted-foreground">minutes</span>
                    </span>
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-[var(--secondary-accent)]">Maximum per day
                    <span className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={15}
                        max={720}
                        step={15}
                        aria-label="Maximum minutes per day"
                        className="h-10 bg-card"
                        value={dailyCapMinutes}
                        onChange={(event) => {
                          setDailyCapMinutes(Math.max(15, Math.min(720, Math.round(Number(event.target.value || 15) / 15) * 15)));
                          setPartialPlanAcknowledged(false);
                        }}
                      />
                      <span className="font-medium text-muted-foreground">minutes</span>
                    </span>
                  </label>
                </div>
              )}
              {usesTopics && (<>
              <div className="space-y-2">
                <Label className="text-xs font-bold text-[var(--secondary-accent)]">Task style</Label>
                <div className="grid gap-2 sm:grid-cols-3">
                  {TASK_STYLES.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      disabled={Boolean(planId)}
                      onClick={() => setTaskStyle(option)}
                      className={`rounded-lg border p-3 text-left disabled:cursor-not-allowed disabled:opacity-60 ${taskStyle.value === option.value ? 'border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_30%,var(--surface))]' : 'border-[var(--border-light)] bg-card'}`}
                    >
                      <span className="block text-sm font-bold text-[var(--secondary-accent)]">{option.label}</span>
                      <span className="mt-0.5 block text-xs text-muted-foreground">{option.hint}</span>
                    </button>
                  ))}
                </div>
                {planId && <p className="text-xs text-muted-foreground">Task style is set when a plan is created and can't be changed here.</p>}
              </div>
              <div className="space-y-2">
                <Label htmlFor="topic-list" className="text-xs font-bold text-[var(--secondary-accent)]">One topic per line</Label>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  Prefixes like &ldquo;Week 1:&rdquo; or &ldquo;Chapter 2.&rdquo; are trimmed off. A line that is only
                  &ldquo;Week 1&rdquo; is kept as the topic name.
                </p>
                <Textarea
                  id="topic-list"
                  aria-label="Paste your topics, one per line"
                  rows={4}
                  className="min-h-28 resize-y rounded-lg bg-card"
                  placeholder={'Chapter 1: Descriptive statistics\nChapter 2: Probability\nPractice paper'}
                  value={topicText}
                  onChange={(e) => setTopicText(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-lg px-4" onClick={importTopics} disabled={!topicText.trim()}>
                  <Plus className="mr-1 h-4 w-4" /> Add topics
                </Button>
              </div>
              {topics.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_20%,var(--surface))] px-4 py-5 text-center">
                  <BookOpenCheck className="mx-auto h-5 w-5 text-[var(--study-course-text)] opacity-70" />
                  <p className="mt-2 text-sm font-semibold text-[var(--secondary-accent)]">No topics added yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paste your outline above, then add it to the plan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  <p className="text-xs leading-relaxed text-muted-foreground">
                    Effort decides how much time a topic gets in total: {effortSummary}.{' '}
                    {taskStyle.topicMode === 'single'
                      ? 'That time becomes one task.'
                      : 'That time is split across the topic\u2019s three passes, weighted toward the first.'}{' '}
                    Heavier topics take a bigger share of your weekly budget, so the whole plan grows with them.
                  </p>
                  {topics.map((topic, index) => (
                    <div key={topic.id ?? index} className="mobile-list-item rounded-lg border-l-4 border-l-[var(--study-course-border)] bg-card p-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-center sm:gap-2">
                      <Input
                        className="h-10 rounded-lg bg-card"
                        aria-label={`Topic ${index + 1}`}
                        maxLength={200}
                        value={topic.title}
                        onChange={(e) => setTopics((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, title: e.target.value } : item))}
                      />
                      <div className="mt-2 flex gap-2 sm:contents">
                        <Select
                          value={topic.difficulty}
                          onValueChange={(value) => setTopics((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, difficulty: value as StudyDifficulty } : item))}
                        >
                          <SelectTrigger className="h-10 flex-1 rounded-lg bg-card" aria-label={`Effort for ${topic.title}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {STUDY_DIFFICULTIES.map((difficulty) => (
                              <SelectItem key={difficulty} value={difficulty}>
                                {DIFFICULTY_LABELS[difficulty]} · {formatStudyMinutes(topicWorkloadMinutes(difficulty, taskStyle.topicMode))}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button className="h-10 w-10 shrink-0 rounded-lg" type="button" variant="outline" size="icon" aria-label={`Remove ${topic.title}`} onClick={() => setTopics((current) => current.filter((_, itemIndex) => itemIndex !== index))}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
              </>)}
            </div>
          </section>

          <section className="border-t border-[var(--border-light)]">
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <SectionHeading
                step={3}
                title="Weekly time budget"
                description={usesTopics
                  ? 'Set how many minutes you can give each day. Use zero for days off.'
                  : 'Pick the days you can work. Each one takes up to your daily maximum.'}
                icon={Clock3}
              />
            </div>
            <div className="p-4 pt-1 sm:p-5 sm:pt-2">
              {!usesTopics && (
                <div className="mb-3 flex flex-wrap items-center gap-2">
                  <span className="text-xs font-semibold text-muted-foreground">Quick pick</span>
                  {WEEKDAY_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      onClick={() => setWeekdays(preset.weekdays)}
                      className="rounded-full border border-[var(--border-light)] bg-card px-3 py-1 text-xs font-semibold text-[var(--secondary-accent)] transition-colors hover:border-[var(--study-course-border)] hover:bg-[color-mix(in_srgb,var(--study-course-bg)_24%,var(--surface))] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] focus-visible:ring-offset-2"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
                {availability.map((entry) => {
                  const active = entry.minutes > 0;
                  if (!usesTopics) {
                    return (
                      <button
                        key={entry.weekday}
                        type="button"
                        role="switch"
                        aria-checked={active}
                        aria-label={`${DAY_NAMES[entry.weekday]}, ${active ? formatStudyMinutes(dailyCapMinutes) : 'not scheduled'}`}
                        onClick={() => setWeekdayActive(entry.weekday, !active)}
                        className={`flex min-h-[5.5rem] flex-col items-center justify-center gap-2 rounded-lg border p-3 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--main-color)] focus-visible:ring-offset-2 ${
                          active
                            ? 'border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_30%,var(--surface))]'
                            : 'border-[var(--border-light)] bg-card hover:border-[var(--study-course-border)] hover:bg-[color-mix(in_srgb,var(--study-course-bg)_14%,var(--surface))]'
                        }`}
                      >
                        <span className="text-xs font-bold text-[var(--study-course-text)]">{DAYS[entry.weekday]}</span>
                        <span
                          aria-hidden="true"
                          className={`flex h-6 w-6 items-center justify-center rounded-full border-2 transition-colors ${
                            active
                              ? 'border-[var(--study-course-border)] bg-[var(--study-course-border)] text-[var(--study-course-text)]'
                              : 'border-[var(--border-light)] bg-card text-transparent'
                          }`}
                        >
                          <Check className="h-3.5 w-3.5" strokeWidth={3} />
                        </span>
                        <span className={`text-[0.68rem] font-semibold ${active ? 'text-[var(--secondary-accent)]' : 'text-muted-foreground'}`}>
                          {active ? formatStudyMinutes(dailyCapMinutes) : 'Off'}
                        </span>
                      </button>
                    );
                  }
                  return (
                    <div key={entry.weekday} className={`rounded-lg border p-3 ${active ? 'border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_30%,var(--surface))]' : 'border-[var(--border-light)] bg-card'}`}>
                      <Label className="text-xs font-bold text-[var(--study-course-text)]" htmlFor={`availability-${entry.weekday}`}>{DAYS[entry.weekday]}</Label>
                      <Input
                        className="mt-2 h-10 rounded-lg bg-card text-center font-bold"
                        id={`availability-${entry.weekday}`}
                        type="number"
                        min={0}
                        max={720}
                        step={15}
                        value={entry.minutes}
                        onChange={(e) => {
                          const minutes = Math.max(0, Math.min(720, Math.round(Number(e.target.value || 0) / 15) * 15));
                          setAvailability((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, minutes } : item));
                          setPartialPlanAcknowledged(false);
                        }}
                      />
                      <p className="mt-1.5 text-center text-[0.68rem] font-medium text-muted-foreground">minutes</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>
          </CardContent>
        </Card>

        <aside className="lg:sticky lg:top-0">
          <Card className="mobile-surface h-auto overflow-hidden border border-[var(--border-light)] border-t-4 border-t-[var(--study-course-border)] bg-card">
            <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_42%,var(--surface))] text-[var(--study-course-text)]">
                  <Sparkles className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-base text-[var(--secondary-accent)]">Plan preview</CardTitle>
                  <p className="mt-1 text-xs text-muted-foreground">Your workload at a glance</p>
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-none space-y-4 overflow-visible p-4 pt-1 sm:p-5 sm:pt-2">
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--secondary-color)]/35 p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">Required</p>
                  <p className="mt-1 text-lg font-bold text-[var(--secondary-accent)]">{formatStudyMinutes(requiredMinutes)}</p>
                </div>
                <div className="rounded-lg border border-[var(--border-light)] bg-[var(--secondary-color)]/35 p-3">
                  <p className="text-[0.68rem] font-bold uppercase tracking-wide text-muted-foreground">Available</p>
                  <p className="mt-1 text-lg font-bold text-[var(--secondary-accent)]">{formatStudyMinutes(availableMinutes)}</p>
                </div>
              </div>
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-light)] bg-card px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{usesTopics ? 'Topics' : 'Target'}</span>
                <span className="max-w-40 truncate font-bold text-[var(--secondary-accent)]">
                  {usesTopics ? topics.length : targetTitle || 'Untitled'}
                </span>
              </div>
              <p className={`text-sm leading-relaxed ${missingMinutes ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                {missingMinutes
                  ? `${formatStudyMinutes(missingMinutes)} cannot be scheduled within the selected capacity.`
                  : !usesTopics
                    ? 'The work fits evenly across the selected days. Any 15-minute rounding remainder goes to earlier days.'
                    : topics.length
                      ? 'Your topics fit within the available time.'
                      : 'Add your topics to calculate the workload.'}
              </p>
              {missingMinutes > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-[color-mix(in_srgb,var(--course-citrine)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_34%,var(--surface))] p-3 text-xs text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]">
                  <input type="checkbox" className="mt-0.5" checked={partialPlanAcknowledged} onChange={(event) => setPartialPlanAcknowledged(event.target.checked)} />
                  <span>Save a partial plan and leave {formatStudyMinutes(missingMinutes)} visibly unscheduled. No work will be silently discarded.</span>
                </label>
              )}
              {convertsFromEvenSplit && (
                <p role="status" className="rounded-lg border border-[color-mix(in_srgb,var(--course-citrine)_64%,var(--surface))] bg-[color-mix(in_srgb,var(--course-citrine)_34%,var(--surface))] p-3 text-xs text-[color-mix(in_srgb,var(--course-citrine)_68%,var(--secondary-accent))]">
                  This plan was built by splitting one time total evenly across your days. Saving rebuilds it from the topics above. Completed work is kept.
                </p>
              )}
              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button className="mobile-primary-action h-12 w-full rounded-lg" onClick={handleSave} disabled={saving || blocked}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Building plan...' : planId ? 'Save and rebuild' : 'Create plan'}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default StudyPlanSetupPage;
