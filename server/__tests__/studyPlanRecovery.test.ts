import { describe, expect, it } from 'vitest';
import {
  confirmStudyPlanRecovery,
  loadStudyPlanRecoveryStatus,
  previewStudyPlanRecovery,
  undoStudyPlanRecovery,
} from '../studyPlanRecovery';
import { todayInTimeZone } from '../studyPlanScheduler';

function addDays(date: string, days: number): string {
  const value = new Date(`${date}T00:00:00.000Z`);
  value.setUTCDate(value.getUTCDate() + days);
  return value.toISOString().slice(0, 10);
}

type MemoryTask = {
  id: string;
  topic_id: string;
  phase: 'learn' | 'practice' | 'recall';
  title_override: string | null;
  scheduled_date: string;
  estimated_minutes: number;
  sequence: number;
  manually_edited_at: string | null;
};

function recoveryClient(owner = 'owner-1') {
  const today = todayInTimeZone('UTC');
  const state = {
    owner,
    unscheduledMinutes: 0,
    capacityOverrides: [] as Array<{ date: string; minutes: number }>,
    nextId: 10,
    tasks: [
      {
        id: '1', topic_id: '1', phase: 'learn' as const, title_override: null,
        scheduled_date: addDays(today, -1), estimated_minutes: 60, sequence: 0, manually_edited_at: null,
      },
      {
        id: '2', topic_id: '1', phase: 'practice' as const, title_override: 'Pinned practice',
        scheduled_date: addDays(today, 1), estimated_minutes: 15, sequence: 1,
        manually_edited_at: '2026-08-01T00:00:00.000Z',
      },
    ] as MemoryTask[],
    revision: null as null | {
      id: string;
      before_tasks: unknown[];
      before_capacity_overrides: Array<{ date: string; minutes: number }>;
      before_unscheduled_minutes: number;
      after_state_hash: string;
      applied_at: string;
      undone: boolean;
    },
  };
  const query = async (sql: string, params: unknown[] = []) => {
    if (sql.includes('COALESCE(p.target_date, p.exam_date)::text AS target_date')) {
      if (params[1] !== state.owner) return { rows: [] };
      return { rows: [{ id: '1', target_date: addDays(today, 4), timezone: 'UTC', unscheduled_minutes: state.unscheduledMinutes }] };
    }
    if (sql.includes('FROM study_plan_availability')) {
      return { rows: Array.from({ length: 7 }, (_, weekday) => ({ weekday, minutes: 60 })) };
    }
    if (sql.includes('SELECT study_date::text AS date, minutes FROM study_plan_capacity_overrides')) {
      return { rows: state.capacityOverrides };
    }
    if (sql.includes('FROM study_tasks task') && sql.includes('topic.position AS topic_position')) {
      return { rows: state.tasks.map((task) => ({
        ...task,
        topic_title: 'Graphs',
        topic_position: 0,
        title: task.title_override ?? `${task.phase}: Graphs`,
      })) };
    }
    if (sql.includes('FROM study_topics') && sql.includes('LIMIT 1')) {
      return { rows: [{ id: '1', title: 'Graphs', position: 0 }] };
    }
    if (sql.includes('DELETE FROM study_tasks')) {
      state.tasks = state.tasks.filter((task) => task.manually_edited_at);
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO study_tasks')) {
      const inserted = JSON.parse(String(params[1])) as Array<{
        topic_id: string;
        phase: number;
        title_override: string | null;
        scheduled_date: string;
        estimated_minutes: number;
        sequence: number;
      }>;
      state.tasks.push(...inserted.map((task) => ({
        id: String(state.nextId++),
        topic_id: task.topic_id,
        phase: (['learn', 'practice', 'recall'][task.phase] ?? 'learn') as MemoryTask['phase'],
        title_override: task.title_override,
        scheduled_date: task.scheduled_date,
        estimated_minutes: task.estimated_minutes,
        sequence: task.sequence,
        manually_edited_at: null,
      })));
      return { rows: [] };
    }
    if (sql.includes('UPDATE study_plans SET unscheduled_minutes')) {
      state.unscheduledMinutes = Number(params[1]);
      return { rows: [] };
    }
    if (sql.includes('DELETE FROM study_plan_capacity_overrides')) {
      state.capacityOverrides = [];
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO study_plan_capacity_overrides')) {
      const entries = JSON.parse(String(params[1])) as Array<{ study_date: string; minutes: number }>;
      for (const entry of entries) {
        const existing = state.capacityOverrides.find((value) => value.date === entry.study_date);
        if (existing) existing.minutes = entry.minutes;
        else state.capacityOverrides.push({ date: entry.study_date, minutes: entry.minutes });
      }
      state.capacityOverrides.sort((a, b) => a.date.localeCompare(b.date));
      return { rows: [] };
    }
    if (sql.includes('INSERT INTO study_plan_recovery_revisions')) {
      state.revision = {
        id: 'revision-1',
        before_tasks: JSON.parse(String(params[1])),
        before_capacity_overrides: JSON.parse(String(params[3])),
        before_unscheduled_minutes: Number(params[5]),
        after_state_hash: String(params[8]),
        applied_at: new Date().toISOString(),
        undone: false,
      };
      return { rows: [{ id: 'revision-1' }] };
    }
    if (sql.includes('FROM study_plan_recovery_revisions')) {
      if (!state.revision || state.revision.undone) return { rows: [] };
      return { rows: [{
        id: state.revision.id,
        before_tasks: state.revision.before_tasks,
        before_capacity_overrides: state.revision.before_capacity_overrides,
        before_unscheduled_minutes: state.revision.before_unscheduled_minutes,
        after_state_hash: state.revision.after_state_hash,
        applied_at: state.revision.applied_at,
      }] };
    }
    if (sql.includes('UPDATE study_plan_recovery_revisions SET undone_at')) {
      if (state.revision) state.revision.undone = true;
      return { rows: [] };
    }
    return { rows: [] };
  };
  return { client: { query }, state, today };
}

describe('study plan recovery service', () => {
  it('keeps previews side-effect free and scopes them to the owning user', async () => {
    const memory = recoveryClient();
    const before = structuredClone(memory.state.tasks);
    const preview = await previewStudyPlanRecovery(memory.client as never, 'owner-1', '1');

    expect(preview.needsRecovery).toBe(true);
    expect(preview.stateToken).toMatch(/^[a-f0-9]{64}$/);
    expect(memory.state.tasks).toEqual(before);
    await expect(previewStudyPlanRecovery(memory.client as never, 'attacker', '1')).rejects.toMatchObject({ status: 404 });
  });

  it('rejects stale previews, persists recovery, and safely restores the latest revision', async () => {
    const staleMemory = recoveryClient();
    const stalePreview = await previewStudyPlanRecovery(staleMemory.client as never, 'owner-1', '1');
    staleMemory.state.tasks[0].estimated_minutes = 45;
    await expect(confirmStudyPlanRecovery(staleMemory.client as never, 'owner-1', '1', {
      stateToken: stalePreview.stateToken,
      omittedGroupIds: [],
    })).rejects.toMatchObject({ status: 409 });

    const memory = recoveryClient();
    const beforeDate = memory.state.tasks[0].scheduled_date;
    const preview = await previewStudyPlanRecovery(memory.client as never, 'owner-1', '1');
    const applied = await confirmStudyPlanRecovery(memory.client as never, 'owner-1', '1', {
      stateToken: preview.stateToken,
      omittedGroupIds: [],
    });
    expect(applied.revisionId).toBe('revision-1');
    expect(memory.state.tasks.find((task) => task.id === '2')?.scheduled_date).toBe(addDays(memory.today, 1));
    expect(memory.state.tasks.find((task) => !task.manually_edited_at)?.scheduled_date).not.toBe(beforeDate);

    const status = await loadStudyPlanRecoveryStatus(memory.client as never, 'owner-1', '1');
    expect(status.latestRevision).toMatchObject({ id: 'revision-1', undoAvailable: true });
    await expect(undoStudyPlanRecovery(memory.client as never, 'owner-1', '1')).resolves.toMatchObject({ undone: true });
    expect(memory.state.tasks.find((task) => !task.manually_edited_at)?.scheduled_date).toBe(beforeDate);
  });

  it('persists added daily capacity and restores it during undo', async () => {
    const memory = recoveryClient();
    memory.state.tasks[0].estimated_minutes = 240;
    const preview = await previewStudyPlanRecovery(memory.client as never, 'owner-1', '1', [], 60);

    expect(preview.capacityChanges.length).toBeGreaterThan(0);
    expect(preview.shortfallMinutes).toBe(0);
    await confirmStudyPlanRecovery(memory.client as never, 'owner-1', '1', {
      stateToken: preview.stateToken,
      omittedGroupIds: [],
      additionalMinutesPerDay: 60,
    });
    expect(memory.state.capacityOverrides.length).toBeGreaterThan(0);

    await undoStudyPlanRecovery(memory.client as never, 'owner-1', '1');
    expect(memory.state.capacityOverrides).toEqual([]);
  });
});
