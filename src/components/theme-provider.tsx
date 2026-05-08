"use client";

import { ThemeProvider as NextThemesProvider } from "next-themes";

type Props = {
  children: React.ReactNode;
  initialTheme?: "light" | "dark" | "system";
};

/**
 * App-wide theme provider. The server-rendered <html> sets a stable
 * `suppressHydrationWarning` so next-themes can patch the class on
 * the client without a hydration mismatch.
 *
 * `initialTheme` is the value persisted to the user's profile (read by
 * RootLayout from `getCurrentUser()`); it seeds next-themes' first
 * render so signed-in users land on their saved theme without
 * a flash. Anonymous users start on `system`.
 */
export function ThemeProvider({ children, initialTheme = "system" }: Props) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme={initialTheme}
      enableSystem
      disableTransitionOnChange
    >
      {children}
    </NextThemesProvider>
  );
}
