import { z } from 'zod';

export const SystemSettingsSchema = z.object({
  title: z.string().min(1).max(80).default('Kestrel'),
  subtitle: z.string().max(80).default('Analytics'),
  /** Image URL or data URL for the console logo */
  logoUrl: z.string().max(500_000).default(''),
  updatedAt: z.number().int().positive().optional(),
});

export const UpdateSystemSettingsSchema = z.object({
  title: z.string().min(1).max(80).optional(),
  subtitle: z.string().max(80).optional(),
  logoUrl: z.string().max(500_000).optional(),
});

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: z.string().min(6).max(128),
});

export type SystemSettings = z.infer<typeof SystemSettingsSchema>;
export type UpdateSystemSettingsInput = z.infer<typeof UpdateSystemSettingsSchema>;
export type ChangePasswordInput = z.infer<typeof ChangePasswordSchema>;

export const DEFAULT_SYSTEM_SETTINGS: SystemSettings = {
  title: 'Kestrel',
  subtitle: 'Analytics',
  logoUrl: '',
};
