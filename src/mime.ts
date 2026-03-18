import path from "node:path";

export type MediaModality = "image" | "video" | "audio" | "pdf";

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".mp4": "video/mp4",
  ".mov": "video/quicktime",
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".m4a": "audio/mp4",
  ".flac": "audio/flac",
  ".pdf": "application/pdf"
};

export function inferMimeType(source: string, hinted?: string): string | null {
  if (hinted && hinted.trim()) {
    return hinted.split(";")[0].trim().toLowerCase();
  }
  const ext = path.extname(source).toLowerCase();
  return MIME_BY_EXT[ext] || null;
}

export function modalityFromMimeType(mimeType: string): MediaModality | null {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (mimeType === "application/pdf") return "pdf";
  return null;
}

export function extensionFromMimeType(mimeType: string): string {
  for (const [ext, candidate] of Object.entries(MIME_BY_EXT)) {
    if (candidate === mimeType) return ext;
  }
  return ".bin";
}
