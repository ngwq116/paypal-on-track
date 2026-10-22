// R20: where the campaign's money stands. Owed = each unpaid assignment's payout amount (or its fee if no payout yet).
export function campaignSummary(input: {
  invoices: Array<{ amountCents: number; status: "draft" | "sent" | "paid" }>;
  assignments: Array<{ id: string; feeCents: number }>;
  payouts: Array<{ assignmentId: string; amountCents: number; status: string }>;
}) {
  const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
  const payoutOf = new Map(input.payouts.map((p) => [p.assignmentId, p]));
  const contractCents = sum(input.invoices.map((i) => i.amountCents));
  const billedCents = sum(input.invoices.filter((i) => i.status !== "draft").map((i) => i.amountCents));
  const receivedCents = sum(input.invoices.filter((i) => i.status === "paid").map((i) => i.amountCents));
  const paidOutCents = sum(input.payouts.filter((p) => p.status === "paid").map((p) => p.amountCents));
  const owedCents = sum(
    input.assignments.map((a) => {
      const p = payoutOf.get(a.id);
      if (!p) return a.feeCents;
      return p.status === "paid" ? 0 : p.amountCents;
    }),
  );
  return { contractCents, billedCents, receivedCents, paidOutCents, owedCents, marginCents: contractCents - paidOutCents - owedCents };
}
