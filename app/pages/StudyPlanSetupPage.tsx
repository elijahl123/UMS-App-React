import { useEffect, useMemo, useState, type CSSProperties } from 'react';
import { ArrowLeft, BookOpenCheck, CalendarDays, Clock3, Plus, Save, Sparkles, Trash2 } from 'lucide-react';
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
import type { ExamType, StudyAvailability, StudyDifficulty, StudyTargetType } from '@/app/data/types';
import { availableStudyMinutes, formatStudyMinutes, STUDY_PHASE_MINUTES, todayForTimeZone } from '@/app/data/studyPlans';
import { parseStudyTopics, saveStudyPlan, studyPlanErrorMessage } from '@/app/lib/studyPlans/client';
import { useStudyPlanDefinition } from '@/app/lib/studyPlans/useStudyPlans';
import { useAuth } from '@/app/lib/auth/AuthContext';
import { trackProductEvent } from '@/app/lib/launch/client';

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

type TopicDraft = { id?: string; title: string; difficulty: StudyDifficulty };

type SectionHeadingProps = {
  step: number;
  title: string;
  description: string;
  icon: typeof CalendarDays;
};

function SectionHeading({ step, title, description, icon: Icon }: SectionHeadingProps) {
  return (
    <div className="flex items-start gap-3">
      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_72%,white)] text-[var(--study-course-text)]">
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
  const [estimatedMinutes, setEstimatedMinutes] = useState(180);
  const [dailyCapMinutes, setDailyCapMinutes] = useState(60);
  const [partialPlanAcknowledged, setPartialPlanAcknowledged] = useState(false);
  const [startDate, setStartDate] = useState(today);
  const [examDate, setExamDate] = useState(addDays(today, 30));
  const [timeZone, setTimeZone] = useState(browserTimeZone);
  const [topicText, setTopicText] = useState('');
  const [topics, setTopics] = useState<TopicDraft[]>([]);
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
    setEstimatedMinutes(existing.estimatedMinutes ?? 180);
    setDailyCapMinutes(existing.dailyCapMinutes ?? 60);
    setPartialPlanAcknowledged(existing.partialPlanAcknowledged);
    setStartDate(existing.startDate);
    setExamDate(existing.examDate);
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

  const requiredMinutes = useMemo(
    () => targetType === 'exam'
      ? topics.reduce((total, topic) => {
        const phases = STUDY_PHASE_MINUTES[topic.difficulty];
        return total + phases.learn + phases.practice + phases.recall;
      }, 0)
      : estimatedMinutes,
    [estimatedMinutes, targetType, topics]
  );
  const availableMinutes = useMemo(
    () => (startDate < examDate
      ? availableStudyMinutes(
          startDate,
          examDate,
          targetType === 'exam' ? availability : availability.map((entry) => ({ ...entry, minutes: entry.minutes > 0 ? dailyCapMinutes : 0 }))
        )
      : 0),
    [availability, dailyCapMinutes, examDate, startDate, targetType]
  );
  const missingMinutes = Math.max(0, requiredMinutes - availableMinutes);

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
    if (targetType === 'exam' && !topics.length) {
      setError('Add at least one topic.');
      return;
    }
    if ((targetType === 'exam' && startDate >= examDate) || (targetType !== 'exam' && startDate > examDate)) {
      setError(targetType === 'exam' ? 'The study plan must start before the exam.' : 'The plan cannot start after its due date.');
      return;
    }
    if (targetType !== 'exam' && !targetTitle.trim()) {
      setError('Add a title for this assignment or project.');
      return;
    }
    if (missingMinutes > 0 && (targetType === 'exam' || !partialPlanAcknowledged)) {
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
          targetDate: examDate,
          targetTime: targetTime || null,
          estimatedMinutes: targetType === 'exam' ? null : estimatedMinutes,
          dailyCapMinutes: targetType === 'exam' ? null : dailyCapMinutes,
          availableWeekdays: availability.filter((entry) => entry.minutes > 0).map((entry) => entry.weekday),
          partialPlanAcknowledged,
          examType, examDate, startDate, timeZone,
          availability: targetType === 'exam' ? availability : availability.map((entry) => ({ ...entry, minutes: entry.minutes > 0 ? dailyCapMinutes : 0 })),
          topics: targetType === 'exam' ? topics : [{ title: targetTitle.trim(), difficulty: 'light' }],
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
    return <div className="p-6 text-center text-muted-foreground">Loading study plan...</div>;
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
          Back to {planId ? 'study plan' : course.code}
        </button>
        <div>
            <div className="mb-1 flex flex-wrap items-center gap-2">
              <span className="rounded-full bg-[color-mix(in_srgb,var(--study-course-bg)_72%,white)] px-2.5 py-1 text-[0.68rem] font-bold uppercase tracking-[0.14em] text-[var(--study-course-text)]">
                {course.code}
              </span>
              <span className="text-xs font-semibold text-muted-foreground">{course.name}</span>
            </div>
            <h1 className="mobile-page-title">
              {planId ? 'Edit study plan' : 'Create study plan'}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted-foreground">
              Turn an exam, assignment, or project into a focused day-by-day plan.
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
                title="Target details"
                description="Choose what you are planning, its deadline, and when work should begin."
                icon={CalendarDays}
              />
            </div>
            <div className="grid gap-4 p-4 pt-1 sm:grid-cols-2 sm:p-5 sm:pt-2">
              <div className="space-y-2">
                <Label className="text-xs font-bold text-[var(--secondary-accent)]">Target type</Label>
                <Select value={targetType} onValueChange={(value) => { setTargetType(value as StudyTargetType); setPartialPlanAcknowledged(false); }}>
                  <SelectTrigger className="h-12 rounded-lg bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exam">Exam</SelectItem>
                    <SelectItem value="assignment">Assignment</SelectItem>
                    <SelectItem value="project">Project</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {targetType === 'exam' ? <div className="space-y-2">
                <Label className="text-xs font-bold text-[var(--secondary-accent)]">Exam type</Label>
                <Select value={examType} onValueChange={(value) => setExamType(value as ExamType)}>
                  <SelectTrigger className="h-12 rounded-lg bg-white"><SelectValue /></SelectTrigger>
                  <SelectContent><SelectItem value="midterm">Midterm</SelectItem><SelectItem value="final">Final</SelectItem></SelectContent>
                </Select>
              </div> : <div className="space-y-2">
                <Label htmlFor="target-title" className="text-xs font-bold text-[var(--secondary-accent)]">Title</Label>
                <Input id="target-title" className="h-12 rounded-lg bg-white" maxLength={200} placeholder={targetType === 'assignment' ? 'Research essay' : 'Group project'} value={targetTitle} onChange={(event) => setTargetTitle(event.target.value)} />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="exam-date" className="text-xs font-bold text-[var(--secondary-accent)]">{targetType === 'exam' ? 'Exam date' : 'Due date'}</Label>
                <Input className="h-12 rounded-lg bg-white" id="exam-date" type="date" min={targetType === 'exam' ? addDays(today, 1) : today} value={examDate} onChange={(e) => { setExamDate(e.target.value); setPartialPlanAcknowledged(false); }} />
              </div>
              {targetType !== 'exam' && <div className="space-y-2">
                <Label htmlFor="target-time" className="text-xs font-bold text-[var(--secondary-accent)]">Due time (optional)</Label>
                <Input className="h-12 rounded-lg bg-white" id="target-time" type="time" value={targetTime} onChange={(event) => setTargetTime(event.target.value)} />
              </div>}
              <div className="space-y-2">
                <Label htmlFor="start-date" className="text-xs font-bold text-[var(--secondary-accent)]">Start date</Label>
                <Input className="h-12 rounded-lg bg-white" id="start-date" type="date" min={today} max={targetType === 'exam' ? addDays(examDate, -1) : examDate} value={startDate} onChange={(e) => setStartDate(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timezone" className="text-xs font-bold text-[var(--secondary-accent)]">Timezone</Label>
                <Input className="h-12 rounded-lg bg-white" id="timezone" value={timeZone} onChange={(e) => setTimeZone(e.target.value)} />
              </div>
            </div>
          </section>

          {targetType === 'exam' && <section className="border-t border-[var(--border-light)]">
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <SectionHeading
                step={2}
                title="Course topics"
                description="Paste the modules, weeks, chapters, or papers you need to cover."
                icon={BookOpenCheck}
              />
            </div>
            <div className="space-y-4 p-4 pt-1 sm:p-5 sm:pt-2">
              <div className="space-y-2">
                <Label htmlFor="topic-list" className="text-xs font-bold text-[var(--secondary-accent)]">One topic per line</Label>
                <Textarea
                  id="topic-list"
                  aria-label="Paste modules or topics, one per line"
                  rows={4}
                  className="min-h-28 resize-y rounded-lg bg-white"
                  placeholder={'Week 1: Asymptotic Analysis\nWeek 2: Breadth-First Search\nSample exam paper'}
                  value={topicText}
                  onChange={(e) => setTopicText(e.target.value)}
                />
                <Button type="button" variant="outline" size="sm" className="h-10 rounded-lg px-4" onClick={importTopics} disabled={!topicText.trim()}>
                  <Plus className="mr-1 h-4 w-4" /> Add topics
                </Button>
              </div>
              {topics.length === 0 ? (
                <div className="rounded-lg border border-dashed border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_20%,white)] px-4 py-5 text-center">
                  <BookOpenCheck className="mx-auto h-5 w-5 text-[var(--study-course-text)] opacity-70" />
                  <p className="mt-2 text-sm font-semibold text-[var(--secondary-accent)]">No topics added yet</p>
                  <p className="mt-1 text-xs text-muted-foreground">Paste your course outline above, then add it to the plan.</p>
                </div>
              ) : (
                <div className="space-y-2">
                  {topics.map((topic, index) => (
                    <div key={topic.id ?? index} className="mobile-list-item rounded-lg border-l-4 border-l-[var(--study-course-border)] bg-white p-2.5 sm:grid sm:grid-cols-[minmax(0,1fr)_8rem_auto] sm:items-center sm:gap-2">
                      <Input
                        className="h-10 rounded-lg bg-white"
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
                          <SelectTrigger className="h-10 flex-1 rounded-lg bg-white" aria-label={`Difficulty for ${topic.title}`}><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="light">Light</SelectItem>
                            <SelectItem value="medium">Medium</SelectItem>
                            <SelectItem value="heavy">Heavy</SelectItem>
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
            </div>
          </section>}

          <section className="border-t border-[var(--border-light)]">
            <div className="p-4 pb-3 sm:p-5 sm:pb-3">
              <SectionHeading
                step={3}
                title="Weekly availability"
                description={targetType === 'exam' ? 'Set a realistic study budget for each day. Use zero for rest days.' : 'Choose the weekdays you can work and one maximum daily workload.'}
                icon={Clock3}
              />
            </div>
            <div className="p-4 pt-1 sm:p-5 sm:pt-2">
              {targetType !== 'exam' && (
                <div className="mb-4 grid gap-3 sm:grid-cols-2">
                  <label className="grid gap-1.5 text-xs font-bold text-[var(--secondary-accent)]">Estimated total work
                    <span className="flex items-center gap-2"><Input type="number" min={15} max={10080} step={15} className="h-10 bg-white" value={estimatedMinutes} onChange={(event) => { setEstimatedMinutes(Math.max(15, Math.round(Number(event.target.value || 15) / 15) * 15)); setPartialPlanAcknowledged(false); }} /><span className="font-medium text-muted-foreground">minutes</span></span>
                  </label>
                  <label className="grid gap-1.5 text-xs font-bold text-[var(--secondary-accent)]">Maximum per day
                    <span className="flex items-center gap-2"><Input type="number" min={15} max={720} step={15} className="h-10 bg-white" value={dailyCapMinutes} onChange={(event) => { setDailyCapMinutes(Math.max(15, Math.min(720, Math.round(Number(event.target.value || 15) / 15) * 15))); setPartialPlanAcknowledged(false); }} /><span className="font-medium text-muted-foreground">minutes</span></span>
                  </label>
                </div>
              )}
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4 xl:grid-cols-7">
                {availability.map((entry) => (
                  <div key={entry.weekday} className={`rounded-lg border p-3 ${entry.minutes > 0 ? 'border-[var(--study-course-border)] bg-[color-mix(in_srgb,var(--study-course-bg)_30%,white)]' : 'border-[var(--border-light)] bg-white'}`}>
                    <Label className="text-xs font-bold text-[var(--study-course-text)]" htmlFor={`availability-${entry.weekday}`}>{DAYS[entry.weekday]}</Label>
                    {targetType === 'exam' ? <Input
                      className="mt-2 h-10 rounded-lg bg-white text-center font-bold"
                      id={`availability-${entry.weekday}`}
                      type="number"
                      min={0}
                      max={720}
                      step={15}
                      value={entry.minutes}
                      onChange={(e) => {
                        const minutes = Math.max(0, Math.min(720, Math.round(Number(e.target.value || 0) / 15) * 15));
                        setAvailability((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, minutes } : item));
                      }}
                    /> : <label className="mt-3 flex items-center gap-2 text-xs font-medium"><input id={`availability-${entry.weekday}`} type="checkbox" checked={entry.minutes > 0} onChange={(event) => { setAvailability((current) => current.map((item) => item.weekday === entry.weekday ? { ...item, minutes: event.target.checked ? dailyCapMinutes : 0 } : item)); setPartialPlanAcknowledged(false); }} />Available</label>}
                    {targetType === 'exam' && <p className="mt-1.5 text-center text-[0.68rem] font-medium text-muted-foreground">minutes</p>}
                  </div>
                ))}
              </div>
            </div>
          </section>
          </CardContent>
        </Card>

        <aside className="lg:sticky lg:top-0">
          <Card className="mobile-surface h-auto overflow-hidden border border-[var(--border-light)] border-t-4 border-t-[var(--study-course-border)] bg-white">
            <CardHeader className="p-4 pb-3 sm:p-5 sm:pb-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-[color-mix(in_srgb,var(--study-course-bg)_42%,white)] text-[var(--study-course-text)]">
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
              <div className="flex items-center justify-between rounded-lg border border-[var(--border-light)] bg-white px-3 py-2.5 text-sm">
                <span className="text-muted-foreground">{targetType === 'exam' ? 'Topics' : 'Target'}</span>
                <span className="max-w-40 truncate font-bold text-[var(--secondary-accent)]">{targetType === 'exam' ? topics.length : targetTitle || 'Untitled'}</span>
              </div>
              <p className={`text-sm leading-relaxed ${missingMinutes ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                {missingMinutes
                  ? `${formatStudyMinutes(missingMinutes)} cannot be scheduled within the selected capacity.`
                  : targetType === 'exam'
                    ? topics.length ? `Your selected topics fit within the available time.` : 'Add your course topics to calculate the study workload.'
                    : 'The work fits evenly across the selected days. Any 15-minute rounding remainder goes to earlier days.'}
              </p>
              {targetType !== 'exam' && missingMinutes > 0 && (
                <label className="flex items-start gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-xs text-amber-950">
                  <input type="checkbox" className="mt-0.5" checked={partialPlanAcknowledged} onChange={(event) => setPartialPlanAcknowledged(event.target.checked)} />
                  <span>Save a partial plan and leave {formatStudyMinutes(missingMinutes)} visibly unscheduled. No work will be silently discarded.</span>
                </label>
              )}
              {error && <p role="alert" className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</p>}
              <Button className="mobile-primary-action h-12 w-full rounded-lg" onClick={handleSave} disabled={saving || (targetType === 'exam' ? !topics.length || missingMinutes > 0 : !targetTitle.trim() || (missingMinutes > 0 && !partialPlanAcknowledged))}>
                <Save className="mr-2 h-4 w-4" />
                {saving ? 'Building plan...' : planId ? 'Save and rebuild' : 'Create study plan'}
              </Button>
            </CardContent>
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default StudyPlanSetupPage;
