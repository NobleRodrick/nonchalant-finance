/**
 * What the venue pages share: the hall, the packages offered and the department's heads (the
 * booking form needs them), read in parallel.
 */
import { departmentTeam } from "@/lib/departments/team";
import { hallOf } from "./hall-service";
import { venuePackages } from "./package-queries";

export async function venueFormData(departmentId) {
  const [hall, packages, heads] = await Promise.all([hallOf(departmentId), venuePackages(departmentId), departmentTeam(departmentId)]);
  return { hall, packages, heads };
}
