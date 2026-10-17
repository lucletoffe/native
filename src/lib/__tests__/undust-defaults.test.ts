import { describe, it, expect, beforeEach } from 'vitest';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { takeUndustCrossViewDefaults } from '../undust-defaults';
import { useSettingsStore } from '../../stores/settings-store';

describe('takeUndustCrossViewDefaults', () => {
  beforeEach(async () => {
    await AsyncStorage.clear();
  });

  it('turns All mail / All unread on once and unfolds the unified section', async () => {
    expect(await takeUndustCrossViewDefaults()).toEqual({
      enableCrossAllView: true, enableCrossUnreadView: true,
    });
    expect(await AsyncStorage.getItem('sidebar:unifiedExpanded')).toBe('true');
    expect(await takeUndustCrossViewDefaults()).toBeNull();
  });

  it('lets a later choice in the settings stand', async () => {
    await AsyncStorage.setItem('webmail:settings:v1', JSON.stringify({ enableCrossAllView: false }));
    useSettingsStore.setState({ hydrated: false });
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().enableCrossAllView).toBe(true);
    expect(JSON.parse((await AsyncStorage.getItem('webmail:settings:v1'))!).enableCrossAllView).toBe(true);

    await AsyncStorage.setItem('webmail:settings:v1', JSON.stringify({ enableCrossAllView: false }));
    useSettingsStore.setState({ hydrated: false });
    await useSettingsStore.getState().hydrate();
    expect(useSettingsStore.getState().enableCrossAllView).toBe(false);
  });
});
