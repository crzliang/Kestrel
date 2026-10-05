import { z } from 'zod';
import { DomainListField } from './domain.js';

const SiteIdSchema = z
  .string()
  .trim()
  .min(2, 'id 至少 2 个字符')
  .max(64)
  .regex(/^[A-Za-z0-9_]+$/, 'id 仅允许字母、数字与下划线')
  .transform((value) => value.toLowerCase());

/** Counting needs only a site id and the hostname allowlist. */
export const SiteSchema = z.object({
  id: SiteIdSchema,
  domain: DomainListField,
});

export const SitesFileSchema = z
  .object({
    sites: z.array(SiteSchema).max(128),
  })
  .superRefine((file, ctx) => {
    const seen = new Set<string>();
    file.sites.forEach((site, index) => {
      if (seen.has(site.id)) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: `重复的站点 id：${site.id}`,
          path: ['sites', index, 'id'],
        });
      }
      seen.add(site.id);
    });
  });

export type Site = z.infer<typeof SiteSchema>;

/** Validate the static sites file. Hostnames are normalized; invalid entries throw. */
export function parseSitesConfig(input: unknown): Site[] {
  const parsed = SitesFileSchema.safeParse(input);
  if (!parsed.success) {
    const message = parsed.error.issues
      .map((issue) => {
        const path = issue.path.length ? issue.path.join('.') : 'sites';
        return `${path}: ${issue.message}`;
      })
      .join('；');
    throw new Error(`sites.json 无效：${message}`);
  }
  return parsed.data.sites.map((site) => ({
    id: site.id,
    domain: [...site.domain],
  }));
}
