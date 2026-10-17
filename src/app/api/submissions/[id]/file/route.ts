import { eq } from "drizzle-orm";
import { db, schema } from "@/db";
import { isUuid } from "@/lib/uuid";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!isUuid(id)) return new Response("Not found", { status: 404 });
  const [s] = await db
    .select({ file: schema.submissions.file, fileType: schema.submissions.fileType, fileName: schema.submissions.fileName })
    .from(schema.submissions)
    .where(eq(schema.submissions.id, id));
  if (!s) return new Response("Not found", { status: 404 });
  // fileType was allow-listed at upload (no SVG/HTML); nosniff stops the browser guessing otherwise.
  return new Response(new Uint8Array(s.file), {
    headers: {
      "Content-Type": s.fileType,
      "Content-Disposition": `inline; filename="${s.fileName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
