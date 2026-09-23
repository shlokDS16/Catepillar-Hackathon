import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { getLocale } from "next-intl/server";
import { Barlow, Barlow_Condensed, Noto_Sans_Devanagari, Noto_Sans_Tamil } from "next/font/google";
import "./globals.css";

/*
 * Four families (visual-language §2.1). Latin digits and words inside Hindi or Tamil sentences
 * render in Barlow, so numerals look the same in every language. The Noto files are not preloaded:
 * next/font emits unicode-range, so a script downloads only when a page actually uses it.
 */
const barlow = Barlow({
  weight: ["400", "500", "600", "700"],
  subsets: ["latin"],
  variable: "--font-barlow",
  display: "swap",
});
const barlowCondensed = Barlow_Condensed({
  weight: ["600", "700", "800"],
  subsets: ["latin"],
  variable: "--font-barlow-condensed",
  display: "swap",
});
const devanagari = Noto_Sans_Devanagari({
  weight: ["400", "600", "800"],
  subsets: ["devanagari", "latin"],
  variable: "--font-devanagari",
  display: "swap",
  preload: false,
});
const tamil = Noto_Sans_Tamil({
  weight: ["400", "600", "800"],
  subsets: ["tamil", "latin"],
  variable: "--font-tamil",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "Spotter",
  description: "Spotter, an operator companion for Cat machines.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  const locale = await getLocale();
  return (
    <html
      lang={locale}
      className={`${barlow.variable} ${barlowCondensed.variable} ${devanagari.variable} ${tamil.variable}`}
    >
      <body>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  );
}
