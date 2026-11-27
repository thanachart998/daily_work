import { Router, type Request } from 'express';
import { z } from 'zod';
import { bulkDeleteSchema, DELETE_CONFIRM_PASSWORD, postponeSchema, statusUpdateSchema, taskFilterSchema, taskInputSchema } from '../../shared/schemas.js';
import { AppError } from '../errors.js';
import * as tasks from '../services/taskService.js';

export const tasksRouter = Router();

const idParam = z.coerce.number().int().positive();
function getId(req: Request): number {
  const r = idParam.safeParse(req.params.id);
  if (!r.success) throw new AppError(400, 'รหัสงานไม่ถูกต้อง');
  return r.data;
}

tasksRouter.get('/', (req, res) => {
  const filter = taskFilterSchema.parse(req.query);
  res.json(tasks.listTasks(filter));
});

tasksRouter.post('/postpone', (req, res) => {
  const { ids } = postponeSchema.parse(req.body);
  const result = tasks.postponeTasks(ids);
  res.json(result);
});

tasksRouter.post('/bulk-delete', (req, res) => {
  const { ids, password } = bulkDeleteSchema.parse(req.body);
  if (password !== DELETE_CONFIRM_PASSWORD) {
    throw new AppError(403, 'รหัสผ่านยืนยันการลบไม่ถูกต้อง', { password: 'รหัสผ่านไม่ถูกต้อง' });
  }
  const result = tasks.deleteTasksBulk(ids);
  res.json(result);
});

tasksRouter.get('/:id', (req, res) => {
  res.json(tasks.getTask(getId(req)));
});

tasksRouter.post('/', (req, res) => {
  const input = taskInputSchema.parse(req.body);
  res.status(201).json(tasks.createTask(input));
});

tasksRouter.put('/:id', (req, res) => {
  const id = getId(req);
  const input = taskInputSchema.parse(req.body);
  res.json(tasks.updateTask(id, input));
});

tasksRouter.patch('/:id/status', (req, res) => {
  const id = getId(req);
  const { status } = statusUpdateSchema.parse(req.body);
  res.json(tasks.setTaskStatus(id, status));
});

tasksRouter.delete('/:id', (req, res) => {
  tasks.deleteTask(getId(req));
  res.status(204).end();
});
