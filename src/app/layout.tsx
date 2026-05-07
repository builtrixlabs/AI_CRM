import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Builtrix AI-Native CRM",
  description: "Salesforce-depth, AI-native CRM for Indian real-estate sales.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
