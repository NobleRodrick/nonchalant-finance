import Link from "next/link";
import {
  ArrowRight, CheckCircle2, ClipboardList, Eye, FileCheck, HandCoins, LineChart, ShieldCheck, Sparkles, UserCog,
} from "lucide-react";
import { DomainIcon } from "@/components/domains/domain-icon";
import { Button } from "@/components/ui/button";
import { PublicHeader } from "@/components/public-header";
import { getCurrentUser } from "@/lib/auth";
import { DOMAIN_LIST } from "@/lib/domains/registry";

export const dynamic = "force-dynamic";


const ROLES = [
  {
    icon: Eye,
    title: "You, the Boss",
    text: "You create the business and oversee it: how the whole business and each department is doing, today and over any period. Review daily reports, ask for and receive cash, read statements, and manage departments and people.",
  },
  {
    icon: UserCog,
    title: "Your department heads",
    text: "Everyone you add is a department head, with the title you give them (Accountant, Manager …). Each runs the departments you assign, one or several: stock, sales, money in and out, debts, cash handed to you, and the daily report.",
  },
];

const STEPS = [
  ["Register your business", "Create your account and give your business its name."],
  ["Create its departments", "Add each part of the business and choose its type: restaurant, bar, pressing, car wash, rentals, shop …"],
  ["Add your department heads", "Give each person a title and the departments they head. One person can head several departments."],
  ["Oversee every day", "Your teams record the day and send you a report and the cash. You follow everything from your overview."],
];

const TRUST = [
  { icon: FileCheck, title: "A report every day", text: "Each department sends a daily report that locks the day. You approve it or return it with a note." },
  { icon: HandCoins, title: "Cash you can follow", text: "Ask a department for the cash of a day or a period; every handover has a reference and your confirmation." },
  { icon: LineChart, title: "Statements for any period", text: "Income, cash, stock and debts, per department or for the whole business, printable and exportable." },
  { icon: ShieldCheck, title: "Every record traceable", text: "Reference numbers, who did what and when, and corrections with a reason instead of silent edits." },
  { icon: Sparkles, title: "AI insights", text: "A short reading of your own figures: what is going well, what costs too much, what to watch." },
  { icon: ClipboardList, title: "Made for FCFA", text: "Cash, Mobile Money, bank and credit, in your business's own time zone." },
];

export default async function Home() {
  const user = await getCurrentUser();
  return (
    <div className="bg-slate-50">
      <PublicHeader signedIn={Boolean(user)} />

      <section className="mx-auto max-w-6xl px-4 pb-14 pt-16 text-center">
        <p className="text-sm font-semibold uppercase tracking-wider text-emerald-700">Business management · FCFA</p>
        <h1 className="mx-auto mt-3 max-w-3xl text-4xl font-extrabold tracking-tight text-slate-900 sm:text-6xl">
          Run every part of your business from one place
        </h1>
        <p className="mx-auto mt-5 max-w-2xl text-lg text-slate-600">
          Register your business, create its departments and give each one a head and a team. They record the day;
          you see how the whole business is doing, from anywhere.
        </p>
        <div className="mt-8 flex flex-wrap justify-center gap-3">
          <Link href={user ? "/home" : "/register"}>
            <Button size="lg">{user ? "Open the app" : "Register your business"} <ArrowRight className="h-4 w-4" /></Button>
          </Link>
          {!user && (
            <Link href="/login">
              <Button size="lg" variant="outline">Sign in</Button>
            </Link>
          )}
        </div>

        <div className="mx-auto mt-12 max-w-4xl rounded-2xl border border-slate-200 bg-white p-4 text-left shadow-xl sm:p-5" aria-label="Example of the Boss's overview">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wider text-emerald-700">Your business</div>
              <div className="text-lg font-bold text-slate-900">Today, all departments</div>
            </div>
            <span className="rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800">Boss overview</span>
          </div>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {[["Money in", "77 000"], ["Money out", "19 000"], ["Result", "58 000"]].map(([l, v], i) => (
              <div key={l} className={`rounded-xl p-4 ${i === 2 ? "bg-slate-900 text-white" : "bg-slate-50"}`}>
                <div className={`text-xs ${i === 2 ? "text-slate-300" : "text-slate-500"}`}>{l}</div>
                <div className="mt-1 text-2xl font-semibold tabular-nums">{v} <span className="text-sm font-normal">FCFA</span></div>
              </div>
            ))}
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-3">
            {[
              ["Restaurant", "Restaurant", "RESTAURANT", "Report approved", "58 000"],
              ["Salle des fêtes", "Event venue", "EVENT_VENUE", "3 events this month", "450 000"],
              ["Bar", "Bar", "BAR", "Coming soon", null],
            ].map(([name, type, domain, status, result]) => (
              <div key={name} className="rounded-xl border border-slate-200 p-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-emerald-50 text-emerald-700"><DomainIcon domain={domain} className="h-4 w-4" /></span>
                  <div className="min-w-0">
                    <div className="truncate text-sm font-semibold">{name}</div>
                    <div className="text-[11px] text-slate-500">{type}</div>
                  </div>
                </div>
                <div className="mt-2 flex items-center justify-between text-xs">
                  <span className={result ? "text-emerald-700" : "text-slate-400"}>{status}</span>
                  {result ? <span className="font-semibold tabular-nums">{result}</span> : null}
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-400">Example figures.</p>
        </div>
      </section>

      <section className="border-t border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">One business, many kinds of departments</h2>
          <p className="mx-auto mt-2 max-w-2xl text-center text-slate-600">
            Each department has a type, which gives it the right screens, stock and daily report.
            Restaurants and event venues are ready today; the other types are on the way.
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {DOMAIN_LIST.map((d) => {
              return (
                <div key={d.key} className={`rounded-xl border p-4 ${d.enabled ? "border-emerald-300 bg-emerald-50/60" : "border-slate-200"}`}>
                  <div className="flex items-center justify-between">
                    <DomainIcon domain={d.key} className={`h-6 w-6 ${d.enabled ? "text-emerald-700" : "text-slate-400"}`} />
                    <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${d.enabled ? "bg-emerald-600 text-white" : "bg-slate-100 text-slate-600"}`}>
                      {d.enabled ? "Available now" : "Coming soon"}
                    </span>
                  </div>
                  <h3 className="mt-3 font-semibold">{d.label}</h3>
                  <p className="mt-1 text-sm text-slate-600">{d.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Two roles, clearly split</h2>
        <div className="mx-auto mt-8 grid max-w-4xl gap-4 md:grid-cols-2">
          {ROLES.map(({ icon: Icon, title, text }, i) => (
            <div key={title} className={`rounded-2xl border p-6 ${i === 0 ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white"}`}>
              <Icon className={`h-6 w-6 ${i === 0 ? "text-emerald-400" : "text-emerald-700"}`} />
              <h3 className="mt-3 text-lg font-semibold">{title}</h3>
              <p className={`mt-2 text-sm ${i === 0 ? "text-slate-300" : "text-slate-600"}`}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="border-y border-slate-200 bg-white py-16">
        <div className="mx-auto max-w-6xl px-4">
          <h2 className="text-center text-2xl font-bold sm:text-3xl">How it works</h2>
          <ol className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {STEPS.map(([t, d], i) => (
              <li key={t} className="rounded-xl border border-slate-200 bg-slate-50 p-5">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-emerald-600 text-sm font-bold text-white">{i + 1}</div>
                <div className="mt-3 font-semibold">{t}</div>
                <p className="mt-1 text-sm text-slate-600">{d}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="mx-auto max-w-6xl px-4 py-16">
        <h2 className="text-center text-2xl font-bold sm:text-3xl">Oversight you can trust</h2>
        <div className="mt-8 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {TRUST.map(({ icon: Icon, title, text }) => (
            <div key={title} className="rounded-xl border border-slate-200 bg-white p-5">
              <Icon className="h-6 w-6 text-emerald-700" />
              <h3 className="mt-3 font-semibold">{title}</h3>
              <p className="mt-1 text-sm text-slate-600">{text}</p>
            </div>
          ))}
        </div>
        <div className="mt-10 rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <h3 className="text-lg font-semibold text-emerald-950">Ready to put your business on it?</h3>
          <p className="mt-1 text-sm text-emerald-900">
            <CheckCircle2 className="mr-1 inline h-4 w-4" /> Register, create your departments and add your department heads in a few minutes.
          </p>
          <Link href={user ? "/home" : "/register"} className="mt-4 inline-block">
            <Button>{user ? "Open the app" : "Register your business"}</Button>
          </Link>
        </div>
      </section>

      <footer className="border-t border-slate-200 bg-white py-8 text-center text-sm text-slate-500">
        © {new Date().getFullYear()} Springer Finance
      </footer>
    </div>
  );
}
