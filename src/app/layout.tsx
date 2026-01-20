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
  title: "referencias.work",
  description:
    "referencias.work — diretório de referências criativas globais: studios, designers, ilustradores, fotógrafos e foundries.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html
      lang="pt"
      className={`${interTight.variable} ${instrumentSerif.variable}`}
      suppressHydrationWarning
    >
      <body className="font-sans">
        {children}
      </body>
    </html>
  );
}
