import { z } from 'zod';

export const AccountRoleSchema = z.enum(['admin', 'viewer']);

export const AccountSchema = z.object({
  id: z.string().min(2).max(64),
  username: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_.-]+$/i, '用户名仅允许字母数字与 ._ -'),
  displayName: z.string().min(1).max(120),
  role: AccountRoleSchema,
  totpEnabled: z.boolean().default(false),
  createdAt: z.number().int().positive(),
  updatedAt: z.number().int().positive(),
});

/** Server-side record; never return secrets to clients. */
export const AccountRecordSchema = AccountSchema.extend({
  passwordHash: z.string().min(16),
  totpSecret: z.string().optional(),
  totpPendingSecret: z.string().optional(),
});

export const CreateAccountSchema = z.object({
  username: z
    .string()
    .min(2)
    .max(64)
    .regex(/^[a-z0-9_.-]+$/i),
  displayName: z.string().min(1).max(120),
  password: z.string().min(6).max(128),
  role: AccountRoleSchema.default('viewer'),
});

export const UpdateAccountSchema = z.object({
  displayName: z.string().min(1).max(120).optional(),
  role: AccountRoleSchema.optional(),
  password: z.string().min(6).max(128).optional(),
});

export const LoginSchema = z.object({
  username: z.string().min(1).max(64).optional(),
  password: z.string().min(1).max(128).optional(),
  /** Second-step challenge from password login when 2FA is on */
  challengeToken: z.string().min(8).max(128).optional(),
  totpCode: z.string().regex(/^\d{6}$/).optional(),
});

export const TotpConfirmSchema = z.object({
  code: z.string().regex(/^\d{6}$/),
});

export const TotpDisableSchema = z.object({
  password: z.string().min(1).max(128),
  code: z.string().regex(/^\d{6}$/),
});

export type AccountRole = z.infer<typeof AccountRoleSchema>;
export type Account = z.infer<typeof AccountSchema>;
export type AccountRecord = z.infer<typeof AccountRecordSchema>;
export type CreateAccountInput = z.infer<typeof CreateAccountSchema>;
export type UpdateAccountInput = z.infer<typeof UpdateAccountSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type TotpConfirmInput = z.infer<typeof TotpConfirmSchema>;
export type TotpDisableInput = z.infer<typeof TotpDisableSchema>;
