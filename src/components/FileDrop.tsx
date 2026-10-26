"use client";
import { useEffect, useRef, useState } from "react";
import { ImageIcon, Upload, X } from "lucide-react";
import { MAX_UPLOAD_BYTES } from "@/lib/domain/upload";

const kb = (n: number) => (n < 1024 * 1024 ? `${Math.max(1, Math.round(n / 1024))} KB` : `${(n / 1024 / 1024).toFixed(1)} MB`);
const badge = (type: string) => (type === "application/pdf" ? "PDF" : type.split("/")[1]?.toUpperCase() ?? "FILE");

// A drop zone around a real <input type="file">, so the form posts it as before.
// Checks size and type in the browser for a friendly message; the server still runs checkUpload().
export default function FileDrop(props: {
  name: string;
  accept: string;
  title: string;
  hint: string;
  required?: boolean;
  compact?: boolean;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [over, setOver] = useState(false);
  const [preview, setPreview] = useState<string | null>(null);
  const types = props.accept.split(",");

  // Free the last preview URL when the component goes away.
  const previewRef = useRef<string | null>(null);
  useEffect(() => () => {
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
  }, []);

  function check(f: File | undefined) {
    const el = input.current!;
    const problem = !f
      ? null
      : !types.includes(f.type)
        ? `This file type isn't accepted. ${props.hint}.`
        : f.size > MAX_UPLOAD_BYTES
          ? "The file is larger than 4 MB. Choose a smaller one."
          : null;
    el.setCustomValidity(problem ?? "");
    setError(problem);
    setFile(f ?? null);
    if (previewRef.current) URL.revokeObjectURL(previewRef.current);
    previewRef.current = f && !problem && f.type.startsWith("image/") ? URL.createObjectURL(f) : null;
    setPreview(previewRef.current);
  }

  function clear() {
    input.current!.value = "";
    check(undefined);
  }

  const zone = over
    ? "border-zinc-950 bg-zinc-100"
    : error
      ? "border-red-600 bg-red-50"
      : "border-zinc-400 bg-zinc-50 hover:border-zinc-600 hover:bg-zinc-100";

  return (
    <div className="flex flex-col gap-2">
      {/* sr-only, not display:none: the browser can still focus it for "required" */}
      <input
        ref={input}
        id={`file-${props.name}`}
        type="file"
        name={props.name}
        accept={props.accept}
        required={props.required ?? true}
        className="sr-only"
        onChange={(e) => check(e.currentTarget.files?.[0])}
      />
      {file && !error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border-[1.5px] border-zinc-900 bg-white p-3">
          {preview ? (
            // eslint-disable-next-line @next/next/no-img-element -- local preview of the chosen file
            <img src={preview} alt="" className="h-16 w-12 shrink-0 rounded-md border border-zinc-200 object-cover" />
          ) : (
            <span className="grid size-10 shrink-0 place-items-center rounded-[10px] bg-red-100 text-[11px] font-semibold text-red-800">{badge(file.type)}</span>
          )}
          <span className="flex min-w-[160px] flex-1 flex-col gap-0.5">
            <span className="text-sm font-medium break-all">{file.name}</span>
            <span className="text-[13px] font-normal text-zinc-600">{kb(file.size)} · ready</span>
          </span>
          <button type="button" onClick={() => input.current!.click()} className="h-9 rounded-lg border border-zinc-200 bg-white px-3 text-sm font-medium hover:bg-zinc-50">
            Replace
          </button>
          <button type="button" onClick={clear} aria-label="Remove file" className="grid size-9 place-items-center rounded-lg border border-zinc-200 bg-white hover:bg-zinc-50">
            <X className="size-4 text-zinc-700" aria-hidden="true" />
          </button>
        </div>
      ) : (
        <label
          htmlFor={`file-${props.name}`}
          onDragOver={(e) => {
            e.preventDefault();
            setOver(true);
          }}
          onDragLeave={() => setOver(false)}
          onDrop={(e) => {
            e.preventDefault();
            setOver(false);
            const files = e.dataTransfer.files;
            if (!files.length) return;
            input.current!.files = files;
            check(files[0]);
          }}
          className={`flex cursor-pointer rounded-xl border-[1.5px] border-dashed transition-colors ${zone} ${
            props.compact ? "items-center gap-3.5 p-4" : "flex-col items-center gap-2.5 px-6 py-8 text-center"
          }`}
        >
          <span className="grid size-12 shrink-0 place-items-center rounded-xl border border-zinc-200 bg-white">
            {props.accept.startsWith("image/") ? (
              <ImageIcon className="size-[22px] text-zinc-900" aria-hidden="true" />
            ) : (
              <Upload className="size-[22px] text-zinc-900" aria-hidden="true" />
            )}
          </span>
          <span className={`flex flex-col gap-0.5 ${props.compact ? "flex-1" : ""}`}>
            <span className="text-[15px] font-semibold">{over ? "Drop to add" : props.title}</span>
            <span className="text-[13px] font-normal text-zinc-600">
              {props.compact ? "Drop it here or " : "or "}
              <span className="font-medium text-zinc-950 underline underline-offset-4">choose a file</span> · {props.hint}
            </span>
          </span>
        </label>
      )}
      {error && (
        <p role="alert" className="flex items-center justify-between gap-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[13px] text-red-900">
          {error}
          <button type="button" onClick={clear} className="font-medium underline underline-offset-4">Clear</button>
        </p>
      )}
    </div>
  );
}
