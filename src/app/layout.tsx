import type { Metadata } from "next";
import "./globals.css";
import { Geist, Geist_Mono } from "next/font/google";
import { cn } from "@/lib/utils";
import { ThemeProvider } from "@/components/theme-provider";
import { getCurrentUser } from "@/lib/auth/getCurrentUser";

const geist = Geist({ subsets: ["latin"], variable: "--font-sans" });
const geistMono = Geist_Mono({ subsets: ["latin"], variable: "--font-mono" });

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
      className={cn("font-sans", geist.variable, geistMono.variable)}
      suppressHydrationWarning
    >
      <body>
        <ThemeProvider initialTheme={initialTheme}>{children}</ThemeProvider>
      </body>
    </html>
  );
}
