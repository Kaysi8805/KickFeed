import { readFileSync } from 'node:fs';

import { FAN_PICKS_NOT_GAMBLING } from '@/lib/honesty';
import { demoModeEnabled, shouldDropDemoSession } from '@/lib/demoMode';
import { LEGAL_UPDATED, PRIVACY_DOCUMENT, PRIVACY_POLICY_URL, SUPPORT_EMAIL, SUPPORT_URL, TERMS_DOCUMENT, TERMS_URL } from '@/lib/legal';
import { appChannelFromEnv, isStoreFacingChannel } from '@/lib/storeChannel';
import { demoLoginHint, emailAuthHint, matchAlertsIntro, profileAccountNote } from '@/lib/storeCopy';
import { deviceAlertsCopy } from '@/lib/favoritePush';
import { describe, expect, it } from 'vitest';

describe('demo mode flag', () => {
  it('is on unless production explicitly turns it off', () => {
    expect(demoModeEnabled({})).toBe(true);
    expect(demoModeEnabled({ EXPO_PUBLIC_DEMO_MODE: '1' })).toBe(true);
    expect(demoModeEnabled({ EXPO_PUBLIC_DEMO_MODE: '0' })).toBe(false);
    expect(shouldDropDemoSession('demo', false)).toBe(true);
    expect(shouldDropDemoSession('supabase', false)).toBe(false);
    expect(shouldDropDemoSession('demo', true)).toBe(false);
  });
});

describe('store channel', () => {
  it('treats preview and production as store-facing and leaves local expo start alone', () => {
    expect(appChannelFromEnv({})).toBe('local');
    expect(appChannelFromEnv({ EXPO_PUBLIC_APP_CHANNEL: 'preview' })).toBe('preview');
    expect(isStoreFacingChannel('production')).toBe(true);
    expect(isStoreFacingChannel('preview')).toBe(true);
    expect(isStoreFacingChannel('development')).toBe(false);
    expect(isStoreFacingChannel('local')).toBe(false);
  });
});

describe('store-facing copy', () => {
  it('hides env-var setup notes on preview and production', () => {
    const note = profileAccountNote({ authMode: 'demo', supabaseConfigured: false, storeFacing: true });
    expect(note).not.toMatch(/EXPO_PUBLIC_/);
    expect(note).toMatch(/demo profile/i);
    expect(demoLoginHint({ supabaseConfigured: false, storeFacing: true })).not.toMatch(/EXPO_PUBLIC_/);
    expect(emailAuthHint(true)).toMatch(/not a betting or gambling product/i);
    expect(emailAuthHint(true)).not.toMatch(/next batch/i);
    expect(emailAuthHint(true, false)).toMatch(/Demo profiles are turned off/);
    expect(emailAuthHint(true, false)).not.toMatch(/stay on this device/);
    expect(matchAlertsIntro(true)).not.toMatch(/Expo Go/);
    expect(matchAlertsIntro(false)).toMatch(/Expo Go/);
  });

  it('keeps developer hints for local builds', () => {
    expect(demoLoginHint({ supabaseConfigured: false, storeFacing: false })).toMatch(/EXPO_PUBLIC_SUPABASE_URL/);
    expect(profileAccountNote({ authMode: 'supabase', supabaseConfigured: true, storeFacing: false })).toMatch(/Postgres/);
  });

  it('does not mention EAS or project ids in store alert copy', () => {
    const copy = deviceAlertsCopy({
      optedIn: false,
      projectId: undefined,
      permission: 'undetermined',
      token: null,
      platform: 'native',
      audience: 'store',
    });
    expect(copy).not.toMatch(/EAS|projectId|EXPO_PUBLIC_|README|Expo Go/i);
    expect(copy).toMatch(/in-app notification center/i);
  });
});

describe('legal surfaces', () => {
  it('ships privacy and terms that match the not-gambling sentence', () => {
    const privacyBetting = PRIVACY_DOCUMENT.sections.find((section) => section.heading === 'Predictions are not betting');
    const termsBetting = TERMS_DOCUMENT.sections.find((section) => section.heading === 'Not gambling');
    expect(privacyBetting?.body).toBe(FAN_PICKS_NOT_GAMBLING);
    expect(termsBetting?.body).toBe(FAN_PICKS_NOT_GAMBLING);
    expect(PRIVACY_DOCUMENT.sections.map((section) => section.body).join(' ')).toMatch(/photo library/i);
    expect(PRIVACY_DOCUMENT.sections.map((section) => section.body).join(' ')).toMatch(/no public moderation inbox/i);
    expect(PRIVACY_DOCUMENT.sections.map((section) => section.body).join(' ')).not.toMatch(/Sign in with Apple or Sign in with Google, and those buttons are shown/i);
    expect(LEGAL_UPDATED).toBe('23 September 2026');
    expect(PRIVACY_POLICY_URL).toBe('https://kaysi8805.github.io/KickFeed/privacy.html');
    expect(TERMS_URL).toBe('https://kaysi8805.github.io/KickFeed/terms.html');
  });

  it('publishes the same paragraphs on the landing pages', () => {
    const privacyHtml = readFileSync(new URL('../../landing/privacy.html', import.meta.url), 'utf8');
    const termsHtml = readFileSync(new URL('../../landing/terms.html', import.meta.url), 'utf8');
    for (const section of PRIVACY_DOCUMENT.sections) {
      expect(privacyHtml).toContain(section.heading);
      expect(privacyHtml).toContain(section.body);
    }
    for (const section of TERMS_DOCUMENT.sections) {
      expect(termsHtml).toContain(section.heading);
      expect(termsHtml).toContain(section.body);
    }
  });
});

describe('store app config', () => {
  it('uses KickFeed metadata, a first-build version, and a photo purpose string', () => {
    const app = JSON.parse(readFileSync(new URL('../../app.json', import.meta.url), 'utf8')) as {
      expo: {
        name: string;
        version: string;
        icon: string;
        ios: { bundleIdentifier: string; buildNumber: string; icon?: string; infoPlist: Record<string, unknown> };
        android: { package: string; versionCode: number; blockedPermissions: string[] };
        plugins: unknown[];
        runtimeVersion: string;
        extra: { privacyPolicyUrl: string; termsUrl: string };
      };
    };
    expect(app.expo.name).toBe('KickFeed');
    expect(app.expo.version).toBe('1.0.0');
    expect(app.expo.icon).toBe('./assets/images/icon.png');
    expect(app.expo.ios.icon).toBeUndefined();
    expect(app.expo.ios.bundleIdentifier).toBe('com.kickfeed.app');
    expect(app.expo.ios.buildNumber).toBe('1');
    expect(app.expo.android.package).toBe('com.kickfeed.app');
    expect(app.expo.android.versionCode).toBe(1);
    expect(app.expo.ios.infoPlist.ITSAppUsesNonExemptEncryption).toBe(false);
    expect(app.expo.ios.infoPlist.NSPhotoLibraryUsageDescription).toMatch(/photo library/i);
    expect(app.expo.android.blockedPermissions).toContain('android.permission.CAMERA');
    expect(JSON.stringify(app.expo.plugins)).toMatch(/KickFeed uses your photo library/);
    expect(app.expo.extra.privacyPolicyUrl).toBe(PRIVACY_POLICY_URL);
    expect(app.expo.extra.termsUrl).toBe(TERMS_URL);
    expect(app.expo.runtimeVersion).toBe(app.expo.version);
    expect(SUPPORT_URL).toBe('https://kaysi8805.github.io/KickFeed/support.html');
    expect(SUPPORT_EMAIL).toBe('karolurban1@gmail.com');

    const icon = readFileSync(new URL('../../assets/images/icon.png', import.meta.url));
    const splash = readFileSync(new URL('../../assets/images/splash-icon.png', import.meta.url));
    const expoLogo = readFileSync(new URL('../../assets/images/expo-logo.png', import.meta.url));
    expect(splash.equals(expoLogo)).toBe(false);
    expect(icon.equals(expoLogo)).toBe(false);
    expect(icon[0]).toBe(0x89);
    expect(splash.length).toBeGreaterThan(8000);
  });
});

describe('production EAS profile', () => {
  it('uses the prod BFF and prod Supabase anon key, with demo mode off', () => {
    const eas = JSON.parse(readFileSync(new URL('../../eas.json', import.meta.url), 'utf8')) as {
      build: {
        production: { env: Record<string, string> };
        preview: { env: Record<string, string> };
        development: { env: Record<string, string> };
      };
    };
    const prod = eas.build.production.env;
    expect(prod.EXPO_PUBLIC_DEMO_MODE).toBe('0');
    expect(prod.EXPO_PUBLIC_FOOTBALL_BFF_URL).toBe('https://kickfeed-football-bff.kaysi8805.workers.dev');
    expect(prod.EXPO_PUBLIC_SUPABASE_URL).toBe('https://wxgzmwzcxohvqywzdyam.supabase.co');
    expect(prod.EXPO_PUBLIC_FOOTBALL_API_KEY).toBeUndefined();
    expect(JSON.stringify(prod)).not.toMatch(/127\.0\.0\.1|service_role|FOOTBALL_API_KEY/);
    const payload = JSON.parse(Buffer.from(prod.EXPO_PUBLIC_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString()) as {
      role: string;
    };
    expect(payload.role).toBe('anon');
    expect(eas.build.preview.env.EXPO_PUBLIC_DEMO_MODE).toBe('1');
    expect(eas.build.development.env.EXPO_PUBLIC_FOOTBALL_BFF_URL).toBe('http://127.0.0.1:8787');
    expect(eas.build.development.env.EXPO_PUBLIC_SUPABASE_URL).toBeUndefined();
    const support = readFileSync(new URL('../../landing/support.html', import.meta.url), 'utf8');
    expect(support).toContain(SUPPORT_EMAIL);
    expect(support).toContain('mailto:karolurban1@gmail.com');
  });
});
