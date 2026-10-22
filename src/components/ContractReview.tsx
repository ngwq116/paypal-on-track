"use client";
import { useState, type ChangeEvent } from "react";
import { confirmContractAction } from "@/app/contracts/[id]/actions";
import ActorField from "@/components/ActorField";
import SubmitButton from "@/components/SubmitButton";
import { buttonVariants } from "@/components/ui/button";
import { contractTotals, parseContractForm, type ContractForm, type CreatorLine, type RosterCreator } from "@/lib/domain/contract";
import { formatUsd } from "@/lib/domain/money";

const inputCls = "min-h-9 w-full rounded-md border border-zinc-200 bg-white px-2.5 text-sm font-normal text-zinc-950 disabled:bg-zinc-50 disabled:text-zinc-500";
const labelCls = "flex flex-col gap-1 text-xs font-medium text-zinc-600";
const section = "flex flex-col gap-3 rounded-[10px] border border-zinc-200 p-4";
const BLANK: CreatorLine = {
  creatorId: "", name: "", type: "influencer", detail: "", paypalEmail: "", deliverable: "", fee: "",
  dueDate: "", payoutDate: "", brandTag: "", hashtags: "", windowStart: "", windowEnd: "",
};

function Field(props: { label: string; value: string; onChange: (v: string) => void; type?: string; disabled?: boolean; placeholder?: string }) {
  return (
    <label className={labelCls}>
      {props.label}
      <input
        className={inputCls}
        type={props.type ?? "text"}
        value={props.value}
        placeholder={props.placeholder}
        disabled={props.disabled}
        onChange={(e: ChangeEvent<HTMLInputElement>) => props.onChange(e.target.value)}
      />
    </label>
  );
}

// R2: every extracted field is editable; totals and margin update as you type. The server validates again on confirm.
export default function ContractReview({ contractId, initial, roster }: { contractId: string; initial: ContractForm; roster: RosterCreator[] }) {
  const [form, setForm] = useState<ContractForm>(initial);
  const totals = contractTotals(form);
  const check = parseContractForm(form);
  const set = (key: Exclude<keyof ContractForm, "creators">) => (v: string) => setForm({ ...form, [key]: v });
  const setCreator = (i: number, patch: Partial<CreatorLine>) =>
    setForm({ ...form, creators: form.creators.map((c, j) => (j === i ? { ...c, ...patch } : c)) });
  const pickRoster = (i: number, id: string) => {
    const r = roster.find((x) => x.id === id);
    setCreator(i, r ? { creatorId: r.id, name: r.name, type: r.type, detail: r.detail, paypalEmail: r.paypalEmail } : { creatorId: "" });
  };
  const usd = (cents: number | null) => (cents === null ? "—" : formatUsd(cents));

  return (
    <form action={confirmContractAction} className="flex flex-col gap-5">
      <input type="hidden" name="contractId" value={contractId} />
      <input type="hidden" name="form" value={JSON.stringify(form)} />

      <section aria-label="Totals" className="sticky top-2 z-10 flex flex-wrap gap-x-6 gap-y-1 rounded-[10px] border border-zinc-200 bg-white/95 px-4 py-3 text-sm backdrop-blur">
        <span>Client pays <strong className="tabular-nums">{usd(totals.totalCents)}</strong></span>
        <span>Creators cost <strong className="tabular-nums">{formatUsd(totals.creatorCents)}</strong></span>
        <span className={totals.marginCents !== null && totals.marginCents < 0 ? "text-red-700" : ""}>
          Margin <strong className="tabular-nums">{usd(totals.marginCents)}</strong>
        </span>
        <span className={totals.splitOk ? "text-green-700" : "text-amber-800"}>{totals.splitOk ? "Deposit + balance = total" : "Deposit + balance ≠ total"}</span>
      </section>

      <section className={section} aria-label="Campaign and client">
        <h2 className="text-[15px] font-semibold">Campaign and client</h2>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Campaign name" value={form.campaignName} onChange={set("campaignName")} />
          <Field label="Client name" value={form.clientName} onChange={set("clientName")} />
          <Field label="Client billing email" type="email" value={form.clientEmail} onChange={set("clientEmail")} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Start" type="date" value={form.startDate} onChange={set("startDate")} />
            <Field label="End" type="date" value={form.endDate} onChange={set("endDate")} />
          </div>
        </div>
      </section>

      <section className={section} aria-label="Client billing">
        <h2 className="text-[15px] font-semibold">Client billing (USD)</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Total fee" value={form.totalFee} onChange={set("totalFee")} placeholder="12,000.00" />
          <Field label="Deposit" value={form.depositAmount} onChange={set("depositAmount")} />
          <Field label="Deposit due" type="date" value={form.depositDueDate} onChange={set("depositDueDate")} />
          <span className="hidden sm:block" />
          <Field label="Balance" value={form.balanceAmount} onChange={set("balanceAmount")} />
          <Field label="Balance due" type="date" value={form.balanceDueDate} onChange={set("balanceDueDate")} />
        </div>
      </section>

      <section className={section} aria-label="Creators">
        <h2 className="text-[15px] font-semibold">Creators</h2>
        {form.creators.map((c, i) => {
          const fromRoster = Boolean(c.creatorId);
          return (
            <fieldset key={i} className="flex flex-col gap-3 rounded-lg border border-zinc-200 p-3">
              <legend className="px-1 text-xs font-medium text-zinc-500">Creator {i + 1}</legend>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className={labelCls}>
                  Roster
                  <select className={inputCls} value={c.creatorId} onChange={(e) => pickRoster(i, e.target.value)}>
                    <option value="">New creator</option>
                    {roster.map((r) => (
                      <option key={r.id} value={r.id}>{r.name} · {r.paypalEmail}</option>
                    ))}
                  </select>
                </label>
                <Field label="Name or handle" value={c.name} disabled={fromRoster} onChange={(v) => setCreator(i, { name: v })} />
                <label className={labelCls}>
                  Type
                  <select className={inputCls} value={c.type} disabled={fromRoster} onChange={(e) => setCreator(i, { type: e.target.value as CreatorLine["type"] })}>
                    <option value="influencer">Influencer</option>
                    <option value="freelancer">Freelancer</option>
                  </select>
                </label>
                <Field label="Platform or service" value={c.detail} disabled={fromRoster} onChange={(v) => setCreator(i, { detail: v })} />
                <Field label="PayPal email" type="email" value={c.paypalEmail} disabled={fromRoster} onChange={(v) => setCreator(i, { paypalEmail: v })} />
                <Field label="Deliverable" value={c.deliverable} onChange={(v) => setCreator(i, { deliverable: v })} />
                <Field label="Fee (USD)" value={c.fee} onChange={(v) => setCreator(i, { fee: v })} />
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Due" type="date" value={c.dueDate} onChange={(v) => setCreator(i, { dueDate: v })} />
                  <Field label="Payout date" type="date" value={c.payoutDate} onChange={(v) => setCreator(i, { payoutDate: v })} />
                </div>
                {c.type === "influencer" && (
                  <>
                    <Field label="Brand tag" value={c.brandTag} onChange={(v) => setCreator(i, { brandTag: v })} placeholder="@brand" />
                    <Field label="Hashtags" value={c.hashtags} onChange={(v) => setCreator(i, { hashtags: v })} placeholder="#Campaign #ad" />
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Post from" type="date" value={c.windowStart} onChange={(v) => setCreator(i, { windowStart: v })} />
                      <Field label="Post until" type="date" value={c.windowEnd} onChange={(v) => setCreator(i, { windowEnd: v })} />
                    </div>
                  </>
                )}
              </div>
              <button
                type="button"
                className="self-end text-xs text-zinc-600 underline-offset-4 hover:underline"
                onClick={() => setForm({ ...form, creators: form.creators.filter((_, j) => j !== i) })}
              >
                Remove creator
              </button>
            </fieldset>
          );
        })}
        <button type="button" className={`${buttonVariants({ variant: "outline", size: "sm" })} self-start`} onClick={() => setForm({ ...form, creators: [...form.creators, { ...BLANK }] })}>
          Add creator
        </button>
      </section>

      {!check.ok && (
        <ul role="status" className="flex flex-col gap-1 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          {check.errors.map((e) => (
            <li key={e}>{e}</li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-end gap-3">
        <ActorField />
        <SubmitButton pending="Creating…" className={buttonVariants()}>
          Create campaign
        </SubmitButton>
      </div>
      <p className="text-right text-xs text-zinc-500">Creates the campaign, its creators&apos; deliverables and payout dates, and the deposit and balance invoices as drafts.</p>
    </form>
  );
}
