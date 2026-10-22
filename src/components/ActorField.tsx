"use client";
import { useActor } from "./actor-cookie";

// Every form sends who is acting; the top-bar picker sets it.
export default function ActorField() {
  return <input type="hidden" name="actor" value={useActor()} />;
}
