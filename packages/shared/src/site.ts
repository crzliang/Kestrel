import { z } from 'zod';

export const SiteSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i, 'id 仅允许字母数字下划线与连字符'),
  name: z.string().min(1).max(120),
  domain: z.string().max(253).default(''),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

export const CreateSiteSchema = z.object({
  id: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_-]+$/i)
    .optional(),
  name: z.string().min(1).max(120),
  domain: z.string().max(253).optional().default(''),
});

export const UpdateSiteSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  domain: z.string().max(253).optional(),
});

export type Site = z.infer<typeof SiteSchema>;
export type CreateSiteInput = z.infer<typeof CreateSiteSchema>;
export type UpdateSiteInput = z.infer<typeof UpdateSiteSchema>;
