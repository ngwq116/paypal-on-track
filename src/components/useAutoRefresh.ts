"use client";
import { useRouter } from "next/navigation";
import { useEffect, type RefObject } from "react";

// R6/R14: re-fetch the server data every few seconds, so changes from the other view, a teammate or
// PayPal's webhook show up without a reload. Skipped while paused (a drag in progress) or the tab is hidden.
export function useAutoRefresh(seconds: number, paused: RefObject<boolean>) {
  const router = useRouter();
  useEffect(() => {
    const timer = setInterval(() => {
      if (!paused.current && document.visibilityState === "visible") router.refresh();
    }, seconds * 1000);
    return () => clearInterval(timer);
  }, [router, seconds, paused]);
}
