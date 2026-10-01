import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import { CookieConsent } from "@/components/cookie-consent";
import { CuratorProvider } from "@/components/curator-provider";
import { CuratorWidget } from "@/components/curator-widget";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: {
    default: "AvitoOps — Авито ведут за Вас",
    template: "%s — AvitoOps",
  },
  description:
    "Напишите или скажите OPS, что продаёте. Карточка собирается в разговоре.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} min-h-screen pb-32 antialiased`}>
        <CuratorProvider>
          {children}
          <CookieConsent />
          <CuratorWidget />
        </CuratorProvider>
      </body>
    </html>
  );
}
