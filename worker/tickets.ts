import type { DecisionOption, Employee, PublicTicket, RoleKey, TicketStatus } from "../shared/types";
import { STAT_KEYS } from "../shared/types";
import type { DraftMessage, Scene, SceneEvent } from "./game";
import { holder } from "./roster";

// Decisions arrive as tickets: an email (work matters) or a DM (someone asking the CEO for
// something). Several can be open at once; each has a deadline in game time, and an ignored
// ticket resolves itself with its worst option.

export const URGENT_DEADLINE_MS = 5 * 60 * 1000;
export const NORMAL_DEADLINE_MS = 15 * 60 * 1000;
// Closed tickets stay visible in the inbox for a while so the player can see what happened.
const KEEP_CLOSED = 12;

// What resolving an option does beyond stat effects (HR tickets).
export type TicketAction =
  | { type: "hire"; candidate: Employee }
  | { type: "leave"; employeeId: string }
  | { type: "raise"; employeeId: string; pct: number; morale: number }
  | { type: "promote"; employeeId: string }
  | { type: "morale"; employeeId: string; delta: number };

export interface Ticket {
  id: string;
  kind: "email" | "dm";
  from: string;
  subject: string;
  body: string;
  options: DecisionOption[];
  urgent: boolean;
  createdAt: number;
  deadline: number;
  newsId: string | null;
  // Pre-written reactions per option (scripted scenes); otherwise the model writes them.
  reactions: Record<string, DraftMessage[]> | null;
  actions: Record<string, TicketAction> | null;
  timeoutAction: TicketAction | null;
  // Keeps HR tickets from piling up, e.g. "resign:<employeeId>" or "hire:<role>".
  tag: string | null;
  status: TicketStatus;
  reminded: boolean;
  outcome: string | null;
  closedAt: number | null;
}

export function newTicket(fields: Partial<Ticket> & Pick<Ticket, "kind" | "from" | "subject" | "options" | "createdAt">): Ticket {
  const urgent = fields.urgent ?? false;
  return {
    id: crypto.randomUUID(),
    body: "",
    urgent,
    deadline: fields.createdAt + (urgent ? URGENT_DEADLINE_MS : NORMAL_DEADLINE_MS),
    newsId: null,
    reactions: null,
    actions: null,
    timeoutAction: null,
    tag: null,
    status: "open",
    reminded: false,
    outcome: null,
    closedAt: null,
    ...fields,
  };
}

// Who sends the ticket for a generated scene, and how. Security matters come by email from
// security; quiet-day scenes come as a DM from whoever asked the CEO directly.
export function sceneToTicket(
  scene: Scene,
  event: SceneEvent,
  staff: Employee[],
  clock: number,
  extra: { newsId: string | null; reactions: Record<string, DraftMessage[]> | null },
): { ticket: Ticket; notice: DraftMessage } {
  const first = staff[0]?.id ?? "system";
  const pick = (...roles: RoleKey[]) => roles.map((r) => holder(staff, r)?.id).find(Boolean) ?? first;
  let kind: Ticket["kind"] = "email";
  let from: string;
  if (event.kind === "regression") from = pick("ops", "dev");
  else if (event.kind !== "quiet") from = pick("sec", "ops", "dev");
  else {
    const dm = scene.messages.find((m) => m.channel === `dm-${m.author}`);
    kind = dm ? "dm" : "email";
    from = dm?.author ?? pick("pm", "sales");
  }
  const urgent = event.kind === "breach" || event.kind === "regression" || (event.kind === "news" && event.matched.length > 0);
  const byFrom = scene.messages.filter((m) => m.author === from);
  const ticket = newTicket({
    kind,
    from,
    subject: scene.decision.prompt,
    body: byFrom.at(-1)?.text ?? "",
    options: scene.decision.options,
    urgent,
    createdAt: clock,
    newsId: extra.newsId,
    reactions: extra.reactions,
  });
  return { ticket, notice: ticketNotice(ticket, staff) };
}

// The chat line that points at a ticket: in the sender's DM, or in #general for email.
export function ticketNotice(t: Ticket, staff: Employee[]): DraftMessage {
  const name = staff.find((e) => e.id === t.from)?.name ?? "ระบบ";
  const flag = t.urgent ? "🔴 ด่วน · " : "";
  return t.kind === "dm"
    ? { channel: `dm-${t.from}`, author: t.from, kind: "ticket", text: `${flag}📩 ${t.subject}`, link: `ticket:${t.id}` }
    : { channel: "general", author: "system", kind: "ticket", text: `${flag}📧 อีเมลใหม่จาก${name}: ${t.subject}`, link: `ticket:${t.id}` };
}

// The option a ticket falls back to when nobody answers: the one that hurts most.
export function worstOption(options: DecisionOption[]): DecisionOption {
  const score = (o: DecisionOption) => STAT_KEYS.reduce((sum, k) => sum + (o.effects[k] ?? 0), 0) + (o.patches ? 10 : 0);
  return [...options].sort((a, b) => score(a) - score(b))[0];
}

export function openTickets(tickets: Ticket[]): Ticket[] {
  return tickets.filter((t) => t.status === "open" || t.status === "thinking");
}

export function pruneTickets(tickets: Ticket[]): Ticket[] {
  const open = openTickets(tickets);
  const closed = tickets.filter((t) => t.status === "done" || t.status === "expired").sort((a, b) => (b.closedAt ?? 0) - (a.closedAt ?? 0));
  return [...open, ...closed.slice(0, KEEP_CLOSED)];
}

export function publicTicket(t: Ticket, clock: number): PublicTicket {
  return {
    id: t.id,
    kind: t.kind,
    from: t.from,
    subject: t.subject,
    body: t.body,
    options: t.options,
    urgent: t.urgent,
    status: t.status,
    deadlineIn: Math.max(0, t.deadline - clock),
    outcome: t.outcome,
  };
}
