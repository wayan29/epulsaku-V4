export const UI_THEME_NAMES = [
  "ember",
  "horizon",
  "neo-brutal",
  "midnight",
  "forest",
  "royal-plum",
  "graphite",
] as const;

export type UiThemeName = (typeof UI_THEME_NAMES)[number];

export const DEFAULT_UI_THEME: UiThemeName = "ember";

export function isUiThemeName(value: string | null | undefined): value is UiThemeName {
  return !!value && UI_THEME_NAMES.includes(value as UiThemeName);
}
