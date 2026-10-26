import { formatRange } from "@/lib/domain/format";


const LEGEND: Array<[string, string]> = [
  ["Post", "bg-violet-200"],
  ["Deliverable", "bg-orange-200"],
  ["Client invoice", "bg-blue-200"],
  ["Awaiting approval", "bg-amber-200"],
  ["Scheduled", "bg-lime-200"],
  ["Paid", "bg-green-700"],
  ["Held", "bg-red-200"],
];

export default function CampaignHeader(props: {
  campaign: { id: string; name: string; startDate: string; endDate: string; currency: string };
  clientName: string;
  active: "team" | "calendar";
}) {
  const { campaign, clientName, active } = props;
  // Plain <a>, not next/link: each view loads a different Bryntum bundle, so switching must be a full page load.
  const tab = (key: "team" | "calendar", label: string) => (
    <a
      href={`/campaigns/${campaign.id}/${key}`}
      role="tab"
      aria-selected={active === key}
      className={
        "inline-flex min-h-8 items-center rounded-md px-3.5 text-sm font-medium " +
        (active === key ? "bg-white text-zinc-950 shadow-sm" : "text-zinc-600 hover:text-zinc-950")
      }
    >
      {label}
    </a>
  );

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-col gap-1.5">
        <nav aria-label="Breadcrumb" className="flex gap-1.5 text-[13px] text-zinc-500">
          <a href="/" className="hover:text-zinc-950">Campaigns</a>
          <span aria-hidden="true">/</span>
          <span className="text-zinc-950">{campaign.name}</span>
        </nav>
        <h1 className="text-[26px] font-semibold tracking-tight">{campaign.name}</h1>
        <p className="text-sm text-zinc-500">
          {clientName} · {formatRange(campaign.startDate, campaign.endDate)} · {campaign.currency}
        </p>
        <a href={`/campaigns/${campaign.id}/audit`} className="self-start text-[13px] text-zinc-500 underline-offset-4 hover:text-zinc-950 hover:underline">
          Audit log
        </a>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="tablist" aria-label="View" className="inline-flex gap-1 rounded-lg bg-zinc-100 p-1">
          {tab("team", "Team")}
          {tab("calendar", "Calendar")}
        </div>
        <ul className="flex flex-wrap gap-x-3.5 gap-y-1.5 text-xs text-zinc-600">
          {LEGEND.map(([label, swatch]) => (
            <li key={label} className="inline-flex items-center gap-1.5">
              <span className={`size-2.5 rounded-[3px] ${swatch}`} aria-hidden="true" />
              {label}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
