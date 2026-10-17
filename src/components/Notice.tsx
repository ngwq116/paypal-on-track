export default function Notice({ text }: { text?: string }) {
  if (!text) return null;
  return (
    <p role="status" className="rounded-lg border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-700">
      {text}
    </p>
  );
}
