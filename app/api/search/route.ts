import { getCurrentUser } from "@/lib/dal/auth";
import { globalSearch } from "@/lib/search/global-search";
import { globalSearchSchema } from "@/lib/search/params";
import { consumeSearchRateLimit } from "@/lib/search/rate-limit";

export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  const user = await getCurrentUser();
  if (!user || user.status !== "ACTIVE") return Response.json({ message: "Unauthorized" }, { status: 401, headers: { "Cache-Control": "no-store" } });
  const limit = consumeSearchRateLimit(user.id);
  if (!limit.allowed) return Response.json({ message: "Too many search requests. Try again shortly." }, { status: 429, headers: { "Cache-Control": "no-store", "Retry-After": String(limit.retryAfterSeconds) } });
  const parsed = globalSearchSchema.safeParse({ q: new URL(request.url).searchParams.get("q") ?? "" });
  if (!parsed.success) return Response.json({ query: "", groups: [] }, { headers: { "Cache-Control": "private, no-store, max-age=0" } });
  try { const results = await globalSearch(user, parsed.data.q); if (!results) return Response.json({ message: "No active organization" }, { status: 403, headers: { "Cache-Control": "no-store" } }); return Response.json(results, { headers: { "Cache-Control": "private, no-store, max-age=0", "X-Content-Type-Options": "nosniff", "X-RateLimit-Remaining": String(limit.remaining) } }); }
  catch { return Response.json({ message: "Search is temporarily unavailable." }, { status: 500, headers: { "Cache-Control": "no-store" } }); }
}
