/**
 * Read deploy-time configuration from EdgeOne `env`, Pages context.env, or Node process.env.
 */
export function readEnvValue(
  name: string,
  sources?: Array<Record<string, unknown> | undefined | null>,
): string {
  for (const source of sources ?? []) {
    if (!source) continue;
    const raw = source[name];
    if (typeof raw === 'string' && raw.length > 0) return raw;
    if (typeof raw === 'number' || typeof raw === 'boolean') return String(raw);
  }

  const g = globalThis as {
    env?: Record<string, unknown>;
    process?: { env?: Record<string, string | undefined> };
  };

  const fromGlobal = g.env?.[name];
  if (typeof fromGlobal === 'string' && fromGlobal.length > 0) return fromGlobal;

  const fromProcess = g.process?.env?.[name];
  if (typeof fromProcess === 'string' && fromProcess.length > 0) {
    return fromProcess;
  }

  return '';
}

export type DefaultAdminConfig = {
  username: string;
  password: string;
};

/** Bootstrap admin credentials. Password should be set via KESTREL_ADMIN_PASSWORD in production. */
export function getDefaultAdminConfig(
  env?: Record<string, unknown> | null,
): DefaultAdminConfig {
  const sources = [env];
  return {
    username: (
      readEnvValue('KESTREL_ADMIN_USERNAME', sources) || 'admin'
    )
      .trim()
      .toLowerCase(),
    password: readEnvValue('KESTREL_ADMIN_PASSWORD', sources) || 'admin123',
  };
}
