import { seedDemo, seedEmails, type SeedMode } from "../src/lib/demo/seed";

async function main() {
  const arg = process.argv[2];
  const mode: SeedMode = arg === "roster" || arg === "fresh" ? arg : "mid";
  const id = await seedDemo(mode, seedEmails());
  console.log(id ? `Seeded ${mode === "fresh" ? "fresh" : "mid-campaign"} campaign ${id}` : "Seeded roster only: upload eval/files/contract-kopi-kita.pdf at /campaigns/new");
  process.exit(0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
