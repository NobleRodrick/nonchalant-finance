"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Check, Loader2, MessageSquarePlus, Send, ShieldCheck, Sparkles, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Banner } from "@/components/kit/primitives";
import { askCopilot, decideCopilotProposal, loadCopilotSession } from "@/actions/copilot";
import { formatMoney } from "@/lib/format";

const STATUS = {
  PROPOSED: { label: "Waiting for your approval", cls: "bg-amber-50 text-amber-800 border-amber-200" },
  EXECUTED: { label: "Done", cls: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  REJECTED: { label: "Rejected", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  EXPIRED: { label: "Expired", cls: "bg-slate-100 text-slate-600 border-slate-200" },
  FAILED: { label: "Could not be done", cls: "bg-rose-50 text-rose-800 border-rose-200" },
  APPROVED: { label: "Running…", cls: "bg-sky-50 text-sky-800 border-sky-200" },
};

/** The model's answer as text: line breaks, bullets and **bold** (no HTML is ever injected). */
function Answer({ text }) {
  return (
    <div className="space-y-1.5 text-sm leading-relaxed text-slate-800">
      {String(text || "")
        .split("\n")
        .map((line, i) => {
          const bullet = /^\s*[-*•]\s+/.test(line);
          const body = line.replace(/^\s*[-*•]\s+/, "");
          const parts = body.split(/(\*\*[^*]+\*\*)/g).map((p, j) => (p.startsWith("**") && p.endsWith("**") ? <strong key={j}>{p.slice(2, -2)}</strong> : <span key={j}>{p}</span>));
          if (!line.trim()) return <div key={i} className="h-1" />;
          return bullet ? (
            <div key={i} className="flex gap-2 pl-1">
              <span className="text-emerald-600">•</span>
              <span>{parts}</span>
            </div>
          ) : (
            <p key={i}>{parts}</p>
          );
        })}
    </div>
  );
}

function ProposalCard({ action, onDecide, busy }) {
  const s = STATUS[action.status] || STATUS.PROPOSED;
  return (
    <div className="mt-3 rounded-lg border border-slate-200 bg-white p-3" data-testid="copilot-proposal">
      <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <ShieldCheck className="h-4 w-4 text-emerald-600" /> Proposed change
        <span className={`ml-auto rounded-full border px-2 py-0.5 text-[11px] normal-case ${s.cls}`}>{s.label}</span>
      </div>
      <p className="mt-2 text-sm text-slate-800">{action.summary}</p>
      {action.amount ? <p className="mt-1 text-sm font-semibold text-slate-900">{formatMoney(action.amount)}</p> : null}
      {action.error ? <p className="mt-1 text-sm text-rose-700">{action.error}</p> : null}
      {action.status === "PROPOSED" ? (
        <div className="mt-3 flex gap-2">
          <Button size="sm" onClick={() => onDecide(action.id, true)} disabled={busy}>
            <Check className="h-4 w-4" /> Approve
          </Button>
          <Button size="sm" variant="outline" onClick={() => onDecide(action.id, false)} disabled={busy}>
            <X className="h-4 w-4" /> Reject
          </Button>
        </div>
      ) : null}
    </div>
  );
}

export function CopilotChat({ configured, sessions = [], suggestions = [] }) {
  const [sessionId, setSessionId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [actions, setActions] = useState({});
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const sending = useRef(false);
  const end = useRef(null);

  const scroll = () => setTimeout(() => end.current?.scrollIntoView({ behavior: "smooth", block: "end" }), 50);

  async function send(message) {
    const m = String(message || "").trim();
    if (!m || sending.current) return;
    sending.current = true;
    setBusy(true);
    setText("");
    setMessages((prev) => [...prev, { role: "user", text: m }]);
    scroll();
    const res = await askCopilot({ sessionId, message: m });
    sending.current = false;
    setBusy(false);
    if (!res.success) {
      setMessages((prev) => [...prev, { role: "assistant", text: res.error, error: true }]);
      scroll();
      return;
    }
    setSessionId(res.data.sessionId);
    setActions((prev) => ({ ...prev, ...Object.fromEntries(res.data.proposals.map((p) => [p.id, { ...p, status: "PROPOSED" }])) }));
    setMessages((prev) => [...prev, { role: "assistant", text: res.data.reply, proposals: res.data.proposals.map((p) => p.id) }]);
    scroll();
  }

  async function decide(actionId, approve) {
    setBusy(true);
    setActions((prev) => ({ ...prev, [actionId]: { ...prev[actionId], status: approve ? "APPROVED" : prev[actionId].status } }));
    const res = await decideCopilotProposal({ actionId, approve });
    setBusy(false);
    if (!res.success) {
      setActions((prev) => ({ ...prev, [actionId]: { ...prev[actionId], status: "FAILED", error: res.error } }));
      toast.error(res.error);
      return;
    }
    setActions((prev) => ({ ...prev, [actionId]: { ...prev[actionId], status: res.data.status } }));
    toast.success(res.data.status === "EXECUTED" ? `Done${res.data.result?.referenceNo ? `: ${res.data.result.referenceNo}` : ""}.` : "Rejected: nothing was changed.");
  }

  async function open(id) {
    const res = await loadCopilotSession({ sessionId: id });
    if (!res.success) return toast.error(res.error);
    setSessionId(res.data.id);
    setActions(Object.fromEntries(res.data.actions.map((a) => [a.id, a])));
    setMessages(res.data.messages);
    scroll();
  }

  function startOver() {
    setSessionId(null);
    setMessages([]);
    setActions({});
  }

  if (!configured) return <Banner tone="warn">The Finance Copilot is not configured on this server yet (an AI key is missing). Ask the administrator.</Banner>;

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_260px]">
      <div className="flex min-h-[60vh] flex-col rounded-xl border border-slate-200 bg-slate-50/50">
        <div className="flex-1 space-y-4 overflow-y-auto p-4" aria-live="polite">
          {!messages.length ? (
            <div className="py-6">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                <Sparkles className="h-4 w-4 text-emerald-600" /> Try asking
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {suggestions.map((s) => (
                  <button key={s} type="button" onClick={() => send(s)} className="rounded-lg border border-slate-200 bg-white p-3 text-left text-sm text-slate-700 hover:border-emerald-300 hover:bg-emerald-50/40">
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}
          {messages.map((m, i) =>
            m.role === "user" ? (
              <div key={i} className="ml-auto max-w-[85%] rounded-2xl rounded-br-sm bg-slate-900 px-4 py-2.5 text-sm text-white">
                {m.text}
              </div>
            ) : (
              <div key={i} className={`max-w-[92%] rounded-2xl rounded-bl-sm border px-4 py-3 ${m.error ? "border-rose-200 bg-rose-50" : "border-slate-200 bg-white"}`} data-testid="copilot-answer">
                <Answer text={m.text} />
                {(m.proposals || []).map((id) => (actions[id] ? <ProposalCard key={id} action={actions[id]} onDecide={decide} busy={busy} /> : null))}
              </div>
            )
          )}
          {busy && messages.at(-1)?.role === "user" ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Looking at your figures…
            </div>
          ) : null}
          <div ref={end} />
        </div>
        <form
          className="flex gap-2 border-t border-slate-200 bg-white p-3"
          onSubmit={(e) => {
            e.preventDefault();
            send(text);
          }}
        >
          <label htmlFor="copilot-input" className="sr-only">
            Message
          </label>
          <textarea
            id="copilot-input"
            rows={2}
            maxLength={1500}
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send(text);
              }
            }}
            placeholder="Ask about your cash, results, debts, forecast or financing…"
            className="min-h-[44px] flex-1 resize-none rounded-md border border-slate-300 px-3 py-2 text-sm outline-none focus:border-emerald-500"
          />
          <Button type="submit" disabled={busy || !text.trim()} aria-label="Send">
            <Send className="h-4 w-4" />
          </Button>
        </form>
      </div>
      <aside className="space-y-3">
        <Button variant="outline" className="w-full" onClick={startOver}>
          <MessageSquarePlus className="h-4 w-4" /> New conversation
        </Button>
        {sessions.length ? (
          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Recent</div>
            <ul className="mt-2 space-y-1">
              {sessions.map((s) => (
                <li key={s.id}>
                  <button type="button" onClick={() => open(s.id)} className="w-full truncate rounded px-2 py-1.5 text-left text-sm text-slate-700 hover:bg-slate-100">
                    {s.title || "Conversation"}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 text-xs leading-relaxed text-emerald-900">
          <div className="mb-1 flex items-center gap-1.5 font-semibold">
            <ShieldCheck className="h-4 w-4" /> How it stays safe
          </div>
          It sees only the departments you may see. It can read figures and prepare changes; nothing is recorded until you press Approve, and it cannot void, delete or change settings. Financing results are indicative, not advice.
        </div>
      </aside>
    </div>
  );
}
