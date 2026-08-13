import { Router } from 'express';
import { getAccessStatus, reconcileUcdEntitlement } from '../access';
import { pool } from '../db';
import { sanitizeLaunchAttribution } from './launch';

export const accessRouter = Router();

accessRouter.get('/status', async (req, res) => {
  try {
    return res.json(await getAccessStatus(req.auth!.uid));
  } catch (err) {
    console.error('[access] status failed', err);
    return res.status(500).json({ error: { message: 'ACCESS_STATUS_FAILED' } });
  }
});

accessRouter.post('/reconcile', async (req, res) => {
  try {
    const userId = req.auth!.uid;
    const result = await reconcileUcdEntitlement(userId);
    const attribution = sanitizeLaunchAttribution(req.body?.attribution ?? {});
    await pool.query(
      `
        INSERT INTO campaign_attributions (
          user_id,
          first_source, first_campaign, first_ambassador, first_society, first_referral, first_launch_session,
          last_source, last_campaign, last_ambassador, last_society, last_referral, last_launch_session
        )
        VALUES ($1, $2, $3, $4, $5, $6, $7, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (user_id) DO UPDATE SET
          last_source = EXCLUDED.last_source,
          last_campaign = EXCLUDED.last_campaign,
          last_ambassador = EXCLUDED.last_ambassador,
          last_society = EXCLUDED.last_society,
          last_referral = EXCLUDED.last_referral,
          last_launch_session = EXCLUDED.last_launch_session,
          last_seen_at = NOW(),
          updated_at = NOW();
      `,
      [
        userId,
        attribution.source ?? null,
        attribution.campaign ?? null,
        attribution.ambassador ?? null,
        attribution.society ?? null,
        attribution.referral ?? null,
        attribution.launchSession ?? null,
      ]
    );
    return res.json({ ...(await getAccessStatus(userId, false)), billingWarning: result.billingWarning });
  } catch (err) {
    console.error('[access] reconcile failed', err);
    return res.status(500).json({ error: { message: 'ACCESS_RECONCILE_FAILED' } });
  }
});

accessRouter.get('/onboarding', async (req, res) => {
  const result = await pool.query(
    `
      SELECT started_at::text, ucd_verified_at::text, first_course_at::text,
             dashboard_opened_at::text, completed_at::text
      FROM ucd_onboarding WHERE user_id = $1;
    `,
    [req.auth!.uid]
  );
  return res.json(result.rows[0] ?? null);
});

accessRouter.post('/onboarding/milestones', async (req, res) => {
  const milestone = req.body?.milestone;
  const columns: Record<string, string> = {
    course_created: 'first_course_at',
    dashboard_opened: 'dashboard_opened_at',
  };
  const column = columns[milestone];
  if (!column) return res.status(400).json({ error: { message: 'INVALID_MILESTONE' } });
  const before = await pool.query<{ completed_at: string | null }>(
    `SELECT completed_at::text FROM ucd_onboarding WHERE user_id = $1`,
    [req.auth!.uid]
  );
  await pool.query(
    `
      INSERT INTO ucd_onboarding (user_id, ${column})
      VALUES ($1, NOW())
      ON CONFLICT (user_id) DO UPDATE SET ${column} = COALESCE(ucd_onboarding.${column}, NOW()), updated_at = NOW();
    `,
    [req.auth!.uid]
  );
  await pool.query(
    `
      UPDATE ucd_onboarding
      SET completed_at = COALESCE(completed_at, NOW()), updated_at = NOW()
      WHERE user_id = $1 AND ucd_verified_at IS NOT NULL AND first_course_at IS NOT NULL AND dashboard_opened_at IS NOT NULL;
    `,
    [req.auth!.uid]
  );
  const after = await pool.query<{
    started_at: string;
    ucd_verified_at: string | null;
    first_course_at: string | null;
    dashboard_opened_at: string | null;
    completed_at: string | null;
  }>(
    `
      SELECT started_at::text, ucd_verified_at::text, first_course_at::text,
             dashboard_opened_at::text, completed_at::text
      FROM ucd_onboarding WHERE user_id = $1
    `,
    [req.auth!.uid]
  );
  const completedNow = !before.rows[0]?.completed_at && Boolean(after.rows[0]?.completed_at);
  if (completedNow) {
    await pool.query(
      `
        INSERT INTO product_events (user_id, event_name, occurred_at, properties)
        VALUES ($1, 'onboarding_completed', NOW(), '{}'::jsonb)
        ON CONFLICT DO NOTHING;
      `,
      [req.auth!.uid]
    );
  }
  return res.json({
    ok: true,
    onboarding: after.rows[0] ?? null,
    completedNow,
  });
});
