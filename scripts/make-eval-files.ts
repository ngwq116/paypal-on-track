import { mkdirSync, writeFileSync } from "node:fs";
import { INVOICE_CASES } from "../eval/invoice-cases";
import { textPdf } from "./pdf-text";

async function main() {
  mkdirSync("eval/files", { recursive: true });
  for (const c of INVOICE_CASES) writeFileSync(`eval/files/invoice-${c.id}.pdf`, await textPdf(c.lines));
  console.log(`Wrote ${INVOICE_CASES.length} invoices to eval/files`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
