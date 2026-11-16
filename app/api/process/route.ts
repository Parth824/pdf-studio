import { NextRequest, NextResponse } from "next/server";
import { mkdtemp, writeFile, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { runEngine, guardOfficeZip } from "@/lib/engine";
import { tools } from "@/lib/tools";
export const runtime = "nodejs";
export const maxDuration = 180;
let running = 0;
const allowed = new Set([...tools.map((t) => t.id), "inspect"]);
const mime: Record<string, string> = {
  pdf: "application/pdf",
  zip: "application/zip",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  pptx: "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  md: "text/markdown; charset=utf-8",
  txt: "text/plain; charset=utf-8",
};
export async function POST(request: NextRequest) {
  const origin = request.headers.get("origin");
  const hostOrigin = `${request.nextUrl.protocol}//${request.headers.get("host")}`;
  if (origin && origin !== request.nextUrl.origin && origin !== hostOrigin)
    return NextResponse.json(
      { error: "Cross-origin uploads are not allowed." },
      { status: 403 },
    );
  if (running >= 2)
    return NextResponse.json(
      { error: "The processor is busy. Please try again shortly." },
      { status: 429 },
    );
  if (Number(request.headers.get("content-length") || 0) > 105 * 1024 * 1024)
    return NextResponse.json(
      { error: "Upload up to 100 MB per job." },
      { status: 413 },
    );
  running++;
  let directory: string | undefined;
  try {
    // Bound streamed bodies too; Content-Length can be absent on chunked uploads.
    const reader = request.body?.getReader();
    if (!reader) throw new Error("Upload a file or provide HTML content.");
    const chunks: Uint8Array[] = [];
    let received = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      received += value.byteLength;
      if (received > 105 * 1024 * 1024) {
        await reader.cancel();
        return NextResponse.json(
          { error: "Upload up to 100 MB per job." },
          { status: 413 },
        );
      }
      chunks.push(value);
    }
    const data = await new Response(Buffer.concat(chunks), {
      headers: { "Content-Type": request.headers.get("content-type") || "" },
    }).formData();
    const tool = String(data.get("tool") || "");
    if (!allowed.has(tool))
      return NextResponse.json({ error: "Unknown tool." }, { status: 400 });
    const options = JSON.parse(String(data.get("options") || "{}"));
    if (!options || Array.isArray(options) || typeof options !== "object")
      throw new Error("Invalid options.");
    const uploads = data
      .getAll("files")
      .filter((v): v is File => v instanceof File);
    if (
      uploads.length > 50 ||
      uploads.reduce((sum, f) => sum + f.size, 0) > 100 * 1024 * 1024
    )
      throw new Error("Upload up to 50 files and 100 MB per job.");
    directory = await mkdtemp(path.join(tmpdir(), "pdf-studio-"));
    const files = [];
    for (const [i, file] of uploads.entries()) {
      const extension = path.extname(file.name).toLowerCase();
      if (
        ![
          ".pdf",
          ".png",
          ".jpg",
          ".jpeg",
          ".webp",
          ".bmp",
          ".tiff",
          ".heic",
          ".doc",
          ".docx",
          ".ppt",
          ".pptx",
          ".xls",
          ".xlsx",
          ".html",
          ".htm",
        ].includes(extension)
      )
        throw new Error("This file format is not supported.");
      const destination = path.join(directory, `input-${i}${extension}`);
      await writeFile(destination, Buffer.from(await file.arrayBuffer()));
      await guardOfficeZip(destination);
      files.push({ path: destination, name: file.name });
    }
    const result = await runEngine({ tool, options, files, directory });
    if (tool === "inspect")
      return NextResponse.json(result, {
        headers: { "Cache-Control": "no-store" },
      });
    if (
      !result.path ||
      !path.resolve(result.path).startsWith(directory + path.sep)
    )
      throw new Error("Invalid processing result.");
    const bytes = await readFile(result.path);
    const name = String(result.name).replace(/[^a-zA-Z0-9._-]/g, "-");
    return new Response(bytes, {
      headers: {
        "Content-Type":
          mime[name.split(".").pop()!] || "application/octet-stream",
        "Content-Disposition": `attachment; filename="${name}"`,
        "X-Result-Note": encodeURIComponent(result.note || ""),
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Processing failed." },
      { status: 400 },
    );
  } finally {
    running--;
    if (directory)
      await rm(directory, { recursive: true, force: true }).catch(
        console.error,
      );
  }
}
