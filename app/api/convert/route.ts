import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runEngine } from "@/lib/engine";
import catalog from "@/lib/conversion-formats.json";
export const runtime = "nodejs";
export const maxDuration = 180;
const formats = new Set(Object.values(catalog).flat());
let active = false;
let cache: { at: number; data: Record<string, unknown> } | null = null;
export async function GET() {
  try {
    if (!cache || Date.now() - cache.at > 60000)
      cache = {
        at: Date.now(),
        data: await runEngine({ tool: "converter-catalog" }, "converter"),
      };
    return NextResponse.json(cache.data, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Engine unavailable",
        categories: catalog,
        routes: {},
        engines: {},
        localOnly: true,
      },
      { status: 503 },
    );
  }
}
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const expected = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (origin && origin !== expected)
    return NextResponse.json(
      { error: "Cross-origin uploads are not allowed." },
      { status: 403 },
    );
  if (active)
    return NextResponse.json(
      { error: "A conversion is running. Please wait for it to finish." },
      { status: 429 },
    );
  active = true;
  let directory: string | undefined;
  try {
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Choose a file first.");
    const chunks: Uint8Array[] = [];
    let total = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > 101 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Files must be smaller than 100 MB." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const form = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const file = form.get("file");
    if (!file || typeof file === "string" || file.size === 0)
      throw new Error("Choose a non-empty file.");
    const options = JSON.parse(String(form.get("options") || "{}"));
    if (!formats.has(options.inputFormat) || !formats.has(options.outputFormat))
      throw new Error("Choose valid input and output formats.");
    if (!file.name.toLowerCase().endsWith("." + options.inputFormat))
      throw new Error(
        "The selected input format does not match this file extension.",
      );
    directory = await mkdtemp(path.join(tmpdir(), "pdf-studio-convert-"));
    const input = path.join(directory, "input." + options.inputFormat);
    await writeFile(input, Buffer.from(await file.arrayBuffer()));
    const result = await runEngine(
      {
        tool: "convert",
        options,
        directory,
        files: [{ path: input, name: file.name }],
      },
      "converter",
    );
    if (!path.resolve(result.path).startsWith(directory + path.sep))
      throw new Error("Invalid conversion output.");
    const data = await readFile(result.path);
    const filename = String(result.name).replace(/[^a-zA-Z0-9._ -]/g, "_");
    return new Response(data, {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "X-Result-Note": encodeURIComponent(result.note || ""),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Conversion failed." },
      { status: 400 },
    );
  } finally {
    active = false;
    if (directory)
      await rm(directory, { force: true, recursive: true }).catch(
        console.error,
      );
  }
}
