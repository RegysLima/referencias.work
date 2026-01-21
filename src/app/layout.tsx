import type { Metadata } from "next";
import "./globals.css";
import { Inter_Tight, Instrument_Serif } from "next/font/google";

const interTight = Inter_Tight({
  subsets: ["latin"],
  variable: "--font-ui",
  display: "swap",
});

const instrumentSerif = Instrument_Serif({
  subsets: ["latin"],
  weight: "400",
  variable: "--font-brand",
  display: "swap",
});

export const metadata: Metadata = {
  metadataBase: new URL("https://referencias.work"),
  title: {
    default: "referencias.work",
    template: "%s · referencias.work",
  },
  description:
    "Diretório global de referências criativas: design, branding, ilustração, fotografia, tipografia e estúdios. Explore e filtre referências visuais.",
  keywords: [
    "design references",
    "creative references",
    "referências criativas",
    "referências de design",
    "best design studios",
    "branding references",
    "illustration references",
    "typography references",
    "design studios",
    "design inspiration",
    "estúdios de design",
    "inspiração em design",
  ],
  applicationName: "referencias.work",
  alternates: {
    canonical: "/",
  },
  robots: {
    index: true,
    follow: true,
  },
  openGraph: {
    title: "referencias.work",
    description:
      "Diretório global de referências criativas: design, branding, ilustração, fotografia, tipografia e estúdios.",
    url: "/",
    siteName: "referencias.work",
    locale: "pt_BR",
    type: "website",
    images: [
      {
        url: "/og.svg",
        width: 1200,
        height: 630,
        alt: "referencias.work",
      },
    ],
  },
  twitter: {
    card: "summary",
    title: "referencias.work",
    description:
      "Diretório global de referências criativas: design, branding, ilustração, fotografia, tipografia e estúdios.",
    images: ["/og.svg"],
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    name: "referencias.work",
    url: "https://referencias.work",
    description:
      "Diretório global de referências criativas: design, branding, ilustração, fotografia, tipografia e estúdios.",
    inLanguage: ["pt-BR", "en", "es"],
    publisher: {
      "@type": "Person",
      name: "Regys Lima",
      url: "https://regys.design/",
    },
  };

  return (
    <html
      lang="pt"
      className={`${interTight.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        {children}
      </body>
    </html>
  );
}
