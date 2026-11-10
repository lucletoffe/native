import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';

// undust fork: a suffixed build (-undustN) has no in-app updater at all. The
// chain: app.config.js derives `disableUpdateCheck` from the suffix, the
// capability `supportsSideloadUpdates` turns off, and every updater door is
// behind it. The store side (banner, launch-time check) is covered in
// stores/__tests__/updates-store-fork-build.test.ts; no React Native renderer
// in the test env, so the Settings doors are checked as wiring.

const root = path.resolve(__dirname, '../../..');
const read = (rel: string) => fs.readFileSync(path.join(root, rel), 'utf8');

function disableUpdateCheck(env: Record<string, string>): unknown {
  const out = execFileSync(
    process.execPath,
    ['-e', "process.stdout.write(JSON.stringify(require('./app.config.js').expo.extra.disableUpdateCheck))"],
    {
      cwd: root,
      env: {
        ...process.env,
        GITHUB_SHA: '0000000',
        BULWARK_VERSION_SUFFIX: '',
        BULWARK_ALLOW_UPSTREAM_UPDATES: '',
        ...env,
      },
    },
  );
  return JSON.parse(out.toString());
}

async function capabilities(extra: Record<string, unknown>) {
  vi.resetModules();
  vi.doMock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
  vi.doMock('expo-constants', () => ({ default: { expoConfig: { extra } } }));
  return import('../platform-capabilities');
}

afterEach(() => {
  vi.doUnmock('react-native');
  vi.doUnmock('expo-constants');
});

describe('app.config.js on a fork build', () => {
  it('disables the update check when the build has a suffix', () => {
    expect(disableUpdateCheck({ BULWARK_VERSION_SUFFIX: '-undust2' })).toBe(true);
  });

  it('keeps it on without a suffix', () => {
    expect(disableUpdateCheck({})).toBe(false);
  });

  it('keeps it on for a suffixed build that opts back in', () => {
    expect(disableUpdateCheck({ BULWARK_VERSION_SUFFIX: '-undust2', BULWARK_ALLOW_UPSTREAM_UPDATES: '1' })).toBe(false);
  });
});

describe('supportsSideloadUpdates on a fork build', () => {
  it('is off when the build disables the update check', async () => {
    expect((await capabilities({ disableUpdateCheck: true })).supportsSideloadUpdates).toBe(false);
  });

  it('stays on for the GitHub build that does not', async () => {
    expect((await capabilities({ disableUpdateCheck: false })).supportsSideloadUpdates).toBe(true);
  });
});

describe('updater doors behind supportsSideloadUpdates', () => {
  it('leaves the Updates pane out of Settings', () => {
    expect(read('src/screens/SettingsScreen.tsx'))
      .toMatch(/TABS\.filter\(\s+\(t\) => [^\n]*\(t\.id !== 'updates' \|\| supportsSideloadUpdates\)/);
  });

  it('leaves the Updates row out of About', () => {
    expect(read('src/components/settings/AboutSettings.tsx'))
      .toMatch(/\{supportsSideloadUpdates && \(\s+<SettingItem label=\{t\('settings\.about\.updates'/);
  });
});
