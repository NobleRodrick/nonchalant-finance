/**
 * Customers of a department (event venue clients, event rental customers, tenants …): one table
 * (venue_clients) scoped to the department. Run inside the caller's operation transaction.
 */
import { recordAudit } from "@/lib/audit";
import { invalid, notFound } from "@/lib/errors";

const text = (v, max = 2000) => String(v ?? "").trim().slice(0, max) || null;

export function clientFields(input) {
  const name = text(input?.name, 120);
  if (!name || name.length < 2) throw invalid("Enter the customer's name.");
  const email = text(input.email, 160);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw invalid("The e-mail address does not look right.");
  return {
    name,
    phone: text(input.phone, 40),
    phoneAlt: text(input.phoneAlt, 40),
    email,
    company: text(input.company, 120),
    address: text(input.address, 300),
    notes: text(input.notes, 1000),
    // Tenants (property rental): ID card, passport or company registration, as given.
    ...(input.identification !== undefined ? { identification: text(input.identification, 120) } : {}),
  };
}

/**
 * The customer of a booking: an existing one (`clientId`), or a new one (`client`). A new
 * customer with the name and phone of an existing one is that customer.
 */
export async function resolveClient(tx, { user, department }, { clientId, client }) {
  if (clientId) {
    const found = await tx.venueClient.findFirst({ where: { id: clientId, departmentId: department.id } });
    if (!found) throw notFound("Customer not found in this department.");
    return found;
  }
  const data = clientFields(client);
  if (data.phone) {
    const same = await tx.venueClient.findFirst({ where: { departmentId: department.id, phone: data.phone, name: { equals: data.name, mode: "insensitive" } } });
    if (same) return same;
  }
  const created = await tx.venueClient.create({ data: { ...data, organizationId: user.organizationId, departmentId: department.id } });
  await recordAudit(tx, { user, departmentId: department.id, action: "CLIENT_CREATED", entityType: "VenueClient", entityId: created.id, after: data });
  return created;
}

/** Adds a customer, or changes one's details. */
export async function saveClient(tx, ctx, input) {
  if (!input?.id) {
    const c = await resolveClient(tx, ctx, { client: input });
    return { clientId: c.id, name: c.name };
  }
  const existing = await tx.venueClient.findFirst({ where: { id: input.id, departmentId: ctx.department.id } });
  if (!existing) throw notFound("Customer not found in this department.");
  const data = clientFields(input);
  const c = await tx.venueClient.update({ where: { id: existing.id }, data });
  await recordAudit(tx, { user: ctx.user, departmentId: ctx.department.id, action: "CLIENT_UPDATED", entityType: "VenueClient", entityId: c.id, before: clientFields(existing), after: data });
  return { clientId: c.id, name: c.name };
}
