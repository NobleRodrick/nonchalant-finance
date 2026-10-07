/**
 * Department types ("business domains"). The type chosen by the Boss when he creates a
 * department decides which modules, money types, dashboard cards and report sections the
 * department gets. Built types have their own definition file (restaurant.js, event-venue.js…);
 * the others can be created and staffed and show a "coming soon" workspace. Adding a type =
 * adding its definition file and listing it here (+ its modules). Pure module: safe for client
 * components.
 */

import { roleAllowed } from "@/lib/permissions";
import { RESTAURANT } from "./restaurant";
import { EVENT_VENUE } from "./event-venue";
import { ROOM_RENTAL } from "./rooms";
import { MATERIAL_RENTAL } from "./rental";
import { PROPERTY_RENTAL } from "./property";
import { BAR, CAR_WASH, OTHER, PRESSING, SHOP } from "./trade";

const COMING_SOON_NAV = [
  { key: "home", label: "Home", path: "", icon: "LayoutDashboard", roles: ["ADMIN", "HEAD"] },
];

export const DOMAINS = {
  RESTAURANT,
  EVENT_VENUE,
  ROOM_RENTAL,
  BAR,
  PRESSING,
  CAR_WASH,
  MATERIAL_RENTAL,
  PROPERTY_RENTAL,
  SHOP,
  OTHER,
};

for (const d of Object.values(DOMAINS)) {
  if (!d.enabled) {
    Object.assign(d, {
      enabled: false,
      hasMenu: false,
      stockModel: "NONE",
      navigation: COMING_SOON_NAV,
      moneyInTypes: [],
      moneyOutTypes: [],
      words: { item: "Item", items: "Items", unit: "unit", units: "units", catalog: "Catalog" },
    });
  }
}

export const DOMAIN_LIST = Object.values(DOMAINS);
export const DEFAULT_DOMAIN = "RESTAURANT";

export function getDomain(key) {
  return DOMAINS[key] || DOMAINS.OTHER;
}

export function isDomainEnabled(key) {
  return Boolean(DOMAINS[key]?.enabled);
}

export function isRestaurant(key) {
  return key === "RESTAURANT";
}

/** The navigation entry of a department type for a page segment ("sell", "calendar"…), if any. */
export function moduleForSegment(domainKey, segment) {
  if (!segment) return null;
  return getDomain(domainKey).navigation.find((n) => n.path === `/${segment}`) || null;
}

/** Sidebar items of a department for a role. */
export function departmentNavigation(department, role) {
  const domain = getDomain(department.domain);
  return domain.navigation
    .filter((n) => roleAllowed(n.roles, role))
    .map((n) => ({ id: n.key, label: n.label, icon: n.icon, href: `/d/${department.id}${n.path}` }));
}

/** Whether a department (by domain) offers a module and the role may open it. */
export function hasModule(department, key, role) {
  const nav = getDomain(department.domain).navigation.find((n) => n.key === key);
  return Boolean(nav && (!role || roleAllowed(nav.roles, role)));
}
