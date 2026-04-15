"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

import { setMyUiTheme } from "@/lib/ui-theme-actions";
import type { UiThemeName } from "@/lib/ui-theme";

export interface UiThemeInfo {
  name: UiThemeName;
  label: string;
  tagline: string;
  category: "Light" | "Dark";
  style: string;
  recommendedFor: string;
  featured?: boolean;
  description: string;
  surface: string;
  accent: string;
  preview: {
    bg: string;
    card: string;
    accent: string;
    text: string;
    muted: string;
  };
  darkPreview?: {
    bg: string;
    card: string;
    accent: string;
    text: string;
    muted: string;
  };
}

export const UI_THEMES: UiThemeInfo[] = [
  {
    name: "ember",
    label: "Ember",
    tagline: "premium",
    category: "Light",
    style: "Warm premium",
    recommendedFor: "Membership premium, coaching, course eksklusif",
    featured: true,
    description:
      "Cocok untuk membership premium dan coaching. Nuansa hangat premium dengan amber gradient yang memberi kesan eksklusif tanpa terasa berat.",
    surface: "Ivory premium dengan amber glow",
    accent: "Burnt orange yang ramah dan meyakinkan",
    preview: { bg: "#FDFBF7", card: "#FFFFFF", accent: "#D35400", text: "#36454F", muted: "#6D6B5F" },
    darkPreview: { bg: "#18120C", card: "#1C1410", accent: "#D35400", text: "#F5F0EB", muted: "#A89A8C" },
  },
  {
    name: "horizon",
    label: "Horizon",
    tagline: "clean",
    category: "Light",
    style: "Modern SaaS",
    recommendedFor: "Dashboard course, member area modern, admin umum",
    description:
      "Cocok untuk LMS modern dan website course. Tema terang yang bersih dan profesional untuk member area yang ingin terasa modern tanpa terlihat kaku.",
    surface: "White surface dengan muted blue highlight",
    accent: "Calm blue yang elegan dan aman",
    preview: { bg: "#F8FAFC", card: "#FFFFFF", accent: "#3B82F6", text: "#1E293B", muted: "#64748B" },
    darkPreview: { bg: "#0C1220", card: "#111827", accent: "#3B82F6", text: "#F1F5F9", muted: "#94A3B8" },
  },
  {
    name: "neo-brutal",
    label: "Neo Brutal",
    tagline: "bold",
    category: "Light",
    style: "Structured editorial",
    recommendedFor: "Brand personal, cohort class, admin yang ingin terlihat tegas",
    description:
      "Cocok untuk brand personal dan cohort class. Dashboard clean dengan sentuhan navy yang memberikan kesan profesional dan modern untuk member area.",
    surface: "Light gray surface dengan navy header yang tegas",
    accent: "Navy solid + blue insight accent",
    preview: { bg: "#F1F5F9", card: "#FFFFFF", accent: "#1E3A5F", text: "#0F172A", muted: "#475569" },
    darkPreview: { bg: "#0A0F1A", card: "#0F172A", accent: "#1E3A5F", text: "#E2E8F0", muted: "#94A3B8" },
  },
  {
    name: "midnight",
    label: "Midnight",
    tagline: "elegant",
    category: "Dark",
    style: "Dark premium",
    recommendedFor: "Brand premium, night dashboard, admin dengan fokus data",
    description:
      "Cocok untuk brand premium yang suka dark dashboard. Dark dashboard yang sleek dan meyakinkan, cocok untuk brand yang ingin terlihat lebih eksklusif.",
    surface: "Dark surface dengan navy subtle glow",
    accent: "Silver blue dan emerald highlight",
    preview: { bg: "#0F172A", card: "#1E293B", accent: "#38BDF8", text: "#F1F5F9", muted: "#94A3B8" },
    darkPreview: { bg: "#0F172A", card: "#1E293B", accent: "#38BDF8", text: "#F1F5F9", muted: "#94A3B8" },
  },
  {
    name: "forest",
    label: "Forest",
    tagline: "trusted",
    category: "Light",
    style: "Trust-driven",
    recommendedFor: "Fintech, transaksi, operasional yang butuh kesan aman",
    featured: true,
    description:
      "Tema hijau modern yang terasa stabil dan terpercaya. Cocok untuk dashboard transaksi, laporan, dan area yang mengutamakan rasa aman.",
    surface: "Mint mist dengan card putih bersih",
    accent: "Deep green yang terasa stabil dan meyakinkan",
    preview: { bg: "#F6FBF8", card: "#FFFFFF", accent: "#15803D", text: "#1F2937", muted: "#6B7280" },
    darkPreview: { bg: "#0D1510", card: "#111B15", accent: "#15803D", text: "#ECFDF3", muted: "#A7B9AE" },
  },
  {
    name: "royal-plum",
    label: "Royal Plum",
    tagline: "luxury",
    category: "Light",
    style: "Editorial premium",
    recommendedFor: "Subscription, kelas eksklusif, member area high-end",
    featured: true,
    description:
      "Tema ungu premium yang langsung terasa berbeda dari dashboard generik. Pas untuk brand yang ingin terlihat lebih mewah, modern, dan memorable.",
    surface: "Soft lavender dengan card cerah",
    accent: "Royal plum yang elegan dan standout",
    preview: { bg: "#FCFAFF", card: "#FFFFFF", accent: "#7C3AED", text: "#2E1065", muted: "#6B7280" },
    darkPreview: { bg: "#140F23", card: "#1C1530", accent: "#7C3AED", text: "#F5F3FF", muted: "#C4B5FD" },
  },
  {
    name: "graphite",
    label: "Graphite",
    tagline: "operational",
    category: "Light",
    style: "Minimal neutral",
    recommendedFor: "Aplikasi admin-heavy, operasional harian, backoffice",
    description:
      "Tema netral yang rapi dan profesional. Sangat cocok untuk aplikasi operasional yang dibuka lama setiap hari dan butuh visual tenang tanpa distraksi.",
    surface: "Cool gray dengan struktur tegas",
    accent: "Graphite yang netral dan profesional",
    preview: { bg: "#F4F4F5", card: "#FFFFFF", accent: "#27272A", text: "#18181B", muted: "#71717A" },
    darkPreview: { bg: "#09090B", card: "#111113", accent: "#27272A", text: "#FAFAFA", muted: "#A1A1AA" },
  },
];

interface UiThemeContextType {
  uiTheme: UiThemeName;
  setUiTheme: (theme: UiThemeName) => Promise<void>;
  themeInfo: UiThemeInfo;
}

const UiThemeContext = createContext<UiThemeContextType | undefined>(undefined);

export function UiThemeProvider({ children, defaultTheme = "ember" }: { children: ReactNode; defaultTheme?: UiThemeName }) {
  const [uiTheme, setUiThemeState] = useState<UiThemeName>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!mounted) return;
    document.documentElement.setAttribute("data-ui-theme", uiTheme);
  }, [uiTheme, mounted]);

  useEffect(() => {
    setUiThemeState(defaultTheme);
  }, [defaultTheme]);

  const setUiTheme = async (theme: UiThemeName) => {
    const previousTheme = uiTheme;
    setUiThemeState(theme);

    try {
      const res = await setMyUiTheme(theme);
      if (!res.success) {
        console.error(res.message);
        setUiThemeState(previousTheme);
        throw new Error(res.message);
      }
    } catch (err) {
      setUiThemeState(previousTheme);
      throw err;
    }
  };

  const themeInfo = UI_THEMES.find((t) => t.name === uiTheme) || UI_THEMES[0];

  return (
    <UiThemeContext.Provider value={{ uiTheme, setUiTheme, themeInfo }}>
      {children}
    </UiThemeContext.Provider>
  );
}

export function useUiTheme() {
  const context = useContext(UiThemeContext);
  if (!context) {
    throw new Error("useUiTheme must be used within a UiThemeProvider");
  }
  return context;
}
