import { connection } from "next/server";
import { resetDemo } from "@/app/actions";
import ActorField from "@/components/ActorField";
import { buttonVariants } from "@/components/ui/button";
import { demoResetEnabled } from "@/lib/demo/seed";

// Read DEMO_RESET per request, not at build time.
export default async function ResetDemoForm() {
  await connection();
  if (!demoResetEnabled()) return null;
  return (
    <form action={resetDemo} className="mt-6 flex flex-wrap items-center gap-3 rounded-[10px] border border-zinc-200 p-4 text-sm">
      <strong className="font-semibold">Reset demo</strong>
      <select name="mode" defaultValue="roster" className="min-h-9 rounded-md border border-zinc-200 bg-white px-2">
        <option value="roster">Start of demo (upload the contract)</option>
        <option value="fresh">Campaign created, deposit not sent</option>
        <option value="mid">Mid-campaign</option>
      </select>
      <label className="inline-flex items-center gap-2 text-zinc-600">
        <input type="checkbox" name="confirm" value="yes" required className="size-4 accent-zinc-900" />
        Delete all data and reload the demo
      </label>
      <ActorField />
      <button className={buttonVariants({ variant: "outline", size: "sm" })}>Reset</button>
    </form>
  );
}
