import { getRequestConfig } from "next-intl/server";
import { cookies } from "next/headers";

export default getRequestConfig(async () => {
  const cookieStore = cookies();
  const validLocales = ["en", "az", "ru", "uz"];
  const fallbackLocale = validLocales.includes(process.env.DEFAULT_LOCALE ?? "")
    ? (process.env.DEFAULT_LOCALE as string)
    : "en";
  const locale = cookieStore.get("locale")?.value ?? fallbackLocale;
  const resolvedLocale = validLocales.includes(locale) ? locale : fallbackLocale;

  return {
    locale: resolvedLocale,
    messages: (await import(`./${resolvedLocale}.json`)).default,
  };
});
