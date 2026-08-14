import { Router } from 'express';
import { pool } from '../db';

export const onboardingRouter = Router();

export const ONBOARDING_STEPS = [
  'welcome',
  'course',
  'coursework',
  'schedule',
  'services',
  'dashboard',
  'calendar',
  'homework',
  'class_schedule',
  'notes',
  'courses',
  'navigation',
  'account',
  'complete',
] as const;

export type OnboardingStep = typeof ONBOARDING_STEPS[number];
export type OnboardingStatus = 'active' | 'skipped' | 'completed';

type OnboardingRow = {
  version: number;
  status: OnboardingStatus;
  current_step: OnboardingStep;
  completed_steps: OnboardingStep[];
  deferred_steps: OnboardingStep[];
  checklist_dismissed_at: string | null;
  started_at: string;
  skipped_at: string | null;
  completed_at: string | null;
  updated_at: string;
};

function isStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

function uniqueSteps(value: unknown): OnboardingStep[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(isStep))];
}

export function resolveOnboardingUpdate(
  current: { status: OnboardingStatus; currentStep: OnboardingStep; completedSteps: OnboardingStep[]; deferredSteps: OnboardingStep[] },
  body: Record<string, unknown>
) {
  const action = body.action;
  const step = body.step;
  const requestedNextStep = body.nextStep;
  if (!['complete_step', 'defer_step', 'skip', 'complete', 'dismiss_checklist', 'resume'].includes(String(action))) {
    return { error: 'INVALID_ONBOARDING_ACTION' } as const;
  }
  if (action === 'complete_step' || action === 'defer_step') {
    const expectedNextStep = ONBOARDING_STEPS[ONBOARDING_STEPS.indexOf(current.currentStep) + 1];
    if (!isStep(step) || !isStep(requestedNextStep) || step !== current.currentStep || requestedNextStep !== expectedNextStep) {
      return { error: 'INVALID_ONBOARDING_STEP' } as const;
    }
  }

  const completed = new Set(current.completedSteps);
  const deferred = new Set(current.deferredSteps);
  let status = current.status;
  let currentStep = current.currentStep;
  let skipped = false;
  let finished = false;
  let dismissChecklist = false;

  if (action === 'complete_step') {
    completed.add(step as OnboardingStep);
    deferred.delete(step as OnboardingStep);
    currentStep = requestedNextStep as OnboardingStep;
    status = 'active';
  } else if (action === 'defer_step') {
    deferred.add(step as OnboardingStep);
    currentStep = requestedNextStep as OnboardingStep;
    status = 'active';
  } else if (action === 'skip') {
    status = 'skipped';
    skipped = true;
  } else if (action === 'complete') {
    if (current.currentStep !== 'complete') return { error: 'INVALID_ONBOARDING_STEP' } as const;
    completed.add('complete');
    status = 'completed';
    currentStep = 'complete';
    finished = true;
  } else if (action === 'dismiss_checklist') {
    dismissChecklist = true;
  } else if (action === 'resume') {
    status = 'active';
  }

  return {
    value: {
      status,
      currentStep,
      completedSteps: [...completed],
      deferredSteps: [...deferred],
      skipped,
      finished,
      dismissChecklist,
    },
  } as const;
}

async function inferredSteps(userId: string): Promise<OnboardingStep[]> {
  const result = await pool.query<{
    has_course: boolean;
    has_coursework: boolean;
    has_schedule: boolean;
    has_calendar: boolean;
    has_notifications: boolean;
  }>(
    `
      SELECT
        EXISTS (SELECT 1 FROM courses WHERE user_id = $1) AS has_course,
        EXISTS (
          SELECT 1 FROM assignments a JOIN courses c ON c.id = a.course_id
          WHERE c.user_id = $1
        ) AS has_coursework,
        EXISTS (
          SELECT 1 FROM class_sessions s JOIN courses c ON c.id = s.course_id
          WHERE c.user_id = $1
        ) AS has_schedule,
        EXISTS (
          SELECT 1 FROM google_calendar_connections
          WHERE user_id = $1 AND setup_completed = TRUE
        ) AS has_calendar,
        EXISTS (
          SELECT 1 FROM notification_preferences
          WHERE user_id = $1 AND enabled = TRUE
        ) AS has_notifications;
    `,
    [userId]
  );
  const facts = result.rows[0];
  const steps: OnboardingStep[] = [];
  if (facts?.has_course) steps.push('course');
  if (facts?.has_coursework) steps.push('coursework');
  if (facts?.has_schedule) steps.push('schedule');
  if (facts?.has_calendar || facts?.has_notifications) steps.push('services');
  return steps;
}

function serialize(row: OnboardingRow, inferredCompletedSteps: OnboardingStep[]) {
  return {
    version: row.version,
    status: row.status,
    currentStep: row.current_step,
    completedSteps: uniqueSteps(row.completed_steps),
    deferredSteps: uniqueSteps(row.deferred_steps),
    inferredCompletedSteps,
    checklistDismissedAt: row.checklist_dismissed_at,
    startedAt: row.started_at,
    skippedAt: row.skipped_at,
    completedAt: row.completed_at,
    updatedAt: row.updated_at,
  };
}

async function readOnboarding(userId: string) {
  const result = await pool.query<OnboardingRow>(
    `
      SELECT version, status, current_step, completed_steps, deferred_steps,
             checklist_dismissed_at::text, started_at::text, skipped_at::text,
             completed_at::text, updated_at::text
      FROM product_onboarding
      WHERE user_id = $1;
    `,
    [userId]
  );
  if (!result.rows[0]) return null;
  return serialize(result.rows[0], await inferredSteps(userId));
}

onboardingRouter.get('/', async (req, res) => {
  try {
    return res.json(await readOnboarding(req.auth!.uid));
  } catch (err) {
    console.error('[onboarding] read failed', err);
    return res.status(500).json({ error: { message: 'ONBOARDING_READ_FAILED' } });
  }
});

onboardingRouter.post('/initialize', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    await pool.query(
      `
        INSERT INTO product_onboarding (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO NOTHING;
      `,
      [userId]
    );
    await pool.query(
      `
        INSERT INTO product_events (user_id, event_name, occurred_at, properties)
        VALUES ($1, 'onboarding_started', NOW(), '{"version":1}'::jsonb)
        ON CONFLICT DO NOTHING;
      `,
      [userId]
    );
    return res.status(201).json(await readOnboarding(userId));
  } catch (err) {
    console.error('[onboarding] initialize failed', err);
    return res.status(500).json({ error: { message: 'ONBOARDING_INITIALIZE_FAILED' } });
  }
});

onboardingRouter.put('/', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    const current = await readOnboarding(userId);
    if (!current) return res.status(404).json({ error: { message: 'ONBOARDING_NOT_FOUND' } });

    const transition = resolveOnboardingUpdate(current, req.body ?? {});
    if ('error' in transition) return res.status(400).json({ error: { message: transition.error } });
    const { status, currentStep, completedSteps, deferredSteps, skipped, finished, dismissChecklist } = transition.value;

    await pool.query(
      `
        UPDATE product_onboarding
        SET status = $2,
            current_step = $3,
            completed_steps = $4::jsonb,
            deferred_steps = $5::jsonb,
            skipped_at = CASE WHEN $6 THEN COALESCE(skipped_at, NOW()) ELSE skipped_at END,
            completed_at = CASE WHEN $7 THEN COALESCE(completed_at, NOW()) ELSE completed_at END,
            checklist_dismissed_at = CASE WHEN $8 THEN COALESCE(checklist_dismissed_at, NOW()) ELSE checklist_dismissed_at END,
            updated_at = NOW()
        WHERE user_id = $1;
      `,
      [userId, status, currentStep, JSON.stringify(completedSteps), JSON.stringify(deferredSteps), skipped, finished, dismissChecklist]
    );
    return res.json(await readOnboarding(userId));
  } catch (err) {
    console.error('[onboarding] update failed', err);
    return res.status(500).json({ error: { message: 'ONBOARDING_UPDATE_FAILED' } });
  }
});

onboardingRouter.post('/restart', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    await pool.query(
      `
        INSERT INTO product_onboarding (user_id)
        VALUES ($1)
        ON CONFLICT (user_id) DO UPDATE SET
          status = 'active', current_step = 'welcome', completed_steps = '[]'::jsonb,
          deferred_steps = '[]'::jsonb, checklist_dismissed_at = NULL,
          skipped_at = NULL, completed_at = NULL, started_at = NOW(), updated_at = NOW();
      `,
      [userId]
    );
    return res.json(await readOnboarding(userId));
  } catch (err) {
    console.error('[onboarding] restart failed', err);
    return res.status(500).json({ error: { message: 'ONBOARDING_RESTART_FAILED' } });
  }
});
