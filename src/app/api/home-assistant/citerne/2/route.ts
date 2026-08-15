import { NextRequest } from "next/server";
import { handleCiterneGet, handleCiternePost } from "@/lib/citerneApiHandlers";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export async function GET() {
  return handleCiterneGet(2);
}

export async function POST(request: NextRequest) {
  return handleCiternePost(2, request);
}
