"use client";
import { useCallback, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { DateHelper } from "@bryntum/calendar";
import { BryntumCalendar } from "@bryntum/calendar-react";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/stockholm-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";
import { moveAssignment } from "@/app/campaigns/[id]/view-actions";
import EventPanel from "./EventPanel";
import { useAutoRefresh } from "./useAutoRefresh";
import { getActor } from "./actor-cookie";

export default function CampaignCalendarInner(props: { resources: TimelineResource[]; events: TimelineEvent[]; date: string }) {
  const dragging = useRef(false); // true while a drag is in progress: pauses the refresh
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = props.events.find((e) => e.id === selectedId); // looked up each render, so the panel stays fresh
  useAutoRefresh(3, dragging);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

  // The server's dates always win: after any drop, refresh; a refused move snaps back.
  async function save(eventId: string, start: Date) {
    const r = await moveAssignment(eventId, DateHelper.format(start, "YYYY-MM-DD"), getActor());
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
      <div className="h-[760px] overflow-hidden rounded-[10px] border border-zinc-200">
        <BryntumCalendar
          date={props.date}
          mode="month"
          modes={{ year: false, agenda: false }}
          sidebar={null}
          weekStartDay={1}
          resources={props.resources}
          events={props.events}
          // Only posts and deliverables move (each event's `draggable`). No editing, creating or menus.
          eventEditFeature={false}
          eventMenuFeature={false}
          scheduleMenuFeature={false}
          dragFeature={{ creatable: false }}
          onBeforeDragMove={() => {
            dragging.current = true;
          }}
          onBeforeDragMoveEnd={({ eventRecord, newStartDate }) => {
            void save(String(eventRecord.id), newStartDate);
          }}
          onDragMoveEnd={() => {
            dragging.current = false;
          }}
          // Our EventPanel shows the details (R18); Bryntum's own popup would duplicate it with an edit button.
          eventTooltipFeature={false}
          onEventClick={({ eventRecord }) => setSelectedId(String(eventRecord.id))}
        />
      </div>
      <EventPanel event={selected} onClose={close} />
    </>
  );
}
