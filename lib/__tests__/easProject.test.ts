import { easProjectIdFromEnv, resolveEasProjectId, sanitizeEasProjectId } from '@/lib/easProject';
import { describe, expect, it } from 'vitest';

describe('EAS projectId', () => {
  it('reads EXPO_PUBLIC_EAS_PROJECT_ID and ignores blanks / placeholders', () => {
    expect(easProjectIdFromEnv({ EXPO_PUBLIC_EAS_PROJECT_ID: '  abc-123  ' })).toBe('abc-123');
    expect(easProjectIdFromEnv({ EXPO_PUBLIC_EAS_PROJECT_ID: '' })).toBeUndefined();
    expect(easProjectIdFromEnv({ EXPO_PUBLIC_EAS_PROJECT_ID: 'your-project-id' })).toBeUndefined();
    expect(sanitizeEasProjectId('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')).toBeUndefined();
  });

  it('prefers env over easConfig over extra.eas', () => {
    expect(
      resolveEasProjectId({
        env: { EXPO_PUBLIC_EAS_PROJECT_ID: 'from-env' },
        easConfigId: 'from-eas',
        extraId: 'from-extra',
      }),
    ).toBe('from-env');
    expect(resolveEasProjectId({ easConfigId: 'from-eas', extraId: 'from-extra' })).toBe('from-eas');
    expect(resolveEasProjectId({ extraId: 'from-extra' })).toBe('from-extra');
    expect(resolveEasProjectId({})).toBeUndefined();
  });
});
