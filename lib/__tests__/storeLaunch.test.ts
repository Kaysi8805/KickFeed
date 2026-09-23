import { readFileSync } from 'node:fs';

import { FAN_PICKS_NOT_GAMBLING } from '@/lib/honesty';
import { LEGAL_UPDATED, PRIVACY_DOCUMENT, PRIVACY_POLICY_URL, TERMS_DOCUMENT, TERMS_URL } from '@/lib/legal';
import { appChannelFromEnv, isStoreFacingChannel } from '@/lib/storeChannel';
import { demoLoginHint, emailAuthHint, matchAlertsIntro, profileAccountNote } from '@/lib/storeCopy';
import { deviceAlertsCopy } from '@/lib/favoritePush';
import { describe, expect, it } from 'vitest';

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
    expect(PRIVACY_POLICY_URL).toBe('https://kickfeed.polsia.app/privacy.html');
    expect(TERMS_URL).toBe('https://kickfeed.polsia.app/terms.html');
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

    const icon = readFileSync(new URL('../../assets/images/icon.png', import.meta.url));
    const splash = readFileSync(new URL('../../assets/images/splash-icon.png', import.meta.url));
    const expoLogo = readFileSync(new URL('../../assets/images/expo-logo.png', import.meta.url));
    expect(splash.equals(expoLogo)).toBe(false);
    expect(icon.equals(expoLogo)).toBe(false);
    expect(icon[0]).toBe(0x89);
    expect(splash.length).toBeGreaterThan(8000);
  });
});
