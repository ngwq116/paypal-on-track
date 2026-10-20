"use client";
import { useCallback, useRef, useState } from "react";
import { BryntumCalendar } from "@bryntum/calendar-react";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/stockholm-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";
import EventPanel from "./EventPanel";
import { useAutoRefresh } from "./useAutoRefresh";

export default function CampaignCalendarInner(props: { resources: TimelineResource[]; events: TimelineEvent[]; date: string }) {
  const dragging = useRef(false); // Task 8 sets it during a drag
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const close = useCallback(() => setSelectedId(null), []);
  const selected = props.events.find((e) => e.id === selectedId); // looked up each render, so the panel stays fresh
  useAutoRefresh(3, dragging);

  return (
    <>
      <div className="h-[760px] overflow-hidden rounded-[10px] border border-zinc-200">
        <BryntumCalendar
          date={props.date}
          mode="month"
          modes={{ year: false, agenda: false }}
          sidebar={null}
          weekStartDay={1}
          resources={props.resources}
          events={props.events}
          // Read-only until drag-to-reschedule saves through the API (see TeamSchedulerInner).
          readOnly
          // Our EventPanel shows the details (R18); Bryntum's own popup would duplicate it with an edit button.
          eventTooltipFeature={false}
          onEventClick={({ eventRecord }) => setSelectedId(String(eventRecord.id))}
        />
      </div>
      <EventPanel event={selected} onClose={close} />
    </>
  );
}
