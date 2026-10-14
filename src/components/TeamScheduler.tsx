"use client";
import dynamic from "next/dynamic";

const TeamScheduler = dynamic(() => import("./TeamSchedulerInner"), {
  ssr: false,
  loading: () => <p className="text-sm text-zinc-500">Loading timeline…</p>,
});
export default TeamScheduler;
