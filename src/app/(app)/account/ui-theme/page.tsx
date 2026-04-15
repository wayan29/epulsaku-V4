// src/app/(app)/account/ui-theme/page.tsx
"use client";

import { useEffect, useMemo, useState } from "react";

import { useUiTheme, UI_THEMES, type UiThemeInfo } from "@/contexts/UiThemeContext";
import type { UiThemeName } from "@/lib/ui-theme";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ArrowUpDown,
  CheckCircle2,
  Copy,
  Palette,
  RotateCcw,
  Search,
  Sparkles,
  Monitor,
  Moon,
  Sun,
  BadgeCheck,
  BriefcaseBusiness,
  LayoutDashboard,
  SlidersHorizontal,
  Star,
  WandSparkles,
} from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type ThemeFilter = "all" | "recommended" | "light" | "dark";
type ThemeSort = "recommended" | "az";
type PreviewMode = "both" | "light" | "dark";
type HeroMode = "default" | "presentation";

const THEME_FILTERS: Array<{
  value: ThemeFilter;
  label: string;
  helper: string;
  icon: typeof SlidersHorizontal;
}> = [
  { value: "all", label: "All", helper: "Semua preset", icon: SlidersHorizontal },
  { value: "recommended", label: "Recommended", helper: "Preset unggulan", icon: Star },
  { value: "light", label: "Light", helper: "Tema terang", icon: Sun },
  { value: "dark", label: "Dark", helper: "Tema gelap", icon: Moon },
];

const THEME_SORTS: Array<{
  value: ThemeSort;
  label: string;
  helper: string;
}> = [
  { value: "recommended", label: "Recommended first", helper: "Unggulan di atas" },
  { value: "az", label: "A-Z", helper: "Urut alfabet" },
];

const PREVIEW_MODES: Array<{
  value: PreviewMode;
  label: string;
  helper: string;
}> = [
  { value: "both", label: "Both", helper: "Light + Dark" },
  { value: "light", label: "Light only", helper: "Preview terang" },
  { value: "dark", label: "Dark only", helper: "Preview gelap" },
];

function getThemeTraits(theme: UiThemeInfo): string[] {
  const tokens = [theme.tagline, theme.style, theme.description, theme.recommendedFor, theme.surface, theme.accent]
    .join(" ")
    .toLowerCase();

  const traits = new Set<string>();

  if (tokens.includes("premium") || tokens.includes("luxury") || tokens.includes("eksklusif") || tokens.includes("mewah")) {
    traits.add("premium");
  }
  if (tokens.includes("modern") || tokens.includes("clean") || tokens.includes("calm") || tokens.includes("minimal")) {
    traits.add("calm");
  }
  if (tokens.includes("bold") || tokens.includes("tegas") || tokens.includes("brutal") || tokens.includes("standout")) {
    traits.add("bold");
  }
  if (tokens.includes("operasional") || tokens.includes("backoffice") || tokens.includes("admin") || tokens.includes("dashboard")) {
    traits.add("operational");
  }
  if (tokens.includes("trust") || tokens.includes("trusted") || tokens.includes("aman") || tokens.includes("fintech")) {
    traits.add("trusted");
  }

  return Array.from(traits);
}

function ThemeScene({
  theme,
  mode,
}: {
  theme: UiThemeInfo;
  mode: "light" | "dark";
}) {
  const palette = mode === "dark" ? theme.darkPreview || theme.preview : theme.preview;

  return (
    <div
      className="overflow-hidden rounded-2xl border shadow-sm transition-all duration-300 ease-out group-hover:scale-[1.01] group-hover:shadow-lg"
      style={{
        backgroundColor: palette.card,
        borderColor: `${palette.muted}30`,
      }}
    >
      <div
        className="flex items-center justify-between px-4 py-3"
        style={{
          background: `linear-gradient(135deg, ${palette.accent}, ${palette.accent}CC)`,
        }}
      >
        <div className="flex items-center gap-2 text-white">
          <div className="h-8 w-8 rounded-xl bg-white/15" />
          <div>
            <div className="text-xs font-semibold uppercase tracking-[0.16em] text-white/80">
              {mode === "dark" ? "Dark preview" : "Light preview"}
            </div>
            <div className="text-sm font-bold">{theme.label}</div>
          </div>
        </div>
        {mode === "dark" ? <Moon className="h-4 w-4 text-white/90" /> : <Sun className="h-4 w-4 text-white/90" />}
      </div>

      <div className="space-y-3 p-4" style={{ backgroundColor: palette.bg }}>
        <div className="grid grid-cols-3 gap-2">
          {[0.95, 0.75, 0.55].map((opacity, index) => (
            <div
              key={index}
              className="rounded-xl border p-2"
              style={{
                borderColor: `${palette.muted}22`,
                backgroundColor: palette.card,
              }}
            >
              <div className="mb-1.5 h-1.5 w-2/3 rounded-full" style={{ backgroundColor: `${palette.muted}45` }} />
              <div className="h-3 rounded-md" style={{ backgroundColor: palette.accent, opacity }} />
            </div>
          ))}
        </div>

        <div
          className="rounded-2xl border p-3"
          style={{
            borderColor: `${palette.muted}22`,
            backgroundColor: palette.card,
          }}
        >
          <div className="mb-3 flex items-center justify-between gap-3">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.16em]" style={{ color: palette.muted }}>
                Controls
              </div>
              <div className="text-sm font-semibold" style={{ color: palette.text }}>
                Form & action preview
              </div>
            </div>
            <div
              className="rounded-full px-2.5 py-1 text-[10px] font-semibold"
              style={{
                backgroundColor: `${palette.accent}18`,
                color: palette.accent,
              }}
            >
              Primary
            </div>
          </div>

          <div className="space-y-2.5">
            <div
              className="rounded-xl border px-3 py-2.5 text-xs"
              style={{
                borderColor: `${palette.muted}28`,
                color: palette.muted,
                backgroundColor: palette.bg,
              }}
            >
              Search transaction, member, or invoice...
            </div>
            <div className="flex gap-2">
              <div
                className="flex-1 rounded-xl px-3 py-2.5 text-center text-xs font-semibold text-white"
                style={{ backgroundColor: palette.accent }}
              >
                Save Changes
              </div>
              <div
                className="rounded-xl border px-3 py-2.5 text-xs font-medium"
                style={{
                  borderColor: `${palette.muted}28`,
                  color: palette.text,
                  backgroundColor: palette.card,
                }}
              >
                Preview
              </div>
            </div>
            <div
              className="flex items-center gap-2 rounded-xl border px-3 py-2"
              style={{
                borderColor: `${palette.accent}26`,
                backgroundColor: `${palette.accent}12`,
                color: palette.text,
              }}
            >
              <BadgeCheck className="h-3.5 w-3.5" style={{ color: palette.accent }} />
              <span className="text-[11px] font-medium">Alert, badge, dan action state tetap konsisten.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function UiThemePage() {
  const { uiTheme, setUiTheme, themeInfo } = useUiTheme();
  const { toast } = useToast();
  const [activeFilter, setActiveFilter] = useState<ThemeFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [activeSort, setActiveSort] = useState<ThemeSort>("recommended");
  const [previewMode, setPreviewMode] = useState<PreviewMode>("both");
  const [compareThemeName, setCompareThemeName] = useState<UiThemeName>("horizon");
  const [heroMode, setHeroMode] = useState<HeroMode>("default");
  const [screenshotMode, setScreenshotMode] = useState(false);

  const hasActiveControls =
    activeFilter !== "all" ||
    activeSort !== "recommended" ||
    previewMode !== "both" ||
    heroMode !== "default" ||
    screenshotMode ||
    searchQuery.trim().length > 0;

  const previewModesToRender = useMemo(() => {
    switch (previewMode) {
      case "light":
        return ["light"] as const;
      case "dark":
        return ["dark"] as const;
      case "both":
      default:
        return ["light", "dark"] as const;
    }
  }, [previewMode]);

  const compareTheme = useMemo(() => {
    return UI_THEMES.find((theme) => theme.name === compareThemeName) || UI_THEMES[0];
  }, [compareThemeName]);

  const activeThemeTraits = useMemo(() => getThemeTraits(themeInfo), [themeInfo]);

  useEffect(() => {
    try {
      const savedPreviewMode = window.localStorage.getItem("ui-theme-preview-mode") as PreviewMode | null;
      const savedCompareTheme = window.localStorage.getItem("ui-theme-compare-name") as UiThemeName | null;
      const savedHeroMode = window.localStorage.getItem("ui-theme-hero-mode") as HeroMode | null;
      const savedScreenshotMode = window.localStorage.getItem("ui-theme-screenshot-mode");

      if (savedPreviewMode && PREVIEW_MODES.some((mode) => mode.value === savedPreviewMode)) {
        setPreviewMode(savedPreviewMode);
      }
      if (savedCompareTheme && UI_THEMES.some((theme) => theme.name === savedCompareTheme)) {
        setCompareThemeName(savedCompareTheme);
      }
      if (savedHeroMode === "default" || savedHeroMode === "presentation") {
        setHeroMode(savedHeroMode);
      }
      if (savedScreenshotMode === "true" || savedScreenshotMode === "false") {
        setScreenshotMode(savedScreenshotMode === "true");
      }
    } catch {
      // Ignore localStorage access errors.
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem("ui-theme-preview-mode", previewMode);
      window.localStorage.setItem("ui-theme-compare-name", compareThemeName);
      window.localStorage.setItem("ui-theme-hero-mode", heroMode);
      window.localStorage.setItem("ui-theme-screenshot-mode", String(screenshotMode));
    } catch {
      // Ignore localStorage access errors.
    }
  }, [compareThemeName, heroMode, previewMode, screenshotMode]);

  const filteredThemes = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();

    const nextThemes = UI_THEMES.filter((theme) => {
      const matchesFilter = (() => {
        switch (activeFilter) {
          case "recommended":
            return Boolean(theme.featured);
          case "light":
            return theme.category === "Light";
          case "dark":
            return theme.category === "Dark";
          case "all":
          default:
            return true;
        }
      })();

      if (!matchesFilter) return false;
      if (!normalizedQuery) return true;

      const haystack = [
        theme.label,
        theme.tagline,
        theme.category,
        theme.style,
        theme.recommendedFor,
        theme.description,
        theme.surface,
        theme.accent,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(normalizedQuery);
    });

    return [...nextThemes].sort((a, b) => {
      if (activeSort === "az") {
        return a.label.localeCompare(b.label);
      }

      if (a.featured !== b.featured) {
        return a.featured ? -1 : 1;
      }

      return a.label.localeCompare(b.label);
    });
  }, [activeFilter, activeSort, searchQuery]);

  const resetControls = () => {
    setActiveFilter("all");
    setSearchQuery("");
    setActiveSort("recommended");
    setPreviewMode("both");
    setScreenshotMode(false);
  };

  const handleCopyPaletteColor = async (label: string, color: string) => {
    try {
      await navigator.clipboard.writeText(color);
      toast({
        title: `${label} disalin`,
        description: `${color} telah disalin ke clipboard.`,
      });
    } catch {
      toast({
        title: "Gagal menyalin warna",
        description: "Clipboard tidak tersedia pada browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleExportTheme = async (theme: UiThemeInfo, format: "json" | "css") => {
    const payload =
      format === "json"
        ? JSON.stringify(
            {
              name: theme.name,
              label: theme.label,
              preview: theme.preview,
              darkPreview: theme.darkPreview || theme.preview,
            },
            null,
            2
          )
        : `:root[data-ui-theme="${theme.name}"] {\n  --ui-surface: ${theme.preview.bg};\n  --ui-card: ${theme.preview.card};\n  --ui-accent: ${theme.preview.accent};\n  --ui-text: ${theme.preview.text};\n  --ui-text-muted: ${theme.preview.muted};\n}`;

    try {
      await navigator.clipboard.writeText(payload);
      toast({
        title: `Export ${format.toUpperCase()} disalin`,
        description: `Palette ${theme.label} siap dipaste.`,
      });
    } catch {
      toast({
        title: "Gagal export palette",
        description: "Clipboard tidak tersedia pada browser ini.",
        variant: "destructive",
      });
    }
  };

  const handleSelectTheme = async (themeName: UiThemeName) => {
    try {
      await setUiTheme(themeName);
      const info = UI_THEMES.find((t) => t.name === themeName);
      toast({
        title: `Tema "${info?.label}" Diterapkan`,
        description: "Tema tampilan akun Anda berhasil diperbarui.",
      });
    } catch (error) {
      toast({
        title: "Gagal Mengubah Tema",
        description: error instanceof Error ? error.message : "Terjadi kesalahan sistem.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className={`space-y-6 sm:space-y-8 xl:space-y-9 ${screenshotMode ? "mx-auto max-w-[1600px]" : ""}`}>
      <div className="overflow-hidden rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-card)] shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
        <div
          className={`border-b px-4 py-4 transition-colors duration-300 sm:px-6 sm:py-6 xl:px-8 xl:py-8 ${screenshotMode ? "border-b-0" : ""}`}
          style={{
            borderColor: `${themeInfo.preview.muted}20`,
            background: `linear-gradient(135deg, ${themeInfo.preview.accent}18, ${themeInfo.preview.bg})`,
          }}
        >
          <div className="flex flex-col gap-5 xl:flex-row xl:items-start xl:justify-between xl:gap-8">
            <div className="flex items-start gap-3 sm:gap-4 xl:gap-5">
              <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg sm:h-12 sm:w-12 xl:h-14 xl:w-14 xl:rounded-[1.35rem]">
                <Palette className="h-5 w-5 sm:h-6 sm:w-6 xl:h-7 xl:w-7" />
              </div>
              <div>
                <h2 className="text-xl font-serif font-bold tracking-tight text-[var(--ui-text)] dark:text-zinc-100 sm:text-2xl xl:text-[2.35rem] xl:leading-tight">
                  Tema Tampilan UI
                </h2>
                <p className="mt-2 max-w-3xl text-sm leading-relaxed text-[var(--ui-text-muted)] dark:text-zinc-400 xl:text-base">
                  Pilih preset warna untuk tampilan akun Anda. Tema ini akan dipakai di dashboard, form, card, tombol utama, dan elemen UI penting lainnya.
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2 text-xs xl:max-w-md xl:justify-end">
              <button
                type="button"
                onClick={() => setScreenshotMode((current) => !current)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  screenshotMode ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                }`}
                style={{
                  borderColor: screenshotMode ? "var(--ui-accent)" : "var(--ui-border)",
                  backgroundColor: screenshotMode ? "var(--ui-accent-bg)" : "var(--ui-card)",
                  color: screenshotMode ? "var(--ui-accent)" : "var(--ui-text)",
                }}
              >
                <Star className="h-3.5 w-3.5" />
                {screenshotMode ? "Screenshot on" : "Screenshot mode"}
              </button>
              <Badge className="rounded-full bg-[var(--ui-accent-bg)] px-3 py-1 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg-hover)]">
                <LayoutDashboard className="mr-1 h-3.5 w-3.5" /> Side-by-side preview
              </Badge>
              <Badge variant="secondary" className="rounded-full px-3 py-1">
                <SlidersHorizontal className="mr-1 h-3.5 w-3.5" /> 7 preset pribadi
              </Badge>
            </div>
          </div>
        </div>

        <div className={`grid gap-4 p-4 transition-all duration-500 ease-out sm:gap-5 sm:p-6 xl:gap-8 xl:p-8 ${heroMode === "presentation" ? "xl:grid-cols-1" : "xl:grid-cols-[minmax(0,1.2fr)_minmax(360px,0.9fr)]"}`}>
          <div className="space-y-4 xl:space-y-5">
            <div className="flex flex-wrap items-center gap-2">
              <Badge className="rounded-full bg-[var(--ui-accent-bg)] px-3 py-1 text-[var(--ui-accent)] hover:bg-[var(--ui-accent-bg-hover)]">
                <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Active Theme
              </Badge>
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-[var(--ui-text-muted)]">
                {themeInfo.category}
              </Badge>
              {themeInfo.featured && (
                <Badge className="rounded-full bg-amber-500 px-3 py-1 text-white hover:bg-amber-500">
                  <Star className="mr-1 h-3.5 w-3.5" /> Recommended
                </Badge>
              )}
            </div>

            <div>
              <h3 className="text-3xl font-serif font-bold tracking-tight text-[var(--ui-text)] xl:text-[3.15rem] xl:leading-none">{themeInfo.label}</h3>
              <p className="mt-3 max-w-3xl text-sm leading-relaxed text-[var(--ui-text-muted)] dark:text-zinc-400 xl:text-[15px]">
                {themeInfo.description}
              </p>
            </div>

            <div className="rounded-2xl border px-4 py-4 xl:px-5 xl:py-5" style={{ borderColor: `${themeInfo.preview.muted}20` }}>
              <div className="mb-3 flex items-center gap-2">
                <BriefcaseBusiness className="h-4 w-4 text-[var(--ui-accent)]" />
                <div className="text-sm font-semibold text-[var(--ui-text)]">Best use case</div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: `${themeInfo.preview.muted}18` }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">Ideal product</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{themeInfo.recommendedFor}</div>
                </div>
                <div className="rounded-2xl border px-3 py-3" style={{ borderColor: `${themeInfo.preview.muted}18` }}>
                  <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">Visual direction</div>
                  <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{themeInfo.style}</div>
                </div>
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-3 xl:gap-4">
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${themeInfo.preview.muted}20` }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">Style</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{themeInfo.style}</div>
              </div>
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${themeInfo.preview.muted}20` }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">Best for</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{themeInfo.recommendedFor}</div>
              </div>
              <div className="rounded-2xl border px-4 py-3" style={{ borderColor: `${themeInfo.preview.muted}20` }}>
                <div className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">Accent</div>
                <div className="mt-1 text-sm font-semibold text-[var(--ui-text)]">{themeInfo.accent}</div>
              </div>
            </div>

            {activeThemeTraits.length > 0 && (
              <div className="flex flex-wrap gap-2">
                {activeThemeTraits.map((trait) => (
                  <Badge
                    key={trait}
                    className="rounded-full px-3 py-1 text-xs capitalize text-white"
                    style={{ backgroundColor: themeInfo.preview.accent }}
                  >
                    {trait}
                  </Badge>
                ))}
              </div>
            )}
          </div>

          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {PREVIEW_MODES.map((mode) => {
                const isSelected = previewMode === mode.value;

                return (
                  <button
                    key={mode.value}
                    type="button"
                    onClick={() => setPreviewMode(mode.value)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      isSelected ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                    }`}
                    style={{
                      borderColor: isSelected ? "var(--ui-accent)" : "var(--ui-border)",
                      backgroundColor: isSelected ? "var(--ui-accent-bg)" : "var(--ui-card)",
                      color: isSelected ? "var(--ui-accent)" : "var(--ui-text)",
                    }}
                    title={mode.helper}
                  >
                    {mode.label}
                  </button>
                );
              })}
              <button
                type="button"
                onClick={() => setHeroMode(heroMode === "default" ? "presentation" : "default")}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                  heroMode === "presentation" ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                }`}
                style={{
                  borderColor: heroMode === "presentation" ? "var(--ui-accent)" : "var(--ui-border)",
                  backgroundColor: heroMode === "presentation" ? "var(--ui-accent-bg)" : "var(--ui-card)",
                  color: heroMode === "presentation" ? "var(--ui-accent)" : "var(--ui-text)",
                }}
              >
                <LayoutDashboard className="h-3.5 w-3.5" />
                {heroMode === "presentation" ? "Presentation on" : "Presentation mode"}
              </button>
            </div>

            <div className={`grid gap-3 xl:gap-4 ${heroMode === "presentation" ? "grid-cols-1" : previewModesToRender.length === 2 ? "md:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-2" : "grid-cols-1"}`}>
              {previewModesToRender.map((mode) => (
                <ThemeScene key={mode} theme={themeInfo} mode={mode} />
              ))}
            </div>
          </div>
        </div>
      </div>

      <div className={`rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-card)] p-4 shadow-sm transition-all sm:p-5 xl:p-6 dark:border-zinc-800 dark:bg-zinc-950 ${screenshotMode ? "shadow-none" : ""}`}>
        <div className="mb-5 rounded-2xl border px-4 py-4 xl:mb-6 xl:px-5 xl:py-5" style={{ borderColor: `${themeInfo.preview.muted}18` }}>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">
                Quick Apply & Compare
              </h3>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Pilih tema pembanding dengan cepat atau terapkan tema unggulan tanpa scroll jauh.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              {UI_THEMES.filter((theme) => theme.featured).map((theme) => {
                const isActiveTheme = uiTheme === theme.name;

                return (
                  <button
                    key={theme.name}
                    type="button"
                    onClick={() => handleSelectTheme(theme.name)}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                      isActiveTheme ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                    }`}
                    style={{
                      borderColor: isActiveTheme ? theme.preview.accent : "var(--ui-border)",
                      backgroundColor: isActiveTheme ? `${theme.preview.accent}18` : "var(--ui-card)",
                      color: isActiveTheme ? theme.preview.accent : "var(--ui-text)",
                    }}
                  >
                    <WandSparkles className="h-3.5 w-3.5" />
                    {theme.label}
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between xl:gap-6">
          <div>
            <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">
              Compare Theme
            </h3>
            <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
              Bandingkan tema aktif dengan preset lain sebelum menerapkannya ke akun Anda.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {UI_THEMES.filter((theme) => theme.name !== uiTheme).map((theme) => {
              const isSelected = compareThemeName === theme.name;

              return (
                <button
                  key={theme.name}
                  type="button"
                  onClick={() => setCompareThemeName(theme.name)}
                  className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all duration-200 ${
                    isSelected ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                  }`}
                  style={{
                    borderColor: isSelected ? "var(--ui-accent)" : "var(--ui-border)",
                    backgroundColor: isSelected ? "var(--ui-accent-bg)" : "var(--ui-card)",
                    color: isSelected ? "var(--ui-accent)" : "var(--ui-text)",
                  }}
                >
                  {theme.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 grid gap-4 sm:gap-5 xl:mt-6 xl:gap-6 xl:grid-cols-2">
          {[themeInfo, compareTheme].map((theme, index) => {
            const isCurrent = index === 0;

            return (
              <div
                key={theme.name}
                className="rounded-3xl border p-5 xl:p-6"
                style={{
                  borderColor: `${theme.preview.muted}20`,
                  background: `linear-gradient(180deg, ${theme.preview.bg}, ${theme.preview.card})`,
                }}
              >
                <div className="mb-4 flex flex-wrap items-center gap-2">
                  <Badge className="rounded-full px-3 py-1 text-xs" style={{ backgroundColor: `${theme.preview.accent}18`, color: theme.preview.accent }}>
                    {isCurrent ? "Current active" : "Compare target"}
                  </Badge>
                  <Badge variant="outline" className="rounded-full border px-3 py-1 text-xs" style={{ borderColor: `${theme.preview.muted}25`, color: theme.preview.muted }}>
                    {theme.category}
                  </Badge>
                  <span className="text-sm font-semibold" style={{ color: theme.preview.text }}>{theme.label}</span>
                </div>

                <div className={`grid gap-3 ${previewModesToRender.length === 2 ? "md:grid-cols-2" : "grid-cols-1"}`}>
                  {previewModesToRender.map((mode) => (
                    <ThemeScene key={`${theme.name}-${mode}`} theme={theme} mode={mode} />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {!screenshotMode && (
        <div className="sticky top-20 z-20 rounded-3xl border border-[var(--ui-border)] bg-[var(--ui-card)]/95 p-4 shadow-sm backdrop-blur supports-[backdrop-filter]:bg-[var(--ui-card)]/85 sm:p-5 xl:rounded-[2rem] xl:px-6 xl:py-5 xl:shadow-lg dark:border-zinc-800 dark:bg-zinc-950/95 dark:supports-[backdrop-filter]:bg-zinc-950/85">
            <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between xl:gap-6">
            <div>
              <h3 className="text-sm font-semibold uppercase tracking-[0.16em] text-[var(--ui-text-muted)]">
                Filter Preset
              </h3>
              <p className="mt-1 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
                Tampilkan tema unggulan, light-only, atau dark-first sesuai kebutuhan brand Anda.
              </p>
            </div>
              <div className="flex flex-wrap items-center gap-2">
              <Badge variant="secondary" className="w-fit rounded-full px-3 py-1 text-xs">
                {filteredThemes.length} tema tampil
              </Badge>
              {hasActiveControls && (
                <button
                  type="button"
                  onClick={resetControls}
                  className="inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm"
                  style={{
                    borderColor: "var(--ui-border)",
                    backgroundColor: "var(--ui-card)",
                    color: "var(--ui-text)",
                  }}
                >
                  <RotateCcw className="h-3.5 w-3.5" /> Reset
                </button>
              )}
            </div>
          </div>

        {hasActiveControls && (
          <div className="mt-4 flex flex-wrap gap-2 xl:mt-3 xl:gap-2.5">
            {activeFilter !== "all" && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Filter: {THEME_FILTERS.find((filter) => filter.value === activeFilter)?.label}
              </Badge>
            )}
            {searchQuery.trim() && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Search: {searchQuery.trim()}
              </Badge>
            )}
            {activeSort !== "recommended" && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Sort: {THEME_SORTS.find((sort) => sort.value === activeSort)?.label}
              </Badge>
            )}
            {previewMode !== "both" && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Preview: {PREVIEW_MODES.find((mode) => mode.value === previewMode)?.label}
              </Badge>
            )}
            {heroMode === "presentation" && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Hero: Presentation
              </Badge>
            )}
            {screenshotMode && (
              <Badge variant="outline" className="rounded-full border-[var(--ui-border)] px-3 py-1 text-xs text-[var(--ui-text-muted)]">
                Screenshot: On
              </Badge>
            )}
          </div>
        )}

        <div className="mt-4 grid gap-4 xl:mt-5 xl:gap-5 xl:grid-cols-[minmax(0,1fr)_auto] xl:items-end">
          <div className="space-y-3 xl:space-y-3.5">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--ui-text-muted)]" />
              <Input
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Cari tema, style, kategori, atau use case..."
                className="h-11 rounded-2xl border-[var(--ui-input-border)] bg-[var(--ui-input-bg)] pl-10 text-[var(--ui-text)] placeholder:text-[var(--ui-text-muted)] xl:h-12 xl:rounded-[1.1rem]"
              />
            </div>

            <div className="flex flex-wrap gap-2 xl:gap-2.5">
              {THEME_FILTERS.map((filter) => {
                const isSelected = activeFilter === filter.value;
                const Icon = filter.icon;

                return (
                  <button
                    key={filter.value}
                    type="button"
                    onClick={() => setActiveFilter(filter.value)}
                    className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 xl:px-4.5 xl:py-2.5 ${
                      isSelected
                        ? "shadow-md"
                        : "hover:-translate-y-0.5 hover:shadow-sm"
                    }`}
                    style={{
                      borderColor: isSelected ? "var(--ui-accent)" : "var(--ui-border)",
                      backgroundColor: isSelected ? "var(--ui-accent-bg)" : "var(--ui-card)",
                      color: isSelected ? "var(--ui-accent)" : "var(--ui-text)",
                    }}
                  >
                    <Icon className="h-4 w-4" />
                    <span>{filter.label}</span>
                    <span className="hidden text-xs opacity-70 sm:inline">{filter.helper}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap gap-2 xl:gap-2.5 xl:justify-end">
            {THEME_SORTS.map((sort) => {
              const isSelected = activeSort === sort.value;

              return (
                <button
                  key={sort.value}
                  type="button"
                  onClick={() => setActiveSort(sort.value)}
                  className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-medium transition-all duration-200 xl:px-4.5 xl:py-2.5 ${
                    isSelected ? "shadow-md" : "hover:-translate-y-0.5 hover:shadow-sm"
                  }`}
                  style={{
                    borderColor: isSelected ? "var(--ui-accent)" : "var(--ui-border)",
                    backgroundColor: isSelected ? "var(--ui-accent-bg)" : "var(--ui-card)",
                    color: isSelected ? "var(--ui-accent)" : "var(--ui-text)",
                  }}
                  title={sort.helper}
                >
                  <ArrowUpDown className="h-4 w-4" />
                  <span>{sort.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      </div>
      )}

      {filteredThemes.length > 0 ? (
        <div className="grid grid-cols-1 gap-5 sm:gap-6 xl:grid-cols-2 2xl:grid-cols-3">
          {filteredThemes.map((theme) => {
            const isActive = uiTheme === theme.name;
            const traits = getThemeTraits(theme);

            return (
              <button
                key={theme.name}
                type="button"
                onClick={() => handleSelectTheme(theme.name)}
                className={`group relative overflow-hidden rounded-3xl border-2 text-left transition-all duration-500 ease-out will-change-transform animate-in fade-in-50 slide-in-from-bottom-2 ${
                  isActive
                    ? "scale-[1.01] border-current shadow-xl ring-2 ring-current ring-offset-2"
                    : "border-transparent hover:-translate-y-0.5 hover:border-muted-foreground/20 hover:shadow-lg"
                }`}
                style={{
                  borderColor: isActive ? theme.preview.accent : undefined,
                  backgroundColor: theme.preview.card,
                  // @ts-ignore
                  "--tw-ring-color": isActive ? theme.preview.accent : undefined,
                } as React.CSSProperties}
              >
              {isActive && (
                <div
                  className="absolute right-4 top-4 z-20 flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-bold text-white shadow-lg"
                  style={{ backgroundColor: theme.preview.accent }}
                >
                  <CheckCircle2 className="h-3.5 w-3.5" />
                  Aktif
                </div>
              )}

              <div className="space-y-3 p-5 xl:space-y-3.5 xl:p-5" style={{ backgroundColor: theme.preview.bg }}>
                <div className={`grid gap-3 xl:gap-3.5 ${previewModesToRender.length === 2 ? "2xl:grid-cols-2" : "grid-cols-1"}`}>
                  {previewModesToRender.map((mode) => (
                    <ThemeScene key={mode} theme={theme} mode={mode} />
                  ))}
                </div>
              </div>

              <div
                className="border-t px-5 py-4 xl:px-5 xl:py-4.5"
                style={{
                  backgroundColor: theme.preview.card,
                  borderColor: `${theme.preview.muted}20`,
                }}
              >
                <div className="mb-2.5 flex flex-wrap items-center gap-2 xl:gap-2.5">
                  <h3 className="text-lg font-bold font-serif tracking-tight" style={{ color: theme.preview.text }}>
                    {theme.label}
                  </h3>
                  <Badge
                    variant="secondary"
                    className="rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      backgroundColor: `${theme.preview.accent}18`,
                      color: theme.preview.accent,
                    }}
                  >
                    {theme.tagline}
                  </Badge>
                  <Badge
                    variant="outline"
                    className="rounded-full border px-2 py-0 text-[10px] font-semibold uppercase tracking-wider"
                    style={{
                      borderColor: `${theme.preview.muted}30`,
                      color: theme.preview.muted,
                    }}
                  >
                    {theme.category}
                  </Badge>
                  {theme.featured && (
                    <Badge className="rounded-full bg-amber-500 px-2 py-0 text-[10px] font-semibold uppercase tracking-wider text-white hover:bg-amber-500">
                      <Star className="mr-1 h-3 w-3" /> Recommended
                    </Badge>
                  )}
                </div>

                <p className="mb-3 text-xs leading-relaxed xl:text-[13px]" style={{ color: theme.preview.muted }}>
                  {theme.description}
                </p>

                {traits.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {traits.map((trait) => (
                      <Badge
                        key={trait}
                        className="rounded-full px-2 py-0 text-[10px] font-semibold uppercase tracking-wider text-white"
                        style={{ backgroundColor: theme.preview.accent }}
                      >
                        {trait}
                      </Badge>
                    ))}
                  </div>
                )}

                <div className="mb-2.5 grid gap-2 text-[11px] sm:grid-cols-2">
                  <div className="rounded-2xl border px-3 py-2" style={{ borderColor: `${theme.preview.muted}20`, color: theme.preview.text }}>
                    <div className="mb-1 font-semibold" style={{ color: theme.preview.text }}>Style</div>
                    <div style={{ color: theme.preview.muted }}>{theme.style}</div>
                  </div>
                  <div className="rounded-2xl border px-3 py-2" style={{ borderColor: `${theme.preview.muted}20`, color: theme.preview.text }}>
                    <div className="mb-1 font-semibold" style={{ color: theme.preview.text }}>Recommended for</div>
                    <div style={{ color: theme.preview.muted }}>{theme.recommendedFor}</div>
                  </div>
                </div>

                <div className="mb-2.5 flex flex-col gap-2.5 rounded-2xl border px-3 py-2 sm:flex-row sm:items-center sm:justify-between" style={{ borderColor: `${theme.preview.muted}20` }}>
                  <div>
                    <div className="text-[10px] font-semibold uppercase tracking-[0.16em]" style={{ color: theme.preview.muted }}>
                      Palette
                    </div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {[
                        { label: "BG", color: theme.preview.bg },
                        { label: "Card", color: theme.preview.card },
                        { label: "Accent", color: theme.preview.accent },
                        { label: "Text", color: theme.preview.text },
                      ].map((token) => (
                        <button
                          key={token.label}
                          type="button"
                          onClick={(event) => {
                            event.stopPropagation();
                            void handleCopyPaletteColor(`${theme.label} · ${token.label}`, token.color);
                          }}
                          className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm"
                          style={{ borderColor: `${theme.preview.muted}25`, color: theme.preview.text }}
                          title={`Copy ${token.color}`}
                        >
                          <span
                            className="h-4 w-4 rounded-full border shadow-sm"
                            style={{ borderColor: `${theme.preview.muted}25`, backgroundColor: token.color }}
                          />
                          <span>{token.label}</span>
                          <Copy className="h-3 w-3" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2 sm:justify-end">
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleExportTheme(theme, "json");
                      }}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm"
                      style={{ borderColor: `${theme.preview.muted}25`, color: theme.preview.text }}
                    >
                      <Copy className="h-3 w-3" /> JSON
                    </button>
                    <button
                      type="button"
                      onClick={(event) => {
                        event.stopPropagation();
                        void handleExportTheme(theme, "css");
                      }}
                      className="inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[10px] font-medium transition-all hover:-translate-y-0.5 hover:shadow-sm"
                      style={{ borderColor: `${theme.preview.muted}25`, color: theme.preview.text }}
                    >
                      <Copy className="h-3 w-3" /> CSS
                    </button>
                  </div>
                </div>

                <div className="flex flex-wrap gap-2">
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${theme.preview.muted}12`,
                      color: theme.preview.muted,
                    }}
                  >
                    <Monitor className="h-2.5 w-2.5" /> {theme.surface}
                  </span>
                  <span
                    className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium"
                    style={{
                      backgroundColor: `${theme.preview.accent}15`,
                      color: theme.preview.accent,
                    }}
                  >
                    <Sparkles className="h-2.5 w-2.5" /> {theme.accent}
                  </span>
                </div>
              </div>
            </button>
          );
          })}
        </div>
      ) : (
        <div className="rounded-3xl border border-dashed border-[var(--ui-border)] bg-[var(--ui-card)] px-6 py-12 text-center shadow-sm dark:border-zinc-800 dark:bg-zinc-950">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--ui-accent-bg)] text-[var(--ui-accent)]">
            <Palette className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-lg font-bold text-[var(--ui-text)]">Tidak ada tema pada filter ini</h3>
          <p className="mt-2 text-sm text-[var(--ui-text-muted)] dark:text-zinc-400">
            Coba ganti filter untuk melihat preset akun lainnya.
          </p>
        </div>
      )}
    </div>
  );
}
