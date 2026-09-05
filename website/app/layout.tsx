import type { Metadata, Viewport } from "next";
import { assetPath, siteUrl } from "./site";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#191a1c",
};

export async function generateMetadata(): Promise<Metadata> {
  const origin = siteUrl.replace(/\/$/, "");
  const description = "A native macOS workspace for scientific research, master’s theses, and PhD dissertations. Read papers, develop analyses, inspect figures, and write in LaTeX.";

  return {
    metadataBase: new URL(siteUrl),
    alternates: { canonical: siteUrl },
    title: "Atelier Studio — A workspace for scientific research",
    description,
    applicationName: "Atelier Studio",
    keywords: ["scientific research", "master’s thesis", "PhD dissertation", "LaTeX", "research workspace", "macOS", "Claude Code", "Codex", "scientific figures", "Zotero", "Tauri"],
    authors: [{ name: "Atelier Studio" }],
    icons: {
      icon: assetPath("/atelier-icon.png"),
      shortcut: assetPath("/atelier-icon.png"),
      apple: assetPath("/atelier-icon.png"),
    },
    openGraph: {
      type: "website",
      url: origin,
      title: "Atelier Studio — Your thesis, in one workspace.",
      description,
      siteName: "Atelier Studio",
      images: [{ url: `${origin}/media/workspace.png`, width: 1600, height: 1000, alt: "Atelier Studio native research workspace" }],
    },
    twitter: {
      card: "summary_large_image",
      title: "Atelier Studio — Your thesis, in one workspace.",
      description,
      images: [`${origin}/media/workspace.png`],
    },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
