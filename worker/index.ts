import { handleLogin, isAuthed, readCookie } from "./auth";
import { Company } from "./company";
import { getRecentNews, refreshNews } from "./news";
import { refreshDeps } from "./osv";
import { fillScenePool } from "./pool";

// Must match the second cron in wrangler.jsonc. Runs apart from the data refresh so each
// invocation keeps its own CPU and subrequest budget.
const POOL_CRON = "47 * * * *";

export { Company };

const COOKIE = "wedeb_cid";
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

function json(data: unknown, status = 200, headers: HeadersInit = {}): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store", ...headers },
  });
}

function readCompanyId(request: Request): string | null {
  const id = readCookie(request, COOKIE);
  return id && UUID_RE.test(id) ? id : null;
}

async function handleApi(request: Request, env: Env, url: URL): Promise<Response> {
  if (request.method === "POST") {
    // Basic CSRF guard: only accept same-origin JSON posts.
    const origin = request.headers.get("Origin");
    if (origin && origin !== url.origin) return json({ error: "forbidden" }, 403);
    if (!request.headers.get("Content-Type")?.includes("application/json")) {
      return json({ error: "expected JSON" }, 415);
    }
  }

  if (url.pathname === "/api/login" && request.method === "POST") {
    const result = await handleLogin(request, env);
    return json(result.body, result.status, result.cookie ? { "Set-Cookie": result.cookie } : {});
  }

  // Everything else (including AI-spending routes) needs a valid PIN session.
  if (!(await isAuthed(request, env))) {
    return json({ error: "ต้องใส่ PIN ก่อน", code: "pin_required" }, 401);
  }

  if (url.pathname === "/api/news" && request.method === "GET") {
    return json(await getRecentNews(env, 20));
  }

  // Anonymous player identity: a random id in an HttpOnly cookie maps to one Company object.
  let companyId = readCompanyId(request);
  const headers: Record<string, string> = {};
  if (!companyId) {
    companyId = crypto.randomUUID();
    headers["Set-Cookie"] = `${COOKIE}=${companyId}; Path=/; Max-Age=31536000; HttpOnly; Secure; SameSite=Lax`;
  }
  const company = env.COMPANY.get(env.COMPANY.idFromName(companyId));

  // The client polls with the newest message id it has, and gets only what is newer.
  const since = Math.max(0, Number(url.searchParams.get("since")) || 0);
  const body =
    request.method === "POST" ? await request.json<Record<string, unknown>>().catch(() => ({}) as Record<string, unknown>) : {};
  const str = (v: unknown) => (typeof v === "string" ? v : undefined);

  switch (`${request.method} ${url.pathname}`) {
    case "GET /api/state":
      return json(await company.getState(since), 200, headers);
    case "POST /api/chat": {
      const channel = str(body.channel);
      const text = str(body.text);
      if (!channel || !text) return json({ error: "channel and text required" }, 400, headers);
      return json(await company.chat(channel, text, since), 200, headers);
    }
    case "POST /api/answer": {
      const ticketId = str(body.ticketId);
      if (!ticketId) return json({ error: "ticketId required" }, 400, headers);
      return json(await company.answer(ticketId, { optionId: str(body.optionId), text: str(body.text) }, since), 200, headers);
    }
    case "POST /api/team": {
      const action = str(body.action);
      if (!action) return json({ error: "action required" }, 400, headers);
      return json(await company.team(action, { employeeId: str(body.employeeId), role: str(body.role) }, since), 200, headers);
    }
    case "POST /api/reset":
      return json(await company.reset(), 200, headers);
    default:
      return json({ error: "not found" }, 404, headers);
  }
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith("/api/")) return new Response("Not found", { status: 404 });
    try {
      return await handleApi(request, env, url);
    } catch (err) {
      console.error(err);
      return json({ error: err instanceof Error ? err.message : "เกิดข้อผิดพลาด" }, 400);
    }
  },

  async scheduled(controller, env, ctx) {
    if (controller.cron === POOL_CRON) {
      ctx.waitUntil(
        fillScenePool(env).then(
          (count) => console.log(`scene pool: ${count} scenes added`),
          (err) => console.error("scene pool fill failed", err),
        ),
      );
      return;
    }
    ctx.waitUntil(
      Promise.all([
        refreshNews(env, 3).then(
          (count) => console.log(`news refreshed: ${count} KEV entries`),
          (err) => console.error("scheduled news refresh failed", err),
        ),
        refreshDeps(env).catch((err) => console.error("scheduled dependency refresh failed", err)),
      ]),
    );
  },
} satisfies ExportedHandler<Env>;
