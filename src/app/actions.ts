"use server";
import { redirect } from "next/navigation";
import { demoResetEnabled, seedDemo, seedEmails, type SeedMode } from "@/lib/demo/seed";
import { actorFrom, backTo, text } from "@/lib/form";

// Wipes everything and reloads the demo data. Off unless DEMO_RESET=1; needs the confirm tick.
export async function resetDemo(form: FormData) {
  if (!demoResetEnabled()) backTo("/", "Reset demo is turned off on this machine");
  if (text(form, "confirm") !== "yes") backTo("/", "Tick the box to confirm the reset");
  actorFrom(form); // only staff can reset
  const mode: SeedMode = text(form, "mode") === "fresh" ? "fresh" : text(form, "mode") === "mid" ? "mid" : "roster";
  const id = await seedDemo(mode, seedEmails());
  redirect(id ? `/campaigns/${id}/team` : "/campaigns/new");
}
