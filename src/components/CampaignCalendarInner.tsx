"use client";
import { BryntumCalendar } from "@bryntum/calendar-react";
import "@bryntum/calendar/calendar.css";
import "@bryntum/calendar/stockholm-light.css";
import "@bryntum/calendar/fontawesome/css/fontawesome.css";
import "@bryntum/calendar/fontawesome/css/solid.css";
import type { TimelineEvent, TimelineResource } from "@/lib/events";

export default function CampaignCalendarInner(props: { resources: TimelineResource[]; events: TimelineEvent[]; date: string }) {
  return (
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
      />
    </div>
  );
}
