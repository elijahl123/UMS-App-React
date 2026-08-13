import { Router } from 'express';
import { recordProductEvent } from './launch';

export const telemetryRouter = Router();

telemetryRouter.post('/events', async (req, res) => {
  try {
    const accepted = await recordProductEvent(req.body ?? {}, req.auth!.uid);
    return accepted ? res.status(204).end() : res.status(400).json({ error: { message: 'INVALID_EVENT' } });
  } catch (err) {
    console.error('[telemetry] unable to record product event', err);
    return res.status(500).json({ error: { message: 'EVENT_RECORD_FAILED' } });
  }
});
