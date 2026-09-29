import { revalidatePath } from "next/cache";

/** Refreshes every server-rendered page (all operational pages are dynamic). */
export function revalidateOperations() {
  revalidatePath("/", "layout");
}
