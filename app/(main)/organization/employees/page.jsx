import { getOrganizationOverview } from "@/actions/organization";
import { EmployeesClient } from "./_components/employees-client";

export default async function EmployeesPage() {
  const orgData = await getOrganizationOverview();

  return <EmployeesClient initialData={orgData} />;
}
