import type { DecisionOption, Employee, RoleKey, Stats } from "../shared/types";
import { formatBaht, type Business } from "./business";
import type { DraftMessage } from "./game";
import { ROLES, generateCandidates, holder, renderText } from "./roster";
import { newTicket, openTickets, type Ticket, type TicketAction } from "./tickets";

// People management: each employee has their own morale; unhappy people ask for raises and
// eventually resign, empty roles hurt the company, and hiring brings in new (random) people.

export const MAX_STAFF = 10;
const RESIGN_BELOW = 30;
// Checked once per game day (about one event).
const RESIGN_CHANCE = 0.25;
const RAISE_REQUEST_CHANCE = 0.05;
const MOOD_DRIFT = 0.1;

// What an empty role costs per game day.
const VACANCY_DRIFT: Partial<Record<RoleKey, Partial<Stats>>> = {
  sec: { security: -1 },
  ops: { uptime: -1 },
  dev: { uptime: -1 },
  sales: { reputation: -1 },
  pm: { morale: -1 },
};

function clamp(n: number): number {
  return Math.max(0, Math.min(100, Math.round(n)));
}

function say(staff: Employee[], person: Employee, channel: string, text: string): DraftMessage {
  return { channel, author: person.id, text: renderText(text, staff, person) ?? text, kind: "chat" };
}

function hasTag(tickets: Ticket[], tag: string): boolean {
  return openTickets(tickets).some((t) => t.tag === tag);
}

export interface HrState {
  staff: Employee[];
  tickets: Ticket[];
  stats: Stats;
  clock: number;
}

// Company-wide morale changes spill half over to every individual.
export function spreadMorale(staff: Employee[], delta: number): void {
  if (!delta) return;
  for (const e of staff) e.morale = clamp(e.morale + delta / 2);
}

// Once per game day: vacancies drag stats down, moods drift, and people make requests.
export function dailyHr(s: HrState, b: Business, usedNames: string[]): { tickets: Ticket[]; posts: DraftMessage[] } {
  const tickets: Ticket[] = [];
  const posts: DraftMessage[] = [];
  const vacant = (Object.keys(VACANCY_DRIFT) as RoleKey[]).filter((r) => !holder(s.staff, r));
  for (const role of vacant) {
    for (const [k, v] of Object.entries(VACANCY_DRIFT[role]!) as [keyof Stats, number][]) s.stats[k] = clamp(s.stats[k] + v);
  }
  for (const e of s.staff) e.morale = clamp(e.morale + (s.stats.morale - e.morale) * MOOD_DRIFT);

  const all = [...s.tickets];
  for (const e of s.staff) {
    if (e.morale < RESIGN_BELOW && !hasTag(all, `resign:${e.id}`) && Math.random() < RESIGN_CHANCE) {
      const t = resignationTicket(e, s.staff, s.clock);
      tickets.push(t.ticket);
      all.push(t.ticket);
      posts.push(t.message);
    }
  }
  const asker = s.staff.filter((e) => e.morale < 65 && e.roleKey !== "intern" && !hasTag(all, `raise:${e.id}`));
  if (asker.length && Math.random() < RAISE_REQUEST_CHANCE) {
    const e = asker[Math.floor(Math.random() * asker.length)];
    const t = raiseTicket(e, s.staff, s.clock);
    tickets.push(t.ticket);
    all.push(t.ticket);
    posts.push(t.message);
  }
  const toFill = vacant.find((r) => !hasTag(all, `hire:${r}`));
  if (toFill && s.staff.length < MAX_STAFF) {
    const t = hiringTicket(toFill, s.staff, b, usedNames, s.clock, `ตำแหน่ง ${b.titles[toFill] ?? ROLES[toFill].title} ว่างอยู่`);
    tickets.push(t.ticket);
    posts.push(t.message);
  }
  return { tickets, posts };
}

function options(labels: string[]): DecisionOption[] {
  return labels.map((label, i) => ({ id: String.fromCharCode(97 + i), label, effects: {}, patches: false }));
}

export function resignationTicket(e: Employee, staff: Employee[], clock: number): { ticket: Ticket; message: DraftMessage } {
  const labels = ["ขึ้นเงินเดือน 20% ให้อยู่ต่อ", ...(e.level < 3 ? ["เลื่อนตำแหน่งและให้คุมงานมากขึ้น"] : []), "ขอบคุณที่ทำงานด้วยกัน (ให้ลาออก)"];
  const opts = options(labels);
  const leave = opts.at(-1)!;
  leave.effects = { morale: -4 };
  const actions: Record<string, TicketAction> = { a: { type: "raise", employeeId: e.id, pct: 20, morale: 30 } };
  if (e.level < 3) actions.b = { type: "promote", employeeId: e.id };
  actions[leave.id] = { type: "leave", employeeId: e.id };
  const dm = `dm-${e.id}`;
  const ticket = newTicket({
    kind: "dm",
    from: e.id,
    subject: `${e.name}ยื่นใบลาออก`,
    body: renderText("CEO ขอคุยหน่อย{ask} {I}คิดมาหลายวันแล้ว... ขอยื่นใบลาออก{end} ถ้าไม่มีอะไรเปลี่ยน {I}คงไปสิ้นเดือนนี้", staff, e) ?? "",
    options: opts,
    urgent: true,
    createdAt: clock,
    actions,
    timeoutAction: { type: "leave", employeeId: e.id },
    tag: `resign:${e.id}`,
    reactions: {
      a: [say(staff, e, dm, "ขอบคุณ{end} {I}จะอยู่ต่อและตั้งใจทำงาน")],
      ...(e.level < 3 ? { b: [say(staff, e, dm, "ไม่คิดว่าจะได้... ขอบคุณจริงๆ{end} 🙏")] } : {}),
      [leave.id]: [say(staff, e, dm, "ขอบคุณสำหรับทุกอย่าง{end} 🙏")],
    },
  });
  return { ticket, message: { channel: dm, author: e.id, kind: "ticket", text: `🔴 ด่วน · 📩 ${ticket.subject}`, link: `ticket:${ticket.id}` } };
}

export function raiseTicket(e: Employee, staff: Employee[], clock: number): { ticket: Ticket; message: DraftMessage } {
  const opts = options(["ปรับเงินเดือน 10%", "ปรับให้ 5% ก่อน", "ตอนนี้ยังปรับไม่ได้"]);
  const dm = `dm-${e.id}`;
  const ticket = newTicket({
    kind: "dm",
    from: e.id,
    subject: `${e.name}ขอปรับเงินเดือน`,
    body: renderText(`CEO {I}ทำงานที่นี่มาสักพักแล้ว ตอนนี้ได้ ${formatBaht(e.salary)} ขอปรับเงินเดือนได้ไหม{ask}`, staff, e) ?? "",
    options: opts,
    createdAt: clock,
    actions: {
      a: { type: "raise", employeeId: e.id, pct: 10, morale: 15 },
      b: { type: "raise", employeeId: e.id, pct: 5, morale: 5 },
      c: { type: "morale", employeeId: e.id, delta: -15 },
    },
    timeoutAction: { type: "morale", employeeId: e.id, delta: -20 },
    tag: `raise:${e.id}`,
    reactions: {
      a: [say(staff, e, dm, "ขอบคุณมาก{end}! 🙌")],
      b: [say(staff, e, dm, "ก็ยังดี{end} ขอบคุณ")],
      c: [say(staff, e, dm, "เข้าใจ{end}...")],
    },
  });
  return { ticket, message: { channel: dm, author: e.id, kind: "ticket", text: `📩 ${ticket.subject}`, link: `ticket:${ticket.id}` } };
}

// An email with two or three applicants for a role; each option hires one of them.
export function hiringTicket(
  role: RoleKey,
  staff: Employee[],
  b: Business,
  usedNames: string[],
  clock: number,
  reason: string,
): { ticket: Ticket; message: DraftMessage } {
  const taken = new Set([...usedNames, ...staff.map((e) => e.name)]);
  const candidates = generateCandidates(role, b, taken, 2 + Math.floor(Math.random() * 2));
  const title = b.titles[role] ?? ROLES[role].title;
  const from = holder(staff, "pm") ?? staff[0];
  const opts: DecisionOption[] = candidates.map((c, i) => ({
    id: String.fromCharCode(97 + i),
    label: `จ้าง${c.name} (ขอ ${formatBaht(c.salary)}/เดือน)`,
    effects: { cash: -1 },
    patches: false,
  }));
  opts.push({ id: String.fromCharCode(97 + candidates.length), label: "ยังไม่จ้างตอนนี้", effects: {}, patches: false });
  const ticket = newTicket({
    kind: "email",
    from: from?.id ?? "system",
    subject: `ผู้สมัครตำแหน่ง ${title} (${candidates.length} คน)`,
    body: [`${reason} มีผู้สมัครผ่านรอบแรก:`, ...candidates.map((c) => `• ${c.name}: ขอ ${formatBaht(c.salary)} · ${c.personality}`)].join("\n"),
    options: opts,
    createdAt: clock,
    actions: Object.fromEntries(candidates.map((c, i) => [String.fromCharCode(97 + i), { type: "hire", candidate: c } as TicketAction])),
    tag: `hire:${role}`,
  });
  const message: DraftMessage = {
    channel: "general",
    author: "system",
    kind: "ticket",
    text: `📧 อีเมลใหม่: ${ticket.subject}`,
    link: `ticket:${ticket.id}`,
  };
  return { ticket, message };
}

// Applies an HR action and says what happened, for the ticket outcome and the chat.
export function applyAction(action: TicketAction, s: HrState, b: Business): { posts: DraftMessage[]; outcome: string } {
  const person = "employeeId" in action ? s.staff.find((e) => e.id === action.employeeId) : undefined;
  switch (action.type) {
    case "hire": {
      if (s.staff.length >= MAX_STAFF) return { posts: [], outcome: "ทีมเต็มแล้ว จ้างเพิ่มไม่ได้" };
      const c = { ...action.candidate, role: b.titles[action.candidate.roleKey] ?? action.candidate.role };
      s.staff.push(c);
      return {
        posts: [
          { channel: "general", author: "system", kind: "system", text: `👋 ${c.name} เข้าร่วมทีมในตำแหน่ง ${c.role} (${formatBaht(c.salary)}/เดือน)` },
          say(s.staff, c, "general", "สวัสดี{end}ทุกคน ฝากตัวด้วยนะ{ask} 🙏"),
        ],
        outcome: `จ้าง ${c.name} แล้ว`,
      };
    }
    case "leave": {
      if (!person) return { posts: [], outcome: "" };
      s.staff = s.staff.filter((e) => e.id !== person.id);
      spreadMorale(s.staff, -6);
      return {
        posts: [{ channel: "general", author: "system", kind: "system", text: `🚪 ${person.name} (${person.role}) ลาออกแล้ว` }],
        outcome: `${person.name} ลาออก`,
      };
    }
    case "raise": {
      if (!person) return { posts: [], outcome: "" };
      const before = person.salary;
      person.salary = Math.round((before * (1 + action.pct / 100)) / 1000) * 1000;
      person.morale = clamp(person.morale + action.morale);
      return { posts: [], outcome: `${person.name}: เงินเดือน ${formatBaht(before)} → ${formatBaht(person.salary)}` };
    }
    case "promote": {
      if (!person) return { posts: [], outcome: "" };
      person.level = Math.min(3, person.level + 1);
      person.salary = Math.round((person.salary * 1.15) / 1000) * 1000;
      person.morale = clamp(person.morale + 30);
      return {
        posts: [{ channel: "general", author: "system", kind: "system", text: `🎉 ${person.name} ได้เลื่อนเป็นระดับ ${LEVEL_LABELS[person.level]}` }],
        outcome: `${person.name} ได้เลื่อนตำแหน่ง (${formatBaht(person.salary)}/เดือน)`,
      };
    }
    case "morale": {
      if (!person) return { posts: [], outcome: "" };
      person.morale = clamp(person.morale + action.delta);
      return { posts: [], outcome: "" };
    }
  }
}

export const LEVEL_LABELS: Record<number, string> = { 1: "Junior", 2: "Senior", 3: "Lead" };

// Firing: one month's salary as severance, and everyone else gets nervous.
export function fire(s: HrState, employeeId: string): DraftMessage[] {
  const person = s.staff.find((e) => e.id === employeeId);
  if (!person) return [];
  s.staff = s.staff.filter((e) => e.id !== employeeId);
  s.stats.cash -= person.salary;
  s.stats.morale = clamp(s.stats.morale - 5);
  spreadMorale(s.staff, -10);
  return [
    {
      channel: "general",
      author: "system",
      kind: "system",
      text: `📄 ${person.name} (${person.role}) ถูกเลิกจ้าง จ่ายค่าชดเชย ${formatBaht(person.salary)}`,
    },
  ];
}
