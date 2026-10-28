import { readFileSync } from "node:fs";
import { aiFromEnv, aiModel } from "../src/lib/ai/client";
import { readContract } from "../src/lib/ai/contract-reader";
import { readInvoice, toInvoiceFields } from "../src/lib/ai/invoice-reader";
import type { ContractReading } from "../src/lib/domain/contract";
import { compareInvoice } from "../src/lib/domain/invoice-match";
import { parseUsdToCents } from "../src/lib/domain/money";
import { CONTRACT_CASES } from "../eval/contract-cases";
import { EVAL_CONTRACT, INVOICE_CASES } from "../eval/invoice-cases";

export function pdfFile(path: string) {
  const bytes = readFileSync(path);
  return { name: path.split("/").pop() ?? "file.pdf", type: "application/pdf", size: bytes.length, bytes };
}

// Wall-clock time per AI read (successful reads only), shown as seconds.
const secs = (ms: number | undefined) => (ms === undefined ? "  -  " : `${(ms / 1000).toFixed(1)}s`.padStart(5));
const latency = (ms: number[]) => {
  if (!ms.length) return "no successful reads";
  const sorted = [...ms].sort((a, b) => a - b);
  return `latency median ${secs(sorted[Math.floor(sorted.length / 2)]).trim()}, max ${secs(sorted.at(-1)).trim()}`;
};

// Same path as the app: AI reads, toInvoiceFields gates, compareInvoice decides. A gate refusal counts as a hold.
async function evalInvoices(): Promise<boolean> {
  const ai = aiFromEnv();
  let caught = 0;
  let falseHolds = 0;
  const ms: number[] = [];
  for (const c of INVOICE_CASES) {
    let match = false;
    let detail = "";
    const t0 = performance.now();
    let took: number | undefined;
    try {
      const { data } = await readInvoice(ai, pdfFile(`eval/files/invoice-${c.id}.pdf`));
      took = performance.now() - t0;
      ms.push(took);
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
    console.log(`${verdict}  ${c.id.padEnd(16)} ${secs(took)}  expected ${c.expectMatch ? "match" : "hold "}  got ${match ? "match" : "hold "}  ${detail}`);
  }
  const bad = INVOICE_CASES.filter((c) => !c.expectMatch).length;
  const good = INVOICE_CASES.length - bad;
  console.log(`\nInvoices (${aiModel()}): mismatches caught ${caught}/${bad} (target ${bad}/${bad}), false holds ${falseHolds}/${good} (target 0), ${latency(ms)}\n`);
  return caught === bad && falseHolds === 0;
}

// Field-by-field: amounts compared as cents, hashtags as a set, text ignoring case and spaces.
function contractDiffs(expected: ContractReading, got: ContractReading): string[] {
  const norm = (s: string) => s.replace(/×/g, "x").replace(/\s+/g, " ").trim().toLowerCase();
  const same = (key: string, a: string, b: string) => {
    if (/fee|amount/i.test(key)) return parseUsdToCents(a) === parseUsdToCents(b);
    if (key === "hashtags") return norm(a).split(" ").sort().join(" ") === norm(b).split(" ").sort().join(" ");
    return norm(a) === norm(b);
  };
  const diffs: string[] = [];
  const { creators: ec, ...eTop } = expected;
  const { creators: gc, ...gTop } = got;
  for (const [k, v] of Object.entries(eTop)) if (!same(k, v, String(gTop[k as keyof typeof gTop] ?? ""))) diffs.push(`${k}: ${gTop[k as keyof typeof gTop]}`);
  if (gc.length !== ec.length) diffs.push(`creators: ${gc.length} found, ${ec.length} expected`);
  ec.forEach((e, i) => {
    const g = gc[i];
    if (!g) return;
    for (const [k, v] of Object.entries(e)) if (!same(k, v, String(g[k as keyof typeof g] ?? ""))) diffs.push(`creator ${i + 1} ${k}: ${g[k as keyof typeof g]}`);
  });
  return diffs;
}

async function evalContracts(): Promise<boolean> {
  const ai = aiFromEnv();
  let perfect = 0;
  const ms: number[] = [];
  for (const c of CONTRACT_CASES) {
    let diffs: string[];
    const t0 = performance.now();
    let took: number | undefined;
    try {
      const { data } = await readContract(ai, pdfFile(`eval/files/contract-${c.id}.pdf`));
      took = performance.now() - t0;
      ms.push(took);
      diffs = contractDiffs(c.expected, data);
    } catch (err) {
      diffs = [`error: ${err instanceof Error ? err.message : String(err)}`];
    }
    if (!diffs.length) perfect++;
    console.log(`${diffs.length ? "FAIL" : "PASS"}  ${c.id.padEnd(12)} ${secs(took)}  ${diffs.join("; ")}`);
  }
  console.log(`\nContracts (${aiModel()}): every field correct on ${perfect}/${CONTRACT_CASES.length} (target ${CONTRACT_CASES.length}/${CONTRACT_CASES.length}), ${latency(ms)}\n`);
  return perfect === CONTRACT_CASES.length;
}

async function main() {
  const invoicesOk = await evalInvoices();
  const contractsOk = await evalContracts();
  process.exit(invoicesOk && contractsOk ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
