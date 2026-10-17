import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "On-Track",
  description: "AI payment desk for marketing agencies",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">
        <header className="border-b border-zinc-200">
          {/* Plain <a>: Bryntum pages need full page loads anyway. */}
          <nav aria-label="Main" className="mx-auto flex w-full max-w-7xl items-center gap-5 px-8 py-3 text-sm">
            <a href="/" className="font-semibold">On-Track</a>
            <a href="/" className="text-zinc-600 hover:text-zinc-950">Campaigns</a>
            <a href="/approvals" className="text-zinc-600 hover:text-zinc-950">Approvals</a>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
