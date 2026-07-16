import {
  DEFAULT_SYSTEM_SETTINGS,
  type SystemSettings,
  type UpdateSystemSettingsInput,
} from '@kestrel/shared';
import { kvGetJson, kvPutJson } from './storage';

const SETTINGS_KEY = 'system_settings';

export async function getSystemSettings(): Promise<SystemSettings> {
  const stored = await kvGetJson<SystemSettings>(SETTINGS_KEY);
  if (!stored) return { ...DEFAULT_SYSTEM_SETTINGS };
  return {
    title: stored.title?.trim() || DEFAULT_SYSTEM_SETTINGS.title,
    subtitle:
      stored.subtitle?.trim() || DEFAULT_SYSTEM_SETTINGS.subtitle,
    logoUrl: stored.logoUrl?.trim() || '',
    updatedAt: stored.updatedAt,
  };
}

export async function updateSystemSettings(
  patch: UpdateSystemSettingsInput,
): Promise<SystemSettings> {
  const current = await getSystemSettings();
  const next: SystemSettings = {
    title:
      patch.title !== undefined
        ? patch.title.trim() || DEFAULT_SYSTEM_SETTINGS.title
        : current.title,
    subtitle:
      patch.subtitle !== undefined
        ? patch.subtitle.trim()
        : current.subtitle,
    logoUrl:
      patch.logoUrl !== undefined ? patch.logoUrl.trim() : current.logoUrl,
    updatedAt: Date.now(),
  };
  await kvPutJson(SETTINGS_KEY, next);
  return next;
}
