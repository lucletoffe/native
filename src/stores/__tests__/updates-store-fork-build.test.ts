import { afterEach, describe, expect, it, vi } from 'vitest';

// undust fork: a suffixed build (-undustN, app.config.js `disableUpdateCheck`)
// must not be offered the upstream APK, which has none of the fork's patches
// and is signed with another key.

const fetchLatestRelease = vi.fn(async () => ({
  tag: '0.1.99',
  name: '0.1.99',
  htmlUrl: '',
  publishedAt: '',
  body: '',
  apkAsset: { name: 'a.apk', browser_download_url: 'https://example.invalid/a.apk', size: 1 },
  sha256Asset: null,
  apkSha256: null,
  severity: 'normal' as const,
  advisoryUrl: null,
}));

async function load(extra: Record<string, unknown>) {
  vi.resetModules();
  fetchLatestRelease.mockClear();
  vi.doMock('react-native', () => ({ Platform: { OS: 'android' }, NativeModules: {} }));
  vi.doMock('@react-native-async-storage/async-storage', () => ({
    default: { getItem: vi.fn(async () => null), setItem: vi.fn(async () => undefined) },
  }));
  vi.doMock('expo-constants', () => ({ default: { expoConfig: { version: '0.1.92-undust1', extra } } }));
  vi.doMock('../../api/updates', () => ({
    fetchLatestRelease,
    resolveApkSha256: vi.fn(async () => null),
    UpdateRateLimitedError: class extends Error {},
  }));
  vi.doMock('../../lib/install-update', () => ({ downloadAndInstallApk: vi.fn(async () => undefined) }));
  return (await import('../updates-store')).useUpdatesStore;
}

afterEach(() => {
  vi.doUnmock('react-native');
  vi.doUnmock('@react-native-async-storage/async-storage');
  vi.doUnmock('expo-constants');
  vi.doUnmock('../../api/updates');
  vi.doUnmock('../../lib/install-update');
});

describe('updates store on a fork build', () => {
  it('asks GitHub for nothing and offers nothing when the build disables the check', async () => {
    const store = await load({ disableUpdateCheck: true });
    await store.getState().checkNow({ force: true });
    expect(fetchLatestRelease).not.toHaveBeenCalled();
    // Even a release cached by an earlier build is not offered.
    store.setState({ cachedLatest: await fetchLatestRelease() });
    expect(store.getState().hasUpdate()).toBe(false);
    expect(store.getState().isMandatory()).toBe(false);
  });

  it('still offers a newer upstream release on a build that does not disable the check', async () => {
    const store = await load({ disableUpdateCheck: false });
    await store.getState().checkNow({ force: true });
    expect(fetchLatestRelease).toHaveBeenCalledTimes(1);
    expect(store.getState().hasUpdate()).toBe(true);
  });
});
