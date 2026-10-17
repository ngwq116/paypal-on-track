export interface UploadedFile {
    name: string;
    type: string;
    size: number;
    bytes: Buffer;
}

export const MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp"] as const;
export const INVOICE_TYPES = ["application/pdf", ...IMAGE_TYPES] as const;

// Allow-list only: these files are served back to the browser later, so SVG/HTML must never get in.
export function checkUpload(file: UploadedFile, allowed: readonly string[]): string | null {
  if (!allowed.includes(file.type)) {
    return allowed.includes("application/pdf") ? "Upload a PDF, PNG, JPEG or WebP file" : "Upload a PNG, JPEG or WebP image";
  }
  if (file.size === 0) return "The file is empty";
  if (file.size > MAX_UPLOAD_BYTES) return "The file is larger than 4 MB";
  return null;
}

