import { PDFDocument, StandardFonts } from "pdf-lib";

// A plain one-column PDF: "# " lines are bold headings. Enough to look like a simple invoice or contract.
export async function textPdf(lines: string[]): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  // Fixed dates, so regenerating the eval files gives byte-identical PDFs (no git noise).
  const fixed = new Date("2026-10-01T00:00:00Z");
  doc.setCreationDate(fixed);
  doc.setModificationDate(fixed);
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  let page = doc.addPage([595, 842]);
  let y = 790;
  for (const raw of lines) {
    const heading = raw.startsWith("# ");
    const text = heading ? raw.slice(2) : raw;
    if (y < 60) {
      page = doc.addPage([595, 842]);
      y = 790;
    }
    if (text) page.drawText(text, { x: 56, y, size: heading ? 14 : 10.5, font: heading ? bold : font });
    y -= heading ? 24 : 16;
  }
  return doc.save();
}
