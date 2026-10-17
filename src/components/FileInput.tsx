"use client";
import { MAX_UPLOAD_BYTES } from "@/lib/domain/upload";

// Stops an oversized file in the browser. Without this, a file over the Server Action body limit
// never reaches our checkUpload() and the page crashes instead of showing a notice.
// The server still checks size and type (checkUpload); this is only for a friendly, early message.
export default function FileInput(props: { name: string; accept: string; className?: string }) {
  return (
    <input
      type="file"
      required
      {...props}
      onChange={(e) => {
        const input = e.currentTarget;
        const file = input.files?.[0];
        input.setCustomValidity(file && file.size > MAX_UPLOAD_BYTES ? "The file is larger than 4 MB. Choose a smaller one." : "");
        input.reportValidity();
      }}
    />
  );
}
