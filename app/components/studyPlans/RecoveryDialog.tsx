import { useEffect, useState } from 'react';
import { AlertTriangle, ArrowRight, CalendarPlus, Clock3, LoaderCircle, RotateCcw } from 'lucide-react';
import type { StudyRecoveryPreview } from '@/app/data/types';
import { formatStudyDate, formatStudyMinutes } from '@/app/data/studyPlans';
import {
  confirmStudyPlanRecovery,
  previewStudyPlanRecovery,
  studyPlanErrorMessage,
} from '@/app/lib/studyPlans/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

type Props = {
  planId: string;
  userId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onApplied: () => Promise<void> | void;
};

function reasonText(preview: StudyRecoveryPreview): string {
  const reasons = preview.reasons.map((reason) => {
    if (reason === 'overdue') return 'overdue work';
    if (reason === 'over_capacity') return 'days above capacity';
    return 'unscheduled work';
  });
  return reasons.length > 0 ? `Recovery is recommended because this plan has ${reasons.join(' and ')}.` : 'This plan does not currently need recovery.';
}

export function RecoveryDialog({ planId, userId, open, onOpenChange, onApplied }: Props) {
  const [preview, setPreview] = useState<StudyRecoveryPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [additionalMinutesPerDay, setAdditionalMinutesPerDay] = useState(0);
  const [loading, setLoading] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadPreview = async (omittedGroupIds: string[], addedMinutes = additionalMinutesPerDay) => {
    setLoading(true);
    setError(null);
    try {
      setPreview(await previewStudyPlanRecovery(planId, omittedGroupIds, addedMinutes, userId));
    } catch (err) {
      setError(studyPlanErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!open) {
      setPreview(null);
      setSelected([]);
      setAdditionalMinutesPerDay(0);
      setError(null);
      return;
    }
    void loadPreview([], 0);
    // The dialog intentionally refreshes only when it is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, planId]);

  const toggleOmission = (groupId: string) => {
    const next = selected.includes(groupId)
      ? selected.filter((id) => id !== groupId)
      : [...selected, groupId];
    setSelected(next);
    void loadPreview(next);
  };

  const changeAdditionalMinutes = (minutes: number) => {
    setAdditionalMinutesPerDay(minutes);
    setSelected([]);
    void loadPreview([], minutes);
  };

  const leaveRecommendedWorkUnscheduled = () => {
    if (!preview) return;
    const recommended = preview.recommendedOmittedGroupIds;
    setSelected(recommended);
    setAdditionalMinutesPerDay(0);
    void loadPreview(recommended, 0);
  };

  const confirmRecovery = async () => {
    if (!preview) return;
    setConfirming(true);
    setError(null);
    try {
      await confirmStudyPlanRecovery(planId, preview.stateToken, selected, additionalMinutesPerDay, userId);
      await onApplied();
      onOpenChange(false);
    } catch (err) {
      setError(studyPlanErrorMessage(err));
      if ((err as { error?: { message?: string } })?.error?.message === 'RECOVERY_PREVIEW_STALE') {
        await loadPreview(selected);
      }
    } finally {
      setConfirming(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl gap-5 border-[var(--border-light)] bg-[var(--surface)] p-0 shadow-2xl">
        <DialogHeader className="border-b border-[var(--border-light)] bg-card px-4 py-5 pr-12 sm:px-6">
          <DialogTitle className="flex items-center gap-2 text-xl">
            <RotateCcw className="h-5 w-5 text-primary" /> Recovery Mode
          </DialogTitle>
          <DialogDescription>
            Preview a safer schedule before anything changes. Completed and manually edited tasks stay fixed.
          </DialogDescription>
        </DialogHeader>

        {loading && !preview ? (
          <div className="flex min-h-48 items-center justify-center gap-2 text-sm text-muted-foreground">
            <LoaderCircle className="h-5 w-5 animate-spin" /> Building recovery preview…
          </div>
        ) : preview ? (
          <div className={`min-w-0 space-y-5 px-4 sm:px-6 ${loading ? 'opacity-65' : ''}`} aria-busy={loading}>
            <p className="rounded-lg border border-primary/20 bg-[color-mix(in_srgb,var(--main-color)_7%,var(--card))] p-3 text-sm font-medium text-[var(--secondary-accent)]">
              {reasonText(preview)}
            </p>

            <section aria-labelledby="recovery-totals-heading">
              <h3 id="recovery-totals-heading" className="mb-2 text-sm font-bold text-[var(--secondary-accent)]">Workload preview</h3>
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {[
                  ['Overdue', preview.totals.before.overdueMinutes, preview.totals.after.overdueMinutes],
                  ['Over capacity', preview.totals.before.overCapacityMinutes, preview.totals.after.overCapacityMinutes],
                  ['Scheduled', preview.totals.before.scheduledMinutes, preview.totals.after.scheduledMinutes],
                  ['Unscheduled', preview.totals.before.unscheduledMinutes, preview.totals.after.unscheduledMinutes],
                ].map(([label, before, after]) => (
                  <div key={String(label)} className="rounded-lg border border-[var(--border-light)] bg-card p-3">
                    <p className="text-xs font-semibold text-muted-foreground">{label}</p>
                    <p className="mt-1 flex items-center gap-1 text-sm font-bold text-[var(--secondary-accent)]">
                      {formatStudyMinutes(Number(before))}<ArrowRight className="h-3 w-3" />{formatStudyMinutes(Number(after))}
                    </p>
                  </div>
                ))}
                <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
                  <p className="text-xs font-semibold text-muted-foreground">Moved</p>
                  <p className="mt-1 text-sm font-bold text-primary">{formatStudyMinutes(preview.totals.movedMinutes)}</p>
                </div>
              </div>
            </section>

            {(preview.shortfallMinutes > 0 || additionalMinutesPerDay > 0 || preview.capacityChanges.length > 0) && (
              <section aria-labelledby="recovery-capacity-heading" className="rounded-xl border border-[var(--border-light)] bg-card p-4 shadow-sm">
                <div className="flex items-start gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                    <CalendarPlus className="h-5 w-5" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <h3 id="recovery-capacity-heading" className="font-bold text-[var(--secondary-accent)]">Make more room before your target date</h3>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Add extra time to your remaining work days. Recovery uses only as much as needed and saves those dates to this plan.
                    </p>
                  </div>
                </div>
                <div
                  className="mt-4 grid grid-cols-2 gap-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_minmax(11rem,1.2fr)]"
                  role="group"
                  aria-label="Extra time per remaining work day"
                >
                  {[0, 15, 30, 60, 720].map((minutes) => (
                    <Button
                      key={minutes}
                      type="button"
                      variant={additionalMinutesPerDay === minutes ? 'default' : 'outline'}
                      className={`h-11 min-w-0 rounded-lg px-3 ${minutes === 720 ? 'col-span-2 lg:col-span-1' : ''}`}
                      onClick={() => changeAdditionalMinutes(minutes)}
                      disabled={loading || confirming}
                      aria-pressed={additionalMinutesPerDay === minutes}
                    >
                      {minutes === 0 ? 'Current time' : minutes === 720 ? 'Add time needed' : `+${minutes} min/day`}
                    </Button>
                  ))}
                </div>
                {preview.capacityChanges.length > 0 && (
                  <div className="mt-4 rounded-lg bg-[var(--secondary-color)]/55 p-3">
                    <p className="flex items-center gap-2 text-sm font-bold text-[var(--secondary-accent)]">
                      <Clock3 className="h-4 w-4 text-primary" />
                      {formatStudyMinutes(preview.capacityChanges.reduce((sum, change) => sum + change.addedMinutes, 0))} added across {preview.capacityChanges.length} work {preview.capacityChanges.length === 1 ? 'day' : 'days'}
                    </p>
                    <div className="mt-2 grid gap-1 text-xs text-muted-foreground sm:grid-cols-2">
                      {preview.capacityChanges.map((change) => (
                        <span key={change.date}>
                          {formatStudyDate(change.date, { weekday: 'short', month: 'short', day: 'numeric' })}: {formatStudyMinutes(change.beforeMinutes)} → {formatStudyMinutes(change.afterMinutes)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </section>
            )}

            {preview.requiredOmissionMinutes > 0 && (
              <section aria-labelledby="recovery-omissions-heading" className="rounded-xl border border-[var(--border-light)] bg-card p-4 shadow-sm">
                <h3 id="recovery-omissions-heading" className="font-bold text-[var(--secondary-accent)]">Or leave work unscheduled</h3>
                <p className="mt-1 text-sm">
                  The plan is short by {formatStudyMinutes(preview.requiredOmissionMinutes)}. Choose dependency-safe work below; nothing is silently discarded.
                </p>
                {preview.recommendedOmittedGroupIds.length > 0 && selected.length === 0 && (
                  <Button
                    type="button"
                    variant="outline"
                    className="mt-3 h-11 w-full justify-center rounded-lg border-primary/30 text-primary hover:bg-primary/5 sm:w-auto"
                    onClick={leaveRecommendedWorkUnscheduled}
                    disabled={loading || confirming}
                  >
                    Leave the remaining work unscheduled
                  </Button>
                )}
                <div className="mt-3 space-y-2">
                  {[...preview.omissionGroups].reverse().map((group) => (
                    <label key={group.id} className="flex cursor-pointer items-start gap-3 rounded-lg border border-[var(--border-light)] bg-[var(--secondary-color)]/35 p-3 text-sm transition-colors hover:border-primary/30 hover:bg-primary/5">
                      <input
                        type="checkbox"
                        className="mt-0.5 h-4 w-4 accent-primary"
                        checked={selected.includes(group.id)}
                        onChange={() => toggleOmission(group.id)}
                        disabled={loading || confirming}
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block font-semibold">{group.title}</span>
                        <span className="text-xs opacity-75">
                          {formatStudyMinutes(group.minutes)}
                          {group.cascadesTo.length > 0 ? ` · also leaves ${group.cascadesTo.length} later phase${group.cascadesTo.length === 1 ? '' : 's'} unscheduled` : ''}
                        </span>
                      </span>
                    </label>
                  ))}
                </div>
                {preview.shortfallMinutes > 0 ? (
                  <p role="status" className="mt-3 rounded-md bg-destructive/10 p-2 text-sm font-bold text-destructive">Choose {formatStudyMinutes(preview.shortfallMinutes)} more or add more time per day.</p>
                ) : (
                  <p role="status" className="mt-3 rounded-md bg-primary/10 p-2 text-sm font-bold text-primary">The selected omissions cover the shortfall.</p>
                )}
              </section>
            )}

            {preview.unresolvedTasks.length > 0 && (
              <section aria-labelledby="recovery-pinned-heading" className="rounded-lg border border-destructive/25 bg-destructive/5 p-3">
                <h3 id="recovery-pinned-heading" className="flex items-center gap-2 font-bold text-[var(--secondary-accent)]">
                  <AlertTriangle className="h-4 w-4 text-destructive" /> Manual action still needed
                </h3>
                <p className="mt-1 text-sm text-muted-foreground">These manually edited tasks are pinned and will not move.</p>
                <ul className="mt-2 space-y-1 text-sm">
                  {preview.unresolvedTasks.map((task) => (
                    <li key={`${task.id}:${task.reason}`} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 truncate font-semibold">{task.title}</span>
                      <span className="shrink-0 text-xs text-muted-foreground">{formatStudyDate(task.scheduledDate, { month: 'short', day: 'numeric' })}</span>
                    </li>
                  ))}
                </ul>
              </section>
            )}

            {preview.dayChanges.length > 0 && (
              <section aria-labelledby="recovery-days-heading">
                <h3 id="recovery-days-heading" className="mb-2 text-sm font-bold text-[var(--secondary-accent)]">Affected days</h3>
                <div className="max-h-48 divide-y divide-[var(--border-light)] overflow-y-auto rounded-lg border border-[var(--border-light)]">
                  {preview.dayChanges.map((day) => (
                    <div key={day.date} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 bg-card px-3 py-2 text-sm">
                      <span className="font-semibold">{formatStudyDate(day.date, { weekday: 'short', month: 'short', day: 'numeric' })}</span>
                      <span className="flex items-center gap-1 text-xs text-muted-foreground">
                        {formatStudyMinutes(day.beforeMinutes)} <ArrowRight className="h-3 w-3" /> {formatStudyMinutes(day.afterMinutes)}
                        <Badge variant="outline" className="ml-1">{formatStudyMinutes(day.capacityMinutes)} cap</Badge>
                      </span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <section aria-labelledby="recovery-changes-heading">
              <h3 id="recovery-changes-heading" className="mb-2 text-sm font-bold text-[var(--secondary-accent)]">Task changes</h3>
              <div className="max-h-48 divide-y divide-[var(--border-light)] overflow-y-auto rounded-lg border border-[var(--border-light)]">
                {preview.taskChanges.map((change) => (
                  <div key={change.groupId} className="flex items-center justify-between gap-3 bg-card px-3 py-2 text-sm">
                    <span className="min-w-0 truncate font-semibold">{change.title}</span>
                    <Badge variant={change.status === 'moved' ? 'default' : 'secondary'} className="shrink-0 capitalize">{change.status}</Badge>
                  </div>
                ))}
              </div>
            </section>
          </div>
        ) : null}

        {error && <p role="alert" className="mx-4 rounded-lg bg-destructive/10 p-3 text-sm font-semibold text-destructive sm:mx-6">{error}</p>}

        <DialogFooter className="sticky bottom-0 border-t border-[var(--border-light)] bg-card px-4 py-4 sm:px-6">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirming}>Cancel</Button>
          <Button onClick={confirmRecovery} disabled={!preview?.canConfirm || loading || confirming}>
            {confirming && <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />}
            Confirm recovery
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
