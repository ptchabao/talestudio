import { I18nProvider } from "@/i18n/client";
import { getDictionary, getLocale, getTheme } from "@/i18n/server";
import { SITE_NAME, siteUrl } from "@/lib/seo";
import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export async function generateMetadata(): Promise<Metadata> {
  const t = await getDictionary();
  return {
    metadataBase: new URL(siteUrl()),
    title: { default: t.meta.title, template: `%s · ${SITE_NAME}` },
    description: t.meta.description,
    applicationName: SITE_NAME,
    creator: SITE_NAME,
    publisher: SITE_NAME,
    category: "technology",
    formatDetection: { telephone: false, email: false, address: false },
    robots: { index: true, follow: true, googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 } },
    verification: { google: process.env.GOOGLE_SITE_VERIFICATION || undefined, other: process.env.BING_SITE_VERIFICATION ? { "msvalidate.01": process.env.BING_SITE_VERIFICATION } : undefined },
  };
}

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000710" },
  ],
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  // Theme and locale come from cookies and are applied on the server: light by default, no flash on load.
  const [locale, theme, t] = await Promise.all([getLocale(), getTheme(), getDictionary()]);
  return (
    <html lang={locale} className={`${inter.variable} ${theme === "dark" ? "dark" : ""}`} style={{ colorScheme: theme }}>
      <body className="min-h-dvh font-sans">
        <I18nProvider t={t} locale={locale}>
          {children}
        </I18nProvider>
      </body>
    </html>
  );
}
