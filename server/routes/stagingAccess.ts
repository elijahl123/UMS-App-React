import { Router, type Response } from 'express';
import { requireStagingAdmin } from '../auth';
import { pool } from '../db';
import { ApiError, required } from '../errors';

export const stagingAccessRouter = Router();

function normalizeEmail(email: unknown): string {
  const value = String(email ?? '').trim().toLowerCase();
  if (!value || !value.includes('@')) {
    throw new ApiError('A valid email is required.', 400);
  }
  return value;
}

function normalizeRole(role: unknown) {
  if (role === 'admin' || role === 'viewer') {
    return role;
  }
  throw new ApiError('role must be admin or viewer', 400);
}

function normalizeStatus(status: unknown) {
  if (status === 'active' || status === 'disabled' || status === 'pending') {
    return status;
  }
  throw new ApiError('status must be active, disabled, or pending', 400);
}

function errorResponse(res: Response, err: unknown) {
  const message = err instanceof Error ? err.message : 'SERVER_ERROR';
  const status = err instanceof ApiError ? err.status : 500;
  return res.status(status).json({ error: { message } });
}

stagingAccessRouter.get('/me', (req, res) => {
  res.json({
    enabled: true,
    user: req.auth ?? null,
  });
});

stagingAccessRouter.get('/users', requireStagingAdmin, async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT id, email, firebase_uid, role, status, invited_by, created_at, updated_at, last_seen_at
      FROM staging_access_grants
      ORDER BY role, email;
    `);
    return res.json(result.rows);
  } catch (err) {
    return errorResponse(res, err);
  }
});

stagingAccessRouter.post('/users', requireStagingAdmin, async (req, res) => {
  try {
    const email = normalizeEmail(required(req.body, 'email'));
    const role = normalizeRole(req.body.role ?? 'viewer');
    const status = normalizeStatus(req.body.status ?? 'active');
    const invitedBy = req.auth?.email ?? null;

    const result = await pool.query(
      `
        INSERT INTO staging_access_grants (email, role, status, invited_by)
        VALUES ($1, $2, $3, $4)
        ON CONFLICT (email) DO UPDATE
        SET role = EXCLUDED.role,
            status = EXCLUDED.status,
            invited_by = EXCLUDED.invited_by,
            updated_at = NOW()
        RETURNING id, email, firebase_uid, role, status, invited_by, created_at, updated_at, last_seen_at;
      `,
      [email, role, status, invitedBy]
    );

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    return errorResponse(res, err);
  }
});

stagingAccessRouter.patch('/users/:id', requireStagingAdmin, async (req, res) => {
  try {
    const role = req.body.role === undefined ? null : normalizeRole(req.body.role);
    const status = req.body.status === undefined ? null : normalizeStatus(req.body.status);

    if (!role && !status) {
      throw new ApiError('role or status is required', 400);
    }

    const result = await pool.query(
      `
        UPDATE staging_access_grants
        SET role = COALESCE($1, role),
            status = COALESCE($2, status),
            updated_at = NOW()
        WHERE id = $3::bigint
        RETURNING id, email, firebase_uid, role, status, invited_by, created_at, updated_at, last_seen_at;
      `,
      [role, status, req.params.id]
    );

    if (!result.rows[0]) {
      throw new ApiError('User grant not found.', 404);
    }

    return res.json(result.rows[0]);
  } catch (err) {
    return errorResponse(res, err);
  }
});

stagingAccessRouter.delete('/users/:id', requireStagingAdmin, async (req, res) => {
  try {
    const result = await pool.query(
      `
        DELETE FROM staging_access_grants
        WHERE id = $1::bigint
        RETURNING id;
      `,
      [req.params.id]
    );

    if (!result.rows[0]) {
      throw new ApiError('User grant not found.', 404);
    }

    return res.json({ success: true });
  } catch (err) {
    return errorResponse(res, err);
  }
});
