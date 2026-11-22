import type { Express, Request, Response } from 'express';
import nodemailer from 'nodemailer';

function getSmtpConfig() {
  const host = process.env.SMTP_HOST || (process.env.SMTP_USER?.endsWith('@gmail.com') ? 'smtp.gmail.com' : '');
  const port = Number(process.env.SMTP_PORT || 587);
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user;

  const missingVars: string[] = [];
  if (!host) missingVars.push('SMTP_HOST');
  if (!user) missingVars.push('SMTP_USER');
  if (!pass) missingVars.push('SMTP_PASS');

  return { host, port, user, pass, from, missingVars, configured: missingVars.length === 0 };
}

export function registerReconciliationMailerRoutes(app: Express) {
  app.get('/api/reconciliation/email-status', (req: Request, res: Response) => {
    const cfg = getSmtpConfig();
    res.json({
      configured: cfg.configured,
      missingVars: cfg.missingVars,
      host: cfg.host || null,
      from: cfg.from || null,
    });
  });

  app.post('/api/reconciliation/send-monthly-report', async (req: Request, res: Response) => {
    try {
      const { to, subject, html, text, monthKey } = req.body || {};
      if (!to || !subject || (!html && !text)) {
        return res.status(400).json({ sent: false, error: 'Recipient (to), subject, and body are required.' });
      }

      const cfg = getSmtpConfig();
      if (!cfg.configured) {
        return res.status(200).json({
          sent: false,
          needsConfiguration: true,
          missingVars: cfg.missingVars,
          error: `Email service requires SMTP configuration in .env: ${cfg.missingVars.join(', ')}`,
        });
      }

      const transporter = nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465,
        auth: {
          user: cfg.user,
          pass: cfg.pass,
        },
      });

      const info = await transporter.sendMail({
        from: cfg.from,
        to,
        subject,
        text: text || '',
        html: html || undefined,
      });

      console.log(`[Reconciliation Mailer] Sent monthly report (${monthKey || 'custom'}) to ${to} | messageId=${info.messageId}`);
      return res.json({
        sent: true,
        messageId: info.messageId,
      });
    } catch (err: any) {
      console.error('[Reconciliation Mailer] Failed to send report:', err);
      return res.status(500).json({
        sent: false,
        error: err.message || 'SMTP send failed',
      });
    }
  });
}

