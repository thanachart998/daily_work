import { Router, type Request } from 'express';
import { z } from 'zod';
import {
  milestoneInputSchema,
  monthString,
  PROJECT_STATUSES,
  projectDeleteActionSchema,
  projectInputSchema,
  projectUpdateInputSchema,
  statusUpdateSchema,
} from '../../shared/schemas.js';
import { AppError } from '../errors.js';
import * as projects from '../services/projectService.js';

export const projectsRouter = Router();

const idParam = z.coerce.number().int().positive();

function getId(req: Request, paramName = 'id', label = 'รหัสโปรเจกต์'): number {
  const r = idParam.safeParse(req.params[paramName]);
  if (!r.success) throw new AppError(400, `${label}ไม่ถูกต้อง`);
  return r.data;
}

projectsRouter.get('/', (req, res) => {
  const rawStatus = req.query.status;
  const status = rawStatus ? z.enum(PROJECT_STATUSES).parse(rawStatus) : undefined;
  res.json(projects.listProjects(status));
});

projectsRouter.get('/:id', (req, res) => {
  res.json(projects.getProjectDetail(getId(req)));
});

projectsRouter.post('/', (req, res) => {
  const input = projectInputSchema.parse(req.body);
  res.status(201).json(projects.createProject(input));
});

projectsRouter.put('/:id', (req, res) => {
  const id = getId(req);
  const input = projectInputSchema.parse(req.body);
  res.json(projects.updateProject(id, input));
});

projectsRouter.delete('/:id', (req, res) => {
  const id = getId(req);
  const taskAction = projectDeleteActionSchema.parse(req.query.taskAction ?? req.body?.taskAction ?? 'unlink');
  res.json(projects.deleteProject(id, taskAction));
});

projectsRouter.post('/:id/clone', (req, res) => {
  const id = getId(req);
  const name = typeof req.body?.name === 'string' ? req.body.name : undefined;
  const startDate = typeof req.body?.start_date === 'string' ? req.body.start_date : undefined;
  res.status(201).json(projects.cloneProjectAsTemplate(id, name, startDate));
});

/** เส้นทางสำหรับ Milestone */
projectsRouter.get('/:id/milestones', (req, res) => {
  res.json(projects.listProjectMilestones(getId(req)));
});

projectsRouter.post('/:id/milestones', (req, res) => {
  const projectId = getId(req);
  const input = milestoneInputSchema.parse(req.body);
  res.status(201).json(projects.createMilestone(projectId, input));
});

projectsRouter.put('/milestones/:milestoneId', (req, res) => {
  const milestoneId = getId(req, 'milestoneId', 'รหัส Milestone');
  const input = milestoneInputSchema.parse(req.body);
  res.json(projects.updateMilestone(milestoneId, input));
});

projectsRouter.patch('/milestones/:milestoneId/status', (req, res) => {
  const milestoneId = getId(req, 'milestoneId', 'รหัส Milestone');
  const { status } = statusUpdateSchema.parse(req.body);
  res.json(projects.setMilestoneStatus(milestoneId, status));
});

projectsRouter.delete('/milestones/:milestoneId', (req, res) => {
  const milestoneId = getId(req, 'milestoneId', 'รหัส Milestone');
  projects.deleteMilestone(milestoneId);
  res.status(204).end();
});

/** เส้นทางสำหรับบันทึกความคืบหน้ารายเดือน (เฟส 2) */
projectsRouter.get('/:id/updates', (req, res) => {
  res.json(projects.listProjectUpdates(getId(req)));
});

projectsRouter.put('/:id/updates', (req, res) => {
  const projectId = getId(req);
  const input = projectUpdateInputSchema.parse(req.body);
  res.json(projects.upsertProjectUpdate(projectId, input));
});

projectsRouter.delete('/:id/updates/:period', (req, res) => {
  const projectId = getId(req);
  const period = monthString.parse(req.params.period);
  projects.deleteProjectUpdate(projectId, period);
  res.status(204).end();
});

