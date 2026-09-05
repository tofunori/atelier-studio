import type { Metadata, Viewport } from "next";
import { headers } from "next/headers";
import "./globals.css";

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#191a1c",
};

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") ?? requestHeaders.get("host") ?? "localhost:3000";
  const protocol = requestHeaders.get("x-forwarded-proto") ?? (host.includes("localhost") ? "http" : "https");
  const origin = `${protocol}://${host}`;
  const description = "A native macOS workspace for scientific research, master’s theses, and PhD dissertations. Read papers, develop analyses, inspect figures, and write in LaTeX.";

  return {
    metadataBase: new URL(origin),
    title: "Atelier Studio — A workspace for scientific research",
    description,
    applicationName: "Atelier Studio",
    keywords: ["scientific research", "master’s thesis", "PhD dissertation", "LaTeX", "research workspace", "macOS", "Claude Code", "Codex", "scientific figures", "Zotero", "Tauri"],
    authors: [{ name: "Atelier Studio" }],
    icons: {
      icon: "/atelier-icon.png",
      shortcut: "/atelier-icon.png",
      apple: "/atelier-icon.png",
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
