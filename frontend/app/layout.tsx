import type { Metadata } from "next";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Fraunces, JetBrains_Mono } from "next/font/google";
import { cookies } from "next/headers";
import { ThemeProvider, ThemePref } from "@/components/theme/ThemeProvider";
import "./globals.css";

const fraunces = Fraunces({
  subsets: ["latin", "latin-ext"],
  weight: ["300", "400", "500", "600", "700"],
  style: ["normal", "italic"],
  variable: "--font-display",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "500"],
  variable: "--font-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "DocAI",
  description: "A searchable, multilingual archive for your organization.",
};

const THEME_INIT = `(function(){try{var c=document.cookie.match(/(?:^|; )NEXT_THEME=([^;]+)/);var pref=c?decodeURIComponent(c[1]):(localStorage.getItem('NEXT_THEME')||'system');if(pref!=='light'&&pref!=='dark'&&pref!=='system')pref='system';var resolved=pref==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):pref;document.documentElement.setAttribute('data-theme',resolved);document.documentElement.style.colorScheme=resolved;}catch(e){}})();`;

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const locale = await getLocale();
  const messages = await getMessages();
  const cookieStore = await cookies();
  const cookiePref = cookieStore.get("NEXT_THEME")?.value;
  const initialPref: ThemePref =
    cookiePref === "light" || cookiePref === "dark" || cookiePref === "system"
      ? cookiePref
      : "system";
  const ssrResolved: "light" | "dark" =
    initialPref === "dark" ? "dark" : "light";

  return (
    <html
      lang={locale}
      data-theme={ssrResolved}
      style={{ colorScheme: ssrResolved }}
      className={`${fraunces.variable} ${jetbrainsMono.variable}`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_INIT }} />
      </head>
      <body>
        <NextIntlClientProvider locale={locale} messages={messages}>
          <ThemeProvider initialPref={initialPref}>{children}</ThemeProvider>
        </NextIntlClientProvider>
      </body>
    </html>
  );
}
