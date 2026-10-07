import { createElement } from "react";
import {
  ArrowLeftRight, BarChart3, BedDouble, Bell, BookOpen, BookUser, Boxes, Building2, CalendarDays, Circle, ClipboardList, FileCheck2,
  FileText, Gauge, HandCoins, History, LayoutDashboard, LayoutGrid, LineChart, Package, Settings, ShoppingCart,
  Landmark, Search, SlidersHorizontal, Target, Users, UtensilsCrossed, Wrench, Beer, Car, Shirt, Store, Tags, Truck, Wine, Factory, Sprout, CalendarClock, IdCard, Contact,
} from "lucide-react";

/** Icons the navigation may name (lib/domains navigation entries, the Boss's own section). */
const NAV_ICONS = {
  ArrowLeftRight, BarChart3, BedDouble, Bell, BookOpen, BookUser, Boxes, Building2, CalendarDays, ClipboardList, FileCheck2, FileText,
  Gauge, HandCoins, History, LayoutDashboard, LayoutGrid, LineChart, Package, Settings, ShoppingCart, SlidersHorizontal,
  Landmark, Search, Target, Users, UtensilsCrossed, Wrench, Beer, Car, Shirt, Store, Tags, Truck, Wine, Factory, Sprout, CalendarClock, IdCard, Contact,
};

/** The icon named `name` (a circle for an unknown name). */
export function NavIcon({ name, ...props }) {
  return createElement(NAV_ICONS[name] || Circle, props);
}
