"use client";

import { useEffect, useState } from "react";
import { UI, type Lang } from "@/lib/i18n";

export default function AboutHeader({ initialLang }: { initialLang: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang);
  const [theme, setTheme] = useState<"light" | "dark">("light");

  const ui = UI[lang] || UI.pt;
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

  return (
    <header
      className={[
        "sticky top-0 z-40 border-b backdrop-blur",
        theme === "dark" ? "border-zinc-800 bg-zinc-950/80" : "border-zinc-200 bg-white/80",
        "transition-[padding] duration-200",
        "pb-6 pt-4",
      ].join(" ")}
    >
      <div className="mx-auto w-full px-6 sm:px-10 lg:px-12">
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[360px_1fr_260px] lg:items-start">
          <div className="space-y-3">
            <a
              href={`/?lang=${lang}`}
              className="instrument-serif-regular block text-[44px] leading-none tracking-[-0.01em] sm:text-[52px]"
            >
              referencias.work
            </a>
          </div>

          <div className="hidden lg:flex lg:justify-start">
            <nav className="pt-2 text-[16px]">
              <a href={`/?lang=${lang}`} className="text-zinc-400 hover:text-zinc-700">
                {backLabel}
              </a>
            </nav>
          </div>

          <div className="flex items-center justify-between gap-6 lg:justify-end flex-nowrap">
            <a
              href={`/?lang=${lang}`}
              className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap text-zinc-400 hover:text-zinc-700 lg:hidden"
            >
              {backLabel}
            </a>

            <span className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap text-zinc-400">
              {aboutLabel}
            </span>

            <div className="pt-2 text-[14px] sm:text-[16px] whitespace-nowrap">
              {(["pt", "es", "en"] as Lang[]).map((code, idx) => (
                <span key={code}>
                  <a
                    href={`/sobre?lang=${code}`}
                    onClick={() => persistLang(code)}
                    className={lang === code ? "text-zinc-950" : "text-zinc-400 hover:text-zinc-700"}
                  >
                    {code}
                  </a>
                  {idx < 2 ? <span className="text-zinc-400">/</span> : null}
                </span>
              ))}
            </div>

            <div className="inline-flex items-center pt-2 text-[14px] sm:text-[16px] shrink-0">
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

            <a
              href={`/?lang=${lang}`}
              className="inline-flex whitespace-nowrap pt-2 text-[14px] sm:text-[16px] text-zinc-950 shrink-0"
            >
              + {ui.filters.toggle}
            </a>
          </div>
        </div>
      </div>
    </header>
  );
}
