import type { Metadata } from "next";
import { Manrope } from "next/font/google";
import "./globals.css";

const manrope = Manrope({ subsets: ["latin", "cyrillic"], variable: "--font-manrope" });

export const metadata: Metadata = {
  title: "AvitoOps — Авито под ключ",
  description: "Публикация, ответы и контроль бюджета продвижения на Авито.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body className={`${manrope.variable} min-h-screen antialiased`}>{children}</body>
    </html>
  );
}
