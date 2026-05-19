import type { Metadata } from "next";
import "./globals.css";
import { Lato, Montserrat, JetBrains_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";
import { ImpersonationBanner } from "@/components/platform/impersonation-banner";

// Builtrix Design System — Living Intelligence:
//   Lato (body/UI), Montserrat (display/headings), JetBrains Mono (numerics).
// Exposed as CSS vars consumed by globals.css + @theme inline.
const sans = Lato({
  subsets: ["latin"],
  weight: ["300", "400", "700", "900"],
  variable: "--font-sans",
});
const display = Montserrat({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-display",
});
const mono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Builtrix AI-Native CRM",
  description: "Salesforce-depth, AI-native CRM for Indian real-estate sales.",
};

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let initialTheme: "light" | "dark" | "system" = "system";
  try {
    const user = await getCurrentUser();
    if (user?.profile?.theme) initialTheme = user.profile.theme;
  } catch {
    // never block the layout on auth/db errors
  }

  return (
    <html
      lang="en"
      className={cn(
        "font-sans",
        sans.variable,
        display.variable,
        mono.variable,
      )}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider initialTheme={initialTheme}>
          {/* D-606 — global impersonation banner; renders only when an
              active impersonation cookie is present. */}
          <ImpersonationBanner />
          {children}
        </ThemeProvider>
      </body>
    </html>
  );
}
