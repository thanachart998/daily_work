import { Router } from 'express';
import { z } from 'zod';
import { categoryInputSchema } from '../../shared/schemas.js';
import { AppError } from '../errors.js';
import * as categories from '../services/categoryService.js';

export const categoriesRouter = Router();

function getId(raw: string): number {
  const r = z.coerce.number().int().positive().safeParse(raw);
  if (!r.success) throw new AppError(400, 'รหัสหมวดหมู่ไม่ถูกต้อง');
  return r.data;
}

categoriesRouter.get('/', (_req, res) => {
  res.json(categories.listCategories());
});

categoriesRouter.post('/', (req, res) => {
  const { name } = categoryInputSchema.parse(req.body);
  res.status(201).json(categories.createCategory(name));
});

categoriesRouter.put('/:id', (req, res) => {
  const { name } = categoryInputSchema.parse(req.body);
  res.json(categories.renameCategory(getId(req.params.id), name));
});

categoriesRouter.delete('/:id', (req, res) => {
  res.json(categories.deleteCategory(getId(req.params.id)));
});
