/**
 * EAS projectId is not a secret (it lands in the app config), but we never
 * commit Karol’s real id. Resolve from env first, then the native/EAS extras.
 */

const PLACEHOLDER = /^(your-project-id|x{8}-x{4}-x{4}-x{4}-x{12})$/i;

export function sanitizeEasProjectId(raw?: string | null): string | undefined {
  const id = raw?.trim();
  if (!id || PLACEHOLDER.test(id)) return undefined;
  return id;
}

export function easProjectIdFromEnv(
  env: Record<string, string | undefined> = process.env as Record<string, string | undefined>,
): string | undefined {
  return sanitizeEasProjectId(env.EXPO_PUBLIC_EAS_PROJECT_ID);
}

export type EasProjectIdSources = {
  env?: Record<string, string | undefined>;
  easConfigId?: string | null;
  extraId?: string | null;
};

/**
 * Prefer the gitignored env var so CI / demo clones stay empty, then
 * `Constants.easConfig.projectId` (EAS builds), then `extra.eas.projectId`
 * written by `eas init`.
 */
export function resolveEasProjectId(sources: EasProjectIdSources = {}): string | undefined {
  const env = sources.env ?? (process.env as Record<string, string | undefined>);
  return easProjectIdFromEnv(env) ?? sanitizeEasProjectId(sources.easConfigId) ?? sanitizeEasProjectId(sources.extraId);
}
