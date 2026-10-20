import { getContractFile } from "@/lib/services/contracts";

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const f = await getContractFile(id);
  if (!f) return new Response("Not found", { status: 404 });
  return new Response(new Uint8Array(f.file), {
    headers: {
      "Content-Type": f.fileType, // only application/pdf is accepted at upload
      "Content-Disposition": `inline; filename="${f.fileName.replace(/[^\w.-]/g, "_")}"`,
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
    },
  });
}
