"use client";
import dynamic from "next/dynamic";

const CampaignCalendar = dynamic(() => import("./CampaignCalendarInner"), {
  ssr: false,
  loading: () => <p className="text-sm text-zinc-500">Loading calendar…</p>,
});
export default CampaignCalendar;
