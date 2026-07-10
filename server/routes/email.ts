import { Router, type Request, type Response } from 'express';
import sgMail from '@sendgrid/mail';
import { config } from '../config';

if (config.sendgridApiKey) {
  sgMail.setApiKey(config.sendgridApiKey);
}

export const emailRouter = Router();

emailRouter.post('/send', async (req: Request, res: Response) => {
  if (!config.sendgridApiKey) {
    return res.status(500).json({ error: { message: 'SENDGRID_API_KEY is required' } });
  }

  try {
    await sgMail.send(req.body);
    return res.json({ success: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'SENDGRID_SEND_FAILED';
    return res.status(500).json({ error: { message } });
  }
});
