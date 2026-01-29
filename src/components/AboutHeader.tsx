"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import type { Lang } from "@/lib/i18n";

export default function AboutHeader({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<"light" | "dark">("light");
  const router = useRouter();

  const aboutLabel = lang === "en" ? "About" : "Sobre";
  const backLabel = lang === "en" ? "Back to home" : lang === "es" ? "Volver al inicio" : "Voltar à home";

  useEffect(() => {
    const stored = window.localStorage.getItem("rw_theme");
    if (stored === "dark" || stored === "light") {
      setTheme(stored);
    } else {
      setTheme("light");
    }
  }, []);

  useEffect(() => {
    setLang(initialLang);
  }, [initialLang]);

  useEffect(() => {
    window.localStorage.setItem("rw_theme", theme);
    document.documentElement.dataset.theme = theme;
  }, [theme]);

  useEffect(() => {
    document.documentElement.lang = lang;
  }, [lang]);

  function persistLang(next: Lang) {
    window.localStorage.setItem("rw_lang", next);
  }

  function changeLang(next: Lang) {
    setLang(next);
    persistLang(next);
    router.replace(`/sobre?lang=${next}`);
  }

  return (
    <header
      className={[
        "sticky top-0 z-40 border-b backdrop-blur",
        theme === "dark" ? "border-zinc-800 bg-zinc-950/80" : "border-zinc-200 bg-white/80",
        "transition-[padding] duration-200",
        "pb-10 pt-4",
      ].join(" ")}
    >
      <div className="mx-auto w-full px-6 sm:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-2 lg:grid-cols-[360px_1fr_260px] lg:items-start lg:gap-8">
          <div className="space-y-6">
            <Link
              href={`/?lang=${lang}`}
              className="instrument-serif-regular block text-[44px] leading-none tracking-[-0.01em] sm:text-[52px]"
            >
              referencias.work
            </Link>
          </div>

          <div className="hidden lg:block" />

          <div className="flex items-center justify-between gap-6 lg:justify-end flex-nowrap">
            <span className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap text-zinc-400">
              {aboutLabel}
            </span>

            <div className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap">
              {(["pt", "es", "en"] as Lang[]).map((code, idx) => (
                <span key={code}>
                  <button
                    onClick={() => changeLang(code)}
                    className={lang === code ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                  >
                    {code}
                  </button>
                  {idx < 2 ? <span className="text-zinc-400">/</span> : null}
                </span>
              ))}
            </div>

            <div className="inline-flex items-center gap-0 pt-2 text-[14px] sm:text-[16px] shrink-0">
              <button
                onClick={() => setTheme("light")}
                className={theme === "light" ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                aria-pressed={theme === "light"}
              >
                Light
              </button>
              <span className="text-zinc-400">/</span>
              <button
                onClick={() => setTheme("dark")}
                className={theme === "dark" ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                aria-pressed={theme === "dark"}
              >
                Dark
              </button>
            </div>

            <Link
              href={`/?lang=${lang}`}
              className="inline-flex whitespace-nowrap pt-2 text-[14px] sm:text-[16px] text-zinc-950 shrink-0"
            >
              {backLabel}
            </Link>
          </div>
        </div>
      </div>
    </header>
  );
}
