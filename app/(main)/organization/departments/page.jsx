import { getOrganizationOverview } from "@/actions/organization";
import { DepartmentsClient } from "./_components/departments-client";

export default async function DepartmentsPage() {
  const orgData = await getOrganizationOverview();

  return <DepartmentsClient initialData={orgData} />;
}
