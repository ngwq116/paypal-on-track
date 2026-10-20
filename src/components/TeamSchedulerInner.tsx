"use client";
import { useCallback, useRef, useState } from "react";
import { DateHelper, StringHelper } from "@bryntum/scheduler";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/stockholm-light.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";
import EventPanel from "./EventPanel";
import { useAutoRefresh } from "./useAutoRefresh";

export default function TeamSchedulerInner(props: {
  resources: TimelineResource[];
  events: TimelineEvent[];
  startDate: string;
  endDate: string;
}) {
  const dragging = useRef(false); // Task 8 sets it during a drag
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = props.events.find((e) => e.id === selectedId); // looked up each render, so the panel stays fresh
  useAutoRefresh(3, dragging);

  return (
    <>
      {/* autoHeight sizes the grid to its rows, so the parent doesn't need a fixed height. */}
      <div className="overflow-hidden rounded-[10px] border border-zinc-200">
        <BryntumScheduler
          autoHeight
          // Fit the whole date range to the width (the prototype shows 14 days without scrolling).
          forceFit
          resources={props.resources}
          events={props.events}
          startDate={props.startDate}
          endDate={props.endDate}
          viewPreset="dayAndWeek"
          rowHeight={64}
          barMargin={6}
          eventStyle="tonal"
          // Chips are one day wide: show the short label; hovering shows the full name. Encoded because the result is HTML.
          // One-day items: show the full name and the date, not "12 AM – 12 AM next day".
          eventTooltipFeature={{
            template: ({ eventRecord }: { eventRecord: { name: string; startDate: Date } }) =>
              `<strong>${StringHelper.encodeHtml(eventRecord.name)}</strong><div>${DateHelper.format(eventRecord.startDate, "ddd, MMM D")}</div>`,
          }}
          eventRenderer={({ eventRecord }) => StringHelper.encodeHtml(String(eventRecord.get("shortName") ?? eventRecord.name))}
          // Read-only until drag-to-reschedule saves through PATCH /api/assignments/{id}; a drop now would be lost on reload.
          readOnly
          onEventClick={({ eventRecord }) => setSelectedId(String(eventRecord.id))}
          columns={[{ text: "Creator", field: "name", width: 220 }]}
        />
      </div>
      <EventPanel event={selected} onClose={close} />
    </>
  );
}
