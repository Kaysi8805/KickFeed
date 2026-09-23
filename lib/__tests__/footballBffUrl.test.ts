import { readFileSync } from 'node:fs';

import {
  LOCAL_FOOTBALL_BFF_URL,
  PROD_FOOTBALL_BFF_URL_PLACEHOLDER,
  RELEASE_FOOTBALL_BFF_URL,
} from '@/lib/footballBffUrl';
import { describe, expect, it } from 'vitest';

describe('football BFF URL config', () => {
  it('points EAS release profiles at the live worker and development at loopback', () => {
    const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8')) as {
      build: {
        development: { environment: string; env: { EXPO_PUBLIC_APP_CHANNEL: string; EXPO_PUBLIC_FOOTBALL_BFF_URL: string } };
        preview: { environment: string; env: { EXPO_PUBLIC_APP_CHANNEL: string; EXPO_PUBLIC_FOOTBALL_BFF_URL: string } };
        production: { environment: string; env: { EXPO_PUBLIC_APP_CHANNEL: string; EXPO_PUBLIC_FOOTBALL_BFF_URL: string } };
      };
    };
    expect(eas.build.development.environment).toBe('development');
    expect(eas.build.development.env.EXPO_PUBLIC_APP_CHANNEL).toBe('development');
    expect(eas.build.development.env.EXPO_PUBLIC_FOOTBALL_BFF_URL).toBe(LOCAL_FOOTBALL_BFF_URL);
    expect(eas.build.preview.environment).toBe('preview');
    expect(eas.build.preview.env.EXPO_PUBLIC_APP_CHANNEL).toBe('preview');
    expect(eas.build.preview.env.EXPO_PUBLIC_FOOTBALL_BFF_URL).toBe(RELEASE_FOOTBALL_BFF_URL);
    expect(eas.build.production.environment).toBe('production');
    expect(eas.build.production.env.EXPO_PUBLIC_APP_CHANNEL).toBe('production');
    expect(eas.build.production.env.EXPO_PUBLIC_FOOTBALL_BFF_URL).toBe(RELEASE_FOOTBALL_BFF_URL);
    expect(eas.build.production.env.EXPO_PUBLIC_FOOTBALL_BFF_URL).not.toContain('<account>');
  });

  it('documents the local default and the placeholder in .env.example', () => {
    const example = readFileSync(new URL('../../.env.example', import.meta.url), 'utf8');
    expect(example).toContain(`EXPO_PUBLIC_FOOTBALL_BFF_URL=${LOCAL_FOOTBALL_BFF_URL}`);
    expect(example).toContain(RELEASE_FOOTBALL_BFF_URL);
    expect(example).toContain(PROD_FOOTBALL_BFF_URL_PLACEHOLDER);
    expect(example).not.toMatch(/^FOOTBALL_API_KEY=\S/m);
  });
});
