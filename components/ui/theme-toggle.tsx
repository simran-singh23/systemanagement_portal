"use client";

import { useSyncExternalStore } from "react";
import { Icon } from "@/components/ui/icons";

const themeEvent = "teamflow-theme-change";
function subscribeTheme(callback: () => void) { window.addEventListener(themeEvent, callback); window.addEventListener("storage", callback); return () => { window.removeEventListener(themeEvent, callback); window.removeEventListener("storage", callback); }; }
function themeSnapshot() { return document.documentElement.classList.contains("dark"); }
function serverThemeSnapshot() { return false; }

export function ThemeToggle() {
  const dark = useSyncExternalStore(subscribeTheme, themeSnapshot, serverThemeSnapshot);

  function toggleTheme() {
    const next = document.documentElement.classList.contains("dark") ? "light" : "dark";
    document.documentElement.classList.toggle("dark", next === "dark");
    document.documentElement.style.colorScheme = next;
    localStorage.setItem("teamflow-theme", next);
    window.dispatchEvent(new Event(themeEvent));
  }
  return <button type="button" onClick={toggleTheme} aria-label={dark ? "Use light theme" : "Use dark theme"} title={dark ? "Use light theme" : "Use dark theme"} className="tf-icon-button"><Icon name={dark ? "sun" : "moon"} className="size-[18px]" /></button>;
}
