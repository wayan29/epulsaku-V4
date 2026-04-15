// src/lib/ui-theme-actions.ts
'use server';

import { DEFAULT_UI_THEME, isUiThemeName, type UiThemeName } from './ui-theme';
import { getCurrentUserThemePreference, setCurrentUserThemePreference } from './user-utils';

export async function getResolvedUiTheme(): Promise<UiThemeName> {
  const themePreference = await getCurrentUserThemePreference();
  return themePreference ?? DEFAULT_UI_THEME;
}

export async function setMyUiTheme(theme: string): Promise<{ success: boolean; message: string }> {
  if (!isUiThemeName(theme)) {
    return { success: false, message: 'Invalid theme selected.' };
  }

  return setCurrentUserThemePreference(theme);
}
