import express, { type ErrorRequestHandler } from 'express';
import fs from 'node:fs';
import path from 'node:path';
import { ZodError } from 'zod';
import { config } from './config.js';
import { AppError, zodDetails } from './errors.js';
import { categoriesRouter } from './routes/categories.js';
import { miscRouter } from './routes/misc.js';
import { projectsRouter } from './routes/projects.js';
import { tasksRouter } from './routes/tasks.js';

/** สร้าง Express app (แยกจากการ listen เพื่อให้ทดสอบได้) */
export function createApp() {
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '20mb' }));

  app.use('/api/tasks', tasksRouter);
  app.use('/api/projects', projectsRouter);
  app.use('/api/categories', categoriesRouter);
  app.use('/api', miscRouter);

  app.use('/api', (_req, res) => {
    res.status(404).json({ error: 'ไม่พบ API ที่เรียก' });
  });

  // เสิร์ฟหน้าเว็บที่ build แล้ว (SPA)
  if (fs.existsSync(path.join(config.distDir, 'index.html'))) {
    app.use(express.static(config.distDir, { index: false, maxAge: '1h' }));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(config.distDir, 'index.html'));
    });
  } else {
    app.get('/', (_req, res) => {
      res
        .status(200)
        .type('html')
        .send('<meta charset="utf-8"><p>ยังไม่ได้ build หน้าเว็บ — รัน <code>npm run build</code> หรือใช้ <code>npm run dev</code></p>');
    });
  }

  const errorHandler: ErrorRequestHandler = (err, _req, res, _next) => {
    if (err instanceof ZodError) {
      res.status(400).json({ error: 'ข้อมูลไม่ถูกต้อง กรุณาตรวจสอบอีกครั้ง', details: zodDetails(err) });
      return;
    }
    if (err instanceof AppError) {
      res.status(err.status).json({ error: err.message, details: err.details });
      return;
    }
    if (err?.type === 'entity.parse.failed') {
      res.status(400).json({ error: 'รูปแบบข้อมูล JSON ไม่ถูกต้อง' });
      return;
    }
    if (err?.type === 'entity.too.large') {
      res.status(413).json({ error: 'ไฟล์หรือข้อมูลมีขนาดใหญ่เกินไป' });
      return;
    }
    console.error(err);
    res.status(500).json({ error: 'เกิดข้อผิดพลาดภายในระบบ กรุณาลองใหม่อีกครั้ง' });
  };
  app.use(errorHandler);

  return app;
}
