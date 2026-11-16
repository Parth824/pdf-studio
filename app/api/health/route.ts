import { NextResponse } from "next/server";
import { runEngine } from "@/lib/engine";
export const runtime = "nodejs";
export async function GET() {
  try {
    return NextResponse.json(
      await runEngine({ tool: "capabilities", directory: process.cwd() }),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json({
      engine: false,
      office: false,
      pdfa: false,
      ocr: false,
      translate: false,
    });
  }
}
