"use client";
import { useEffect, useState } from "react";

// True while the component is on screen. Next.js (cacheComponents) keeps a page you navigated away from
// hidden but mounted, so Back/Forward can restore it: React runs effect cleanups (the Bryntum wrapper
// destroys its widget) yet keeps re-rendering the hidden tree. The Bryntum wrappers then apply props to a
// destroyed widget and crash ("reading 'eventDrag'"). Render Bryntum only while shown, so it is
// unmounted when hidden and created fresh when the page is shown again.
export function useShown(): boolean {
  const [shown, setShown] = useState(false);
  useEffect(() => {
    setShown(true);
    return () => setShown(false);
  }, []);
  return shown;
}
