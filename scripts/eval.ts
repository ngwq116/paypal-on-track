import { readFileSync } from "node:fs";
import { aiFromEnv, aiModel } from "../src/lib/ai/client";
import { readInvoice, toInvoiceFields } from "../src/lib/ai/invoice-reader";
import { compareInvoice } from "../src/lib/domain/invoice-match";
import { parseUsdToCents } from "../src/lib/domain/money";
import { EVAL_CONTRACT, INVOICE_CASES } from "../eval/invoice-cases";

export function pdfFile(path: string) {
  const bytes = readFileSync(path);
  return { name: path.split("/").pop() ?? "file.pdf", type: "application/pdf", size: bytes.length, bytes };
}

// Same path as the app: AI reads, toInvoiceFields gates, compareInvoice decides. A gate refusal counts as a hold.
async function evalInvoices(): Promise<boolean> {
  const ai = aiFromEnv();
  let caught = 0;
  let falseHolds = 0;
  for (const c of INVOICE_CASES) {
    let match = false;
    let detail = "";
    try {
      const { data } = await readInvoice(ai, pdfFile(`eval/files/invoice-${c.id}.pdf`));
      const checked = toInvoiceFields(data);
      if (!checked.ok) detail = checked.reason;
      else {
        const result = compareInvoice(EVAL_CONTRACT, { ...checked.fields, amountCents: parseUsdToCents(checked.fields.amount) ?? 0 });
        match = result.match;
        detail = result.fields.filter((f) => !f.ok).map((f) => `${f.label}: ${f.invoice}`).join("; ");
      }
    } catch (err) {
      detail = `error: ${err instanceof Error ? err.message : String(err)}`;
    }
    if (!c.expectMatch && !match) caught++;
    if (c.expectMatch && !match) falseHolds++;
    const verdict = match === c.expectMatch ? "PASS" : "FAIL";
    console.log(`${verdict}  ${c.id.padEnd(16)} expected ${c.expectMatch ? "match" : "hold "}  got ${match ? "match" : "hold "}  ${detail}`);
  }
  const bad = INVOICE_CASES.filter((c) => !c.expectMatch).length;
  const good = INVOICE_CASES.length - bad;
  console.log(`\nInvoices (${aiModel()}): mismatches caught ${caught}/${bad} (target ${bad}/${bad}), false holds ${falseHolds}/${good} (target 0)\n`);
  return caught === bad && falseHolds === 0;
}

async function main() {
  const invoicesOk = await evalInvoices();
  process.exit(invoicesOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
