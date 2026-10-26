import type { ContractReading } from "../src/lib/domain/contract";

const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
// "2026-10-19" → "19 October 2026": contracts are written for people, the AI must convert back.
const long = (d: string) => {
  const [y, m, day] = d.split("-").map(Number);
  return `${day} ${MONTHS[m - 1]} ${y}`;
};

// One template for every demo contract (the PRD allows a single template).
export function contractLines(c: ContractReading): string[] {
  const lines = [
    "# SERVICES AGREEMENT",
    "Agency: Studio Rakan Sdn Bhd, Kuala Lumpur",
    `Client: ${c.clientName} (billing email: ${c.clientEmail})`,
    `Campaign: ${c.campaignName}`,
    `Campaign period: ${long(c.startDate)} to ${long(c.endDate)}`,
    "",
    "# 1. Fees and payment",
    `Total fee: USD ${c.totalFee}`,
    `Deposit: USD ${c.depositAmount}, due ${long(c.depositDueDate)}`,
    `Balance: USD ${c.balanceAmount}, due ${long(c.balanceDueDate)}`,
    "",
    "# 2. Creators and deliverables",
  ];
  c.creators.forEach((cr, i) => {
    lines.push(
      `2.${i + 1} ${cr.name} (${cr.type}, ${cr.detail})`,
      `      PayPal: ${cr.paypalEmail}`,
      `      Deliverable: ${cr.deliverable}`,
      `      Fee: USD ${cr.fee}`,
      `      Delivery due ${long(cr.dueDate)}; paid on ${long(cr.payoutDate)}`,
    );
    if (cr.type === "influencer") {
      lines.push(`      Brief: tag ${cr.brandTag}; hashtags ${cr.hashtags}`, `      Posting window: ${long(cr.windowStart)} to ${long(cr.windowEnd)}`);
    }
    lines.push("");
  });
  lines.push("# 3. Signatures", "Signed for the Agency: ____________    Signed for the Client: ____________");
  return lines;
}

const influencer = (name: string, detail: string, email: string, deliverable: string, fee: string, due: string, pay: string, tag: string, hashtags: string, from: string, to: string) => ({
  name, type: "influencer" as const, detail, paypalEmail: email, deliverable, fee, dueDate: due, payoutDate: pay, brandTag: tag, hashtags, windowStart: from, windowEnd: to,
});
const freelancer = (name: string, detail: string, email: string, deliverable: string, fee: string, due: string, pay: string) => ({
  name, type: "freelancer" as const, detail, paypalEmail: email, deliverable, fee, dueDate: due, payoutDate: pay, brandTag: "", hashtags: "", windowStart: "", windowEnd: "",
});

export const CONTRACT_CASES: Array<{ id: string; expected: ContractReading }> = [
  {
    id: "kopi-kita", // the demo campaign: names match the seed roster
    expected: {
      campaignName: "Kopi Kita · Pagi Launch",
      clientName: "Kopi Kita Sdn Bhd",
      clientEmail: "finance@kopikita.example",
      startDate: "2026-11-16",
      endDate: "2026-12-18",
      totalFee: "12,000.00",
      depositAmount: "6,000.00",
      depositDueDate: "2026-11-16",
      balanceAmount: "6,000.00",
      balanceDueDate: "2026-12-18",
      creators: [
        influencer("@aina.eats", "Instagram", "aina@example.com", "1 Reel + 2 Stories", "1,500.00", "2026-11-18", "2026-11-20", "@kopikita", "#KopiKitaPagi #ad", "2026-11-17", "2026-11-19"),
        influencer("@jasonlifts", "TikTok", "jason@example.com", "1 TikTok video", "1,200.00", "2026-11-21", "2026-11-26", "@kopikita", "#KopiKitaPagi #ad", "2026-11-20", "2026-11-22"),
        influencer("@mira.travels", "Instagram", "mira@example.com", "1 Reel", "2,000.00", "2026-11-25", "2026-11-27", "@kopikita", "#KopiKitaPagi #ad", "2026-11-24", "2026-11-26"),
        freelancer("Daniel Lim", "Video edits", "daniel.lim@example.com", "2 × 30s product video edits", "1,000.00", "2026-11-24", "2026-11-28"),
      ],
    },
  },
  {
    id: "teh-tarik",
    expected: {
      campaignName: "Teh Tarik · Raya Push",
      clientName: "Teh Tarik Co",
      clientEmail: "billing@tehtarik.example",
      startDate: "2026-11-02",
      endDate: "2026-11-30",
      totalFee: "8,000.00",
      depositAmount: "4,000.00",
      depositDueDate: "2026-11-02",
      balanceAmount: "4,000.00",
      balanceDueDate: "2026-11-30",
      creators: [
        influencer("@sara.sips", "Instagram", "sara@example.com", "1 Reel", "2,500.00", "2026-11-10", "2026-11-13", "@tehtarikco", "#RayaWithTehTarik #ad", "2026-11-09", "2026-11-11"),
        freelancer("Lina Ho", "Photography", "lina@example.com", "10 product photos", "1,500.00", "2026-11-06", "2026-11-09"),
      ],
    },
  },
  {
    id: "glowlab",
    expected: {
      campaignName: "GlowLab · Serum Launch",
      clientName: "GlowLab Beauty Sdn Bhd",
      clientEmail: "ap@glowlab.example",
      startDate: "2026-12-01",
      endDate: "2027-01-15",
      totalFee: "15,500.00",
      depositAmount: "7,750.00",
      depositDueDate: "2026-12-01",
      balanceAmount: "7,750.00",
      balanceDueDate: "2027-01-15",
      creators: [
        influencer("@nadia.glow", "TikTok", "nadia@example.com", "2 TikTok videos", "3,000.00", "2026-12-12", "2026-12-16", "@glowlab.my", "#GlowLabSerum #ad #skincare", "2026-12-10", "2026-12-14"),
        influencer("@kenji.k", "Instagram", "kenji@example.com", "1 Reel + 3 Stories", "2,200.00", "2026-12-20", "2026-12-23", "@glowlab.my", "#GlowLabSerum #ad", "2026-12-18", "2026-12-21"),
        freelancer("Priya Nair", "Copywriting", "priya@example.com", "Launch email + 5 captions", "800.00", "2026-12-05", "2026-12-08"),
      ],
    },
  },
];
