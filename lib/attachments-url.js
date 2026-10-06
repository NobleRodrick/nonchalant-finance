/** The address of an uploaded file (pure: safe for client components). */
export function attachmentUrl(id) {
  return `/api/attachments/${id}`;
}
