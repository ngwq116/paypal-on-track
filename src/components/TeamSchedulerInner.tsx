"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateHelper, StringHelper } from "@bryntum/scheduler";
import { BryntumScheduler } from "@bryntum/scheduler-react";
import "@bryntum/scheduler/scheduler.css";
import "@bryntum/scheduler/stockholm-light.css";
import "@bryntum/scheduler/fontawesome/css/fontawesome.css";
import "@bryntum/scheduler/fontawesome/css/solid.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";
import { moveAssignment } from "@/app/campaigns/[id]/view-actions";
import EventPanel from "./EventPanel";
import { useAutoRefresh } from "./useAutoRefresh";
import { useShown } from "./useShown";

export default function TeamSchedulerInner(props: {
  resources: TimelineResource[];
  events: TimelineEvent[];
  startDate: string;
  endDate: string;
}) {
  const dragging = useRef(false); // true while a drag is in progress: pauses the refresh
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = props.events.find((e) => e.id === selectedId); // looked up each render, so the panel stays fresh
  useAutoRefresh(3, dragging);
  const shown = useShown(); // see useShown: never keep a Bryntum widget mounted on a hidden page
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // The server's dates always win: after any drop, refresh; a refused move snaps back.
  async function save(eventId: string, start: Date) {
    const r = await moveAssignment(eventId, DateHelper.format(start, "YYYY-MM-DD"));
    setError(r.ok ? null : r.reason);
    router.refresh();
  }

  return (
    <>
      {error && (
        <p role="alert" className="rounded-lg border border-red-200 bg-red-50 px-3.5 py-3 text-sm text-red-900">
          {error}
        </p>
      )}
      {/* autoHeight sizes the grid to its rows, so the parent doesn't need a fixed height. */}
      <div className="overflow-hidden rounded-[10px] border border-zinc-200">
        {shown && (
          <BryntumScheduler
            autoHeight
            // About 14 days fit the width (as in the prototype); scroll sideways for the rest of the campaign.
            // Dragging a chip to the edge scrolls the timeline, so it can reach a later date.
            tickSize={70}
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
            // Only posts and deliverables move (each event's `draggable`), only along their own row. No editing, creating or resizing.
            eventDragFeature={{ constrainDragToResource: true }}
            eventEditFeature={false}
            eventDragCreateFeature={false}
            eventResizeFeature={false}
            eventMenuFeature={false}
            scheduleMenuFeature={false}
            cellEditFeature={false}
            onBeforeEventDrag={() => {
              dragging.current = true;
            }}
            onAfterEventDrop={() => {
              dragging.current = false;
            }}
            onEventDrop={({ eventRecords }) => {
              void save(String(eventRecords[0].id), eventRecords[0].startDate as Date);
            }}
            onEventClick={({ eventRecord }) => setSelectedId(String(eventRecord.id))}
            columns={[{ text: "Creator", field: "name", width: 220 }]}
          />
        )}
      </div>
      <EventPanel event={selected} onClose={close} />
    </>
  );
}
