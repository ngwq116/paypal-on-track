"use client";
import { useEffect } from "react";

// Keeps #id in view while the page above it is still growing (the Bryntum timeline renders after
// the browser's own jump to the hash). Stops as soon as the person scrolls themselves, or after 4 s.
export default function ScrollToHash({ id }: { id: string }) {
  useEffect(() => {
    if (window.location.hash !== `#${id}`) return;
    const target = document.getElementById(id);
    if (!target) return;
    // Re-check every 150 ms: jump back whenever content above has pushed the target down.
    const jump = () => {
      if (Math.abs(target.getBoundingClientRect().top) > 4) target.scrollIntoView({ block: "start" });
    };
    jump();
    const timer = setInterval(jump, 150);
    const stop = () => {
      clearInterval(timer);
      window.removeEventListener("wheel", stop);
      window.removeEventListener("touchstart", stop);
      window.removeEventListener("keydown", stop);
    };
    window.addEventListener("wheel", stop, { passive: true });
    window.addEventListener("touchstart", stop, { passive: true });
    window.addEventListener("keydown", stop);
    const done = setTimeout(stop, 4000);
    return () => {
      clearTimeout(done);
      stop();
    };
  }, [id]);
  return null;
}
