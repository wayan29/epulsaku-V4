// src/components/core/providers.tsx
"use client";

import { ThemeProvider } from "./ThemeProvider";
import { UiThemeProvider } from "@/contexts/UiThemeContext";
import type { ReactNode } from "react";
import type { UiThemeName } from "@/lib/ui-theme";

export function Providers({ children, resolvedUiTheme }: { children: ReactNode; resolvedUiTheme: UiThemeName }) {
  return (
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      <UiThemeProvider defaultTheme={resolvedUiTheme}>
        {children}
      </UiThemeProvider>
    </ThemeProvider>
  );
}
