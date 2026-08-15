import { handleCiterneHistoryGet } from "@/lib/citerneApiHandlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handleCiterneHistoryGet(2);
}
