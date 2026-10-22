"use client";
import { useSyncExternalStore } from "react";
import { STAFF, isStaff } from "@/lib/staff";

// No login yet: who is acting is a per-browser choice, kept in a cookie. The server re-checks the name (actorFrom).
const COOKIE = "ontrack_actor";
const EVENT = "ontrack:actor";

export function getActor(): string {
  const match = document.cookie.match(/(?:^|; )ontrack_actor=([^;]*)/);
  const name = match ? decodeURIComponent(match[1]) : "";
  return isStaff(name) ? name : STAFF[0];
}

export function setActor(name: string) {
  document.cookie = `${COOKIE}=${encodeURIComponent(name)}; path=/; max-age=31536000; samesite=lax`;
  window.dispatchEvent(new Event(EVENT));
}

function subscribe(onChange: () => void) {
  window.addEventListener(EVENT, onChange);
  return () => window.removeEventListener(EVENT, onChange);
}

export const useActor = (): string => useSyncExternalStore(subscribe, getActor, () => STAFF[0]);
