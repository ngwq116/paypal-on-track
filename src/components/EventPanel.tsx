"use client";
import { useEffect } from "react";
import { buttonVariants } from "@/components/ui/button";
import type { TimelineEvent } from "@/lib/events";

// R18: details of the clicked event, with links to where its actions live. No dialog: a panel beside the view.
export default function EventPanel({ event, onClose }: { event: TimelineEvent | undefined; onClose: () => void }) {
  useEffect(() => {
    if (!event) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [event, onClose]);

  if (!event) return null;
  return (
    <aside
      aria-label="Event details"
      className="fixed inset-x-0 bottom-0 z-30 max-h-[60vh] overflow-y-auto border-t border-zinc-200 bg-white p-5 shadow-lg sm:inset-y-0 sm:right-0 sm:left-auto sm:max-h-none sm:w-[360px] sm:border-t-0 sm:border-l"
    >
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">{event.panel.title}</h2>
        <button type="button" onClick={onClose} className={buttonVariants({ variant: "ghost", size: "sm" })}>
          Close
        </button>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5 text-sm text-zinc-700">
        {event.panel.lines.map((line) => (
          <li key={line}>{line}</li>
        ))}
      </ul>
      <div className="mt-5 flex flex-col gap-2">
        {event.panel.links.map((l) => (
          <a key={l.href + l.label} href={l.href} className={buttonVariants({ variant: "outline", size: "sm" })}>
            {l.label}
          </a>
        ))}
      </div>
    </aside>
  );
}
