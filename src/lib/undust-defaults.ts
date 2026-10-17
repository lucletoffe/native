import AsyncStorage from '@react-native-async-storage/async-storage';

// undust fork only: a single account (luc@undust.co) never sees the unified
// section, and the cross-folder views are opt-in, so the views Luc asked for
// stayed hidden behind a toggle. Turn All mail / All unread on once, unfold
// the drawer's unified section once, then leave the choice to the settings.

const MARKER_KEY = 'undust:cross-views-on:v1';
const UNIFIED_EXPANDED_KEY = 'sidebar:unifiedExpanded';

export interface CrossViewDefaults {
  enableCrossAllView: boolean;
  enableCrossUnreadView: boolean;
}

/** Returns the overrides to apply on this launch, or null once already applied. */
export async function takeUndustCrossViewDefaults(): Promise<CrossViewDefaults | null> {
  try {
    if (await AsyncStorage.getItem(MARKER_KEY)) return null;
    await AsyncStorage.multiSet([
      [MARKER_KEY, new Date().toISOString()],
      [UNIFIED_EXPANDED_KEY, 'true'],
    ]);
    return { enableCrossAllView: true, enableCrossUnreadView: true };
  } catch (err) {
    console.warn('[undust-defaults] skipped', err);
    return null;
  }
}
