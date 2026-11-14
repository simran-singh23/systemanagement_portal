import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const inter = localFont({ src: "./fonts/inter.ttf", variable: "--font-inter", display: "swap", weight: "400 700" });
const jakarta = localFont({ src: "./fonts/plus-jakarta-sans.ttf", variable: "--font-jakarta", display: "swap", weight: "500 800" });

export const metadata: Metadata = {
  title: {
    default: "TeamFlow",
    template: "%s | TeamFlow",
  },
  description: "A focused workspace for teams to plan, coordinate, and deliver.",
};

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f6f8fc" },
    { media: "(prefers-color-scheme: dark)", color: "#0b1120" },
  ],
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`h-full antialiased ${inter.variable} ${jakarta.variable}`} data-scroll-behavior="smooth" suppressHydrationWarning>
      <head><script dangerouslySetInnerHTML={{ __html: `(function(){try{var t=localStorage.getItem('teamflow-theme');var d=t==='dark'||(!t&&matchMedia('(prefers-color-scheme: dark)').matches);document.documentElement.classList.toggle('dark',d);document.documentElement.style.colorScheme=d?'dark':'light'}catch(e){}})()` }} /></head>
      <body className="min-h-full bg-[var(--canvas)] text-[var(--ink)]">
        {children}
      </body>
    </html>
  );
}
