import { cn } from "@/lib/utils";

/**
 * Loading placeholders shown the instant a link is clicked (app/**\/loading.jsx), shaped like
 * the page that is coming so nothing jumps when the data arrives. Server components: no JS.
 */
export function Bone({ className }) {
  return <div aria-hidden="true" className={cn("animate-pulse rounded-md bg-slate-200/80", className)} />;
}

function Header({ actions = 1 }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div className="space-y-2">
        <Bone className="h-3 w-24" />
        <Bone className="h-7 w-56" />
        <Bone className="h-4 w-80 max-w-full" />
      </div>
      <div className="flex gap-2">
        {Array.from({ length: actions }, (_, i) => (
          <Bone key={i} className="h-9 w-28" />
        ))}
      </div>
    </div>
  );
}

function Cards({ count = 4 }) {
  return (
    <div className={cn("grid grid-cols-2 gap-3", count >= 6 ? "lg:grid-cols-3 2xl:grid-cols-6" : "lg:grid-cols-4")}>
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <Bone className="h-3 w-20" />
          <Bone className="mt-3 h-6 w-28" />
          <Bone className="mt-2 h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

function Table({ rows = 6, cols = 5 }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-xs">
      <div className="border-b border-slate-100 px-4 py-3">
        <Bone className="h-4 w-40" />
      </div>
      <div className="divide-y divide-slate-100">
        {Array.from({ length: rows }, (_, r) => (
          <div key={r} className="grid gap-4 px-4 py-3" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))` }}>
            {Array.from({ length: cols }, (_, c) => (
              <Bone key={c} className={cn("h-4", c === 0 ? "w-3/4" : "w-1/2")} />
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function Tiles({ count = 9 }) {
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 2xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="flex min-h-[104px] flex-col justify-between rounded-xl border border-slate-200 bg-white p-3 shadow-xs">
          <Bone className="h-4 w-2/3" />
          <div className="flex justify-between">
            <Bone className="h-4 w-16" />
            <Bone className="h-3 w-10" />
          </div>
        </div>
      ))}
    </div>
  );
}

/** A generic page: title, figures, a list. */
export function PageSkeleton({ cards = 4, rows = 6, cols = 5, actions = 1 }) {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" data-testid="page-loading">
      <Header actions={actions} />
      <div className="space-y-6">
        {cards ? <Cards count={cards} /> : null}
        <Table rows={rows} cols={cols} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** The point of sale: dish tiles and the basket. */
export function SellSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" data-testid="page-loading">
      <Header />
      <div className="grid gap-6 xl:grid-cols-[1fr_400px]">
        <div className="space-y-4">
          <Bone className="h-10 w-full max-w-sm" />
          <Tiles />
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-xs">
          <Bone className="h-4 w-28" />
          <Bone className="mt-6 h-20 w-full" />
          <Bone className="mt-4 h-6 w-full" />
          <div className="mt-4 grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, i) => (
              <Bone key={i} className="h-10" />
            ))}
          </div>
          <Bone className="mt-4 h-12 w-full" />
        </div>
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}

/** A printable report: summary figures and several sections. */
export function ReportSkeleton() {
  return (
    <div role="status" aria-live="polite" aria-label="Loading" data-testid="page-loading">
      <Header actions={2} />
      <div className="space-y-6">
        <Cards count={5} />
        <div className="grid gap-6 lg:grid-cols-2">
          <Table rows={5} cols={3} />
          <Table rows={5} cols={3} />
        </div>
        <Table rows={8} cols={6} />
      </div>
      <span className="sr-only">Loading…</span>
    </div>
  );
}
