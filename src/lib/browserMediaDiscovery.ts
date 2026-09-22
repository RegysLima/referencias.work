import { Browserbase } from "@browserbasehq/sdk";
import Kernel from "@onkernel/sdk";
import { chromium, type Browser, type Page, type Response } from "playwright-core";
import type { MediaCandidate, MediaCandidateSource, MediaCandidateType } from "./mediaDiscovery";

type BrowserMediaInput = {
  url: string;
  contentType?: string;
};

export type BrowserMediaDiscoveryResult = {
  attempted: boolean;
  candidates: MediaCandidate[];
  error?: "not-configured" | "session-failed";
  provider?: "browserbase" | "kernel";
};

let browserQueue: Promise<void> = Promise.resolve();

async function withBrowserSlot<T>(operation: () => Promise<T>) {
  const previous = browserQueue;
  let release: () => void = () => {};
  browserQueue = new Promise<void>((resolve) => {
    release = resolve;
  });
  await previous;
  try {
    return await operation();
  } finally {
    release();
  }
}

function browserSourceKind(pageUrl: string): MediaCandidateSource {
  try {
    const page = new URL(pageUrl);
    const segments = page.pathname.split("/").filter(Boolean);
    if (!segments.length) return "generic";
    const projectIndex = segments.findIndex((segment) =>
      /^(work|works|project|projects|case|cases|portfolio|showcase)$/i.test(segment)
    );
    if (projectIndex >= 0 && segments.length > projectIndex + 1) return "project";
    if (segments.length >= 2) {
      return "project";
    }
    return "listing";
  } catch {
    return "generic";
  }
}

function mediaType(input: BrowserMediaInput): MediaCandidateType | null {
  const contentType = (input.contentType || "").toLowerCase();
  if (contentType.startsWith("video/")) return "video";
  if (contentType.startsWith("image/") && !contentType.includes("svg")) return "image";
  if (/\.(mp4|webm|mov|m4v|m3u8)(\?|#|$)/i.test(input.url)) return "video";
  if (/\.(png|jpe?g|webp|gif|avif)(\?|#|$)/i.test(input.url)) return "image";
  return null;
}

export function normalizeBrowserMedia(pageUrl: string, values: BrowserMediaInput[]) {
  const candidates: MediaCandidate[] = [];
  const seen = new Set<string>();
  for (const value of values) {
    let url: string;
    try {
      url = new URL(value.url, pageUrl).toString();
      const parsed = new URL(url);
      if (parsed.pathname.includes("/_next/image")) {
        const inner = parsed.searchParams.get("url");
        if (inner) url = new URL(decodeURIComponent(inner), pageUrl).toString();
      }
    } catch {
      continue;
    }
    if (!/^https?:/i.test(url) || seen.has(url)) continue;
    const type = mediaType({ ...value, url });
    if (!type) continue;
    seen.add(url);
    candidates.push({
      url,
      sourcePageUrl: pageUrl,
      sourceKind: browserSourceKind(pageUrl),
      collector: "browser",
      mediaType: type,
    });
  }
  return candidates;
}

async function collectPageMedia(page: Page, pageUrl: string) {
  const networkMedia: BrowserMediaInput[] = [];
  const onResponse = (response: Response) => {
    void response.headerValue("content-type").then((contentType) => {
      if (/^(image|video)\//i.test(contentType || "")) {
        networkMedia.push({ url: response.url(), contentType: contentType || "" });
      }
    });
  };
  page.on("response", onResponse);

  try {
    await page.goto(pageUrl, { waitUntil: "domcontentloaded", timeout: 20_000 }).catch(() => null);
    await page.waitForTimeout(2_500);
    for (let index = 0; index < 3; index += 1) {
      await page
        .evaluate(() => window.scrollBy(0, Math.max(window.innerHeight, 720)))
        .catch(() => undefined);
      await page.waitForTimeout(500);
    }

    let rendered: { media: string[]; projectLinks: string[] } = { media: [], projectLinks: [] };
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        rendered = await page.evaluate(() => {
      const media = new Set<string>();
      const add = (value: string | null | undefined) => {
        if (value && !value.startsWith("data:") && !value.startsWith("blob:")) media.add(value);
      };
      const addSrcset = (value: string | null | undefined) => {
        for (const part of (value || "").split(",")) add(part.trim().split(/\s+/)[0]);
      };
      const addCssUrls = (value: string | null | undefined) => {
        const pattern = /url\(\s*(['"]?)(.*?)\1\s*\)/gi;
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(value || ""))) add(match[2]);
      };

      document.querySelectorAll("img, video, source").forEach((element) => {
        const node = element as HTMLImageElement | HTMLVideoElement | HTMLSourceElement;
        add("currentSrc" in node ? node.currentSrc : "");
        add(node.getAttribute("src"));
        add(node.getAttribute("poster"));
        add(node.getAttribute("data-src"));
        add(node.getAttribute("data-lazy-src"));
        addSrcset(node.getAttribute("srcset"));
        addSrcset(node.getAttribute("data-srcset"));
      });
      Array.from(document.querySelectorAll("body *"))
        .slice(0, 2_500)
        .forEach((element) => addCssUrls(getComputedStyle(element).backgroundImage));
      performance.getEntriesByType("resource").forEach((entry) => {
        const resource = entry as PerformanceResourceTiming;
        if (["img", "video"].includes(resource.initiatorType)) add(resource.name);
      });

      const projectLinks = Array.from(document.querySelectorAll("a[href]"))
        .filter((anchor) => {
          try {
            const url = new URL((anchor as HTMLAnchorElement).href);
            const knownProjectPath =
              /(^|\/)(work|works|project|projects|case|cases|portfolio|showcase)(\/|$)/i.test(
                url.pathname
              );
            if (knownProjectPath) return true;
            if (anchor.closest("nav, header, footer")) return false;
            return Boolean(anchor.querySelector("img, picture, video"));
          } catch {
            return false;
          }
        })
        .map((anchor) => (anchor as HTMLAnchorElement).href)
        .filter((href) => {
          try {
            const url = new URL(href);
            return (
              url.origin === location.origin &&
              url.pathname !== location.pathname &&
              !/\.(jpg|jpeg|png|webp|gif|svg|mp4|webm|mov|pdf|zip)$/i.test(url.pathname)
            );
          } catch {
            return false;
          }
        });

          return { media: Array.from(media), projectLinks: Array.from(new Set(projectLinks)) };
        });
        break;
      } catch {
        await page.waitForTimeout(1_000);
      }
    }

    return {
      candidates: normalizeBrowserMedia(page.url(), [
        ...rendered.media.map((url) => ({ url })),
        ...networkMedia,
      ]),
      projectLinks: rendered.projectLinks,
    };
  } finally {
    page.off("response", onResponse);
  }
}

async function collectConnectedBrowserMedia(browser: Browser, referenceUrl: string) {
  const context = browser.contexts()[0] || (await browser.newContext());
  const page = context.pages()[0] || (await context.newPage());
  const first = await collectPageMedia(page, referenceUrl);
  const candidates = [...first.candidates];
  const origin = new URL(referenceUrl).origin;
  const queue = first.projectLinks.length
    ? [...first.projectLinks]
    : ["/work", "/projects", "/portfolio"].map((path) => new URL(path, origin).toString());
  const visited = new Set([new URL(referenceUrl).toString()]);
  while (queue.length && visited.size <= 6) {
    const projectUrl = queue.shift();
    if (!projectUrl || visited.has(projectUrl)) continue;
    visited.add(projectUrl);
    try {
      const project = await collectPageMedia(page, projectUrl);
      candidates.push(...project.candidates);
      for (const link of project.projectLinks.reverse()) {
        if (!visited.has(link)) queue.unshift(link);
      }
    } catch {
      // One inaccessible project must not discard the rest of the session.
    }
  }
  return candidates;
}

async function runBrowserbaseDiscovery(
  referenceUrl: string
): Promise<BrowserMediaDiscoveryResult> {
  const apiKey = process.env.BROWSERBASE_API_KEY;
  const projectId = process.env.BROWSERBASE_PROJECT_ID;
  if (!apiKey || !projectId) {
    return { attempted: false, candidates: [], error: "not-configured", provider: "browserbase" };
  }

  const client = new Browserbase({ apiKey });
  let browser: Browser | null = null;
  let sessionId = "";
  try {
    const reference = new URL(referenceUrl);
    const session = await client.sessions.create({
      projectId,
      api_timeout: 60,
      browserSettings: {
        allowedDomains: [reference.hostname],
        blockAds: true,
      },
      userMetadata: { feature: "media-discovery", host: reference.hostname },
    });
    sessionId = session.id;
    browser = await chromium.connectOverCDP(session.connectUrl);
    const candidates = await collectConnectedBrowserMedia(browser, referenceUrl);
    return { attempted: true, candidates, provider: "browserbase" };
  } catch {
    return { attempted: true, candidates: [], error: "session-failed", provider: "browserbase" };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (sessionId) {
      await client.sessions
        .update(sessionId, { status: "REQUEST_RELEASE", projectId })
        .catch(() => undefined);
    }
  }
}

async function runKernelDiscovery(referenceUrl: string): Promise<BrowserMediaDiscoveryResult> {
  const apiKey = process.env.KERNEL_API_KEY;
  if (!apiKey) {
    return { attempted: false, candidates: [], error: "not-configured", provider: "kernel" };
  }

  const client = new Kernel({ apiKey });
  let browser: Browser | null = null;
  let sessionId = "";
  try {
    const session = await client.browsers.create({
      headless: true,
      stealth: true,
      timeout_seconds: 60,
      tags: { feature: "media-discovery" },
    });
    sessionId = session.session_id;
    browser = await chromium.connectOverCDP(session.cdp_ws_url);
    const candidates = await collectConnectedBrowserMedia(browser, referenceUrl);
    return { attempted: true, candidates, provider: "kernel" };
  } catch {
    return { attempted: true, candidates: [], error: "session-failed", provider: "kernel" };
  } finally {
    if (browser) await browser.close().catch(() => undefined);
    if (sessionId) await client.browsers.deleteByID(sessionId).catch(() => undefined);
  }
}

export async function discoverMediaWithBrowser(
  referenceUrl: string
): Promise<BrowserMediaDiscoveryResult> {
  return withBrowserSlot(async () => {
    const browserbase = await runBrowserbaseDiscovery(referenceUrl);
    if (browserbase.candidates.some((candidate) => candidate.sourceKind !== "generic")) {
      return browserbase;
    }

    const kernel = await runKernelDiscovery(referenceUrl);
    if (kernel.candidates.length) return kernel;

    return {
      attempted: browserbase.attempted || kernel.attempted,
      candidates: [...browserbase.candidates, ...kernel.candidates],
      error:
        browserbase.error === "not-configured" && kernel.error === "not-configured"
          ? "not-configured"
          : kernel.error || browserbase.error,
      provider: kernel.attempted ? "kernel" : "browserbase",
    };
  });
}
