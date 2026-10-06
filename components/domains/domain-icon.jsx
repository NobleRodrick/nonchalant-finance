import { BedDouble, Building, Building2, Car, PartyPopper, Shirt, Store, Tent, UtensilsCrossed, Wine } from "lucide-react";
import { cn } from "@/lib/utils";

/** Icon of each department type (lib/domains): one place for the sidebar, pickers and pages. */
export const DOMAIN_ICONS = {
  RESTAURANT: UtensilsCrossed,
  EVENT_VENUE: PartyPopper,
  BAR: Wine,
  PRESSING: Shirt,
  CAR_WASH: Car,
  ROOM_RENTAL: BedDouble,
  MATERIAL_RENTAL: Tent,
  PROPERTY_RENTAL: Building,
  SHOP: Store,
  OTHER: Building2,
};

/** Tile colours of a department type's `color` on the dark sidebar. */
const DARK_TONES = {
  emerald: "bg-emerald-500/15 text-emerald-300",
  rose: "bg-rose-500/15 text-rose-300",
  amber: "bg-amber-500/15 text-amber-300",
  sky: "bg-sky-500/15 text-sky-300",
  cyan: "bg-cyan-500/15 text-cyan-300",
  violet: "bg-violet-500/15 text-violet-300",
  orange: "bg-orange-500/15 text-orange-300",
  indigo: "bg-indigo-500/15 text-indigo-300",
  pink: "bg-pink-500/15 text-pink-300",
  slate: "bg-slate-500/20 text-slate-300",
};

export function DomainIcon({ domain, className }) {
  const Icon = DOMAIN_ICONS[domain] || Building2;
  return <Icon className={className} aria-hidden="true" />;
}

/** The type's icon in a small coloured tile (sidebar). */
export function DomainTile({ domain, color, className }) {
  return (
    <span className={cn("flex h-7 w-7 shrink-0 items-center justify-center rounded-md", DARK_TONES[color] || DARK_TONES.slate, className)}>
      <DomainIcon domain={domain} className="h-3.5 w-3.5" />
    </span>
  );
}
