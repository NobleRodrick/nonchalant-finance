import { createHash } from "node:crypto";
import { invalid } from "@/lib/errors";

export const MAX_ATTACHMENT_BYTES = 4 * 1024 * 1024; // 4 MB (Vercel refuses requests above 4.5 MB)
export const ALLOWED_ATTACHMENT_TYPES = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "application/pdf": "pdf",
};

function sniffMime(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) return "image/png";
  if (bytes.length >= 12 && String.fromCharCode(...bytes.slice(0, 4)) === "RIFF" && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP") return "image/webp";
  if (bytes.length >= 4 && String.fromCharCode(...bytes.slice(0, 4)) === "%PDF") return "application/pdf";
  return null;
}

/**
 * Validates an uploaded proof file (type by content, not just by extension; size limit).
 * Returns { fileName, mimeType, sizeBytes, sha256, data }.
 */
export async function readValidatedFile(file) {
  if (!file || typeof file.arrayBuffer !== "function") throw invalid("No file received.");
  if (file.size > MAX_ATTACHMENT_BYTES) throw invalid("File is larger than 4 MB. Take a smaller photo.");
  if (file.size === 0) throw invalid("File is empty.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const detected = sniffMime(bytes);
  if (!detected || !ALLOWED_ATTACHMENT_TYPES[detected]) {
    throw invalid("Only JPEG, PNG, WebP images or PDF files are accepted.");
  }
  const safeName = String(file.name || `proof.${ALLOWED_ATTACHMENT_TYPES[detected]}`)
    .replace(/[^\w.\- ]+/g, "_")
    .slice(0, 120);
  return {
    fileName: safeName,
    mimeType: detected,
    sizeBytes: bytes.length,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    data: Buffer.from(bytes),
  };
}

/**
 * Links previously uploaded (still unlinked) attachments to an entity. Only the
 * uploader's own files in the same organization can be linked.
 */
export async function linkAttachments(client, { user, attachmentIds, entityType, entityId, departmentId }) {
  const ids = Array.isArray(attachmentIds) ? attachmentIds.filter(Boolean).slice(0, 10) : [];
  if (!ids.length) return 0;
  const res = await client.attachment.updateMany({
    where: {
      id: { in: ids },
      organizationId: user.organizationId,
      uploadedById: user.id,
      entityId: null,
    },
    data: { entityType, entityId, departmentId: departmentId || null },
  });
  return res.count;
}

export function attachmentUrl(id) {
  return `/api/attachments/${id}`;
}
