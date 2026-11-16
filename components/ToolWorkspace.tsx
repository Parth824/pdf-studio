"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Tool, tools } from "@/lib/tools";
import Icon from "./Icon";
import Signature from "./Signature";
type Preview = {
  pages: number;
  thumbnails: { page: number; image: string; width: number; height: number }[];
  fields: { name: string; value: string; type: string }[];
};
type Options = Record<string, string | number | Record<string, string>>;
export function formatBytes(n: number) {
  return n < 1024
    ? `${n} B`
    : n < 1024 * 1024
      ? `${(n / 1024).toFixed(1)} KB`
      : `${(n / 1024 / 1024).toFixed(1)} MB`;
}
export function recordActivity(tool: string, name: string, size: number) {
  try {
    const previous = JSON.parse(localStorage.getItem("pdf-history") || "[]");
    localStorage.setItem(
      "pdf-history",
      JSON.stringify(
        [
          { tool, name, size, date: new Date().toISOString() },
          ...previous,
        ].slice(0, 30),
      ),
    );
  } catch {}
}
export default function ToolWorkspace({ tool }: { tool: Tool }) {
  const [files, setFiles] = useState<File[]>([]),
    [options, setOptions] = useState<Options>({
      pages: "",
      text: "",
      angle: 90,
      fontSize: tool.id === "watermark" ? 36 : 16,
      opacity: 0.25,
      margin: 24,
      x: 48,
      y: 72,
      width: 180,
      height: 70,
      compression: "balanced",
      splitMode: "each",
      editMode: "text",
      imageMode: "pages",
      orientation: "portrait",
      formMode: "fill",
      language: "es",
      sentences: 5,
      start: 1,
      color: "#222222",
      newPassword: "",
      password: "",
    }),
    [preview, setPreview] = useState<Preview | null>(null),
    [previewBusy, setPreviewBusy] = useState(false),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [previewError, setPreviewError] = useState(""),
    [dragging, setDragging] = useState(false),
    [result, setResult] = useState<{
      url: string;
      name: string;
      size: number;
      note: string;
      text?: string;
    } | null>(null),
    [capabilities, setCapabilities] = useState<Record<string, boolean> | null>(
      null,
    );
  const input = useRef<HTMLInputElement>(null),
    resultUrl = useRef(""),
    previewRequest = useRef(0);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setCapabilities)
      .catch(() => {});
    return () => {
      if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    };
  }, []);
  function option(
    key: string,
    value: string | number | Record<string, string>,
  ) {
    setOptions((previous) => ({ ...previous, [key]: value }));
  }
  function clearResult() {
    if (resultUrl.current) URL.revokeObjectURL(resultUrl.current);
    resultUrl.current = "";
    setResult(null);
  }
  async function inspect(
    file: File,
    password = String(options.password || ""),
  ) {
    const requestId = ++previewRequest.current;
    setPreviewBusy(true);
    setPreviewError("");
    setPreview(null);
    try {
      const form = new FormData();
      form.append("tool", "inspect");
      form.append("files", file);
      form.append("options", JSON.stringify({ password }));
      const response = await fetch("/api/process", {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error);
      if (requestId !== previewRequest.current) return;
      setPreview(data);
      if (data.fields?.length)
        option(
          "fields",
          Object.fromEntries(
            data.fields.map((f: { name: string; value: unknown }) => [
              f.name,
              String(f.value || ""),
            ]),
          ),
        );
    } catch (e) {
      if (requestId === previewRequest.current)
        setPreviewError(
          e instanceof Error ? e.message : "Preview unavailable.",
        );
    } finally {
      if (requestId === previewRequest.current) setPreviewBusy(false);
    }
  }
  function addFiles(incoming: File[]) {
    setError("");
    clearResult();
    let next = tool.multiple ? [...files, ...incoming] : incoming.slice(0, 1);
    if (
      next.length > 50 ||
      next.reduce((s, f) => s + f.size, 0) > 100 * 1024 * 1024
    ) {
      setError("Choose up to 50 files and 100 MB in total.");
      return;
    }
    const accepted = tool.accept || ".pdf";
    const invalid = next.some(
      (f) =>
        !accepted
          .split(",")
          .some((a) =>
            a === "image/*"
              ? f.type.startsWith("image/")
              : a.startsWith(".")
                ? f.name.toLowerCase().endsWith(a)
                : f.type === a,
          ),
    );
    if (invalid) {
      setError(`Please choose ${tool.accept || "PDF"} files for this tool.`);
      return;
    }
    setFiles(next);
    if (next[0]?.name.toLowerCase().endsWith(".pdf")) {
      if (next[0] !== files[0]) void inspect(next[0]);
    } else {
      ++previewRequest.current;
      setPreview(null);
      setPreviewError("");
      setPreviewBusy(false);
    }
  }
  async function processFiles() {
    setError("");
    setBusy(true);
    clearResult();
    try {
      const form = new FormData();
      form.append("tool", tool.id);
      form.append("options", JSON.stringify(options));
      files.forEach((f) => form.append("files", f));
      const response = await fetch("/api/process", {
        method: "POST",
        body: form,
      });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Processing failed.");
      }
      const blob = await response.blob();
      const name =
        response.headers
          .get("content-disposition")
          ?.match(/filename="([^"]+)"/)?.[1] || "result.pdf";
      const note = decodeURIComponent(
        response.headers.get("x-result-note") || "",
      );
      const url = URL.createObjectURL(blob);
      resultUrl.current = url;
      const text = /\.(md|txt)$/.test(name) ? await blob.text() : undefined;
      setResult({ url, name, size: blob.size, note, text });
      recordActivity(tool.name, name, blob.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to process this file.");
    } finally {
      setBusy(false);
    }
  }
  function removeFile(i: number) {
    const next = files.filter((_, j) => i !== j);
    setFiles(next);
    clearResult();
    if (i === 0) {
      ++previewRequest.current;
      setPreview(null);
      setPreviewError("");
      setPreviewBusy(false);
      if (next[0]?.name.toLowerCase().endsWith(".pdf")) void inspect(next[0]);
    }
  }
  function moveFile(i: number, direction: number) {
    const next = [...files];
    [next[i], next[i + direction]] = [next[i + direction], next[i]];
    setFiles(next);
    clearResult();
    if ((i === 0 || i + direction === 0) && next[0]?.name.toLowerCase().endsWith(".pdf")) {
      void inspect(next[0]);
    }
  }
  const field = (
    key: string,
    label: string,
    type = "text",
    placeholder = "",
    extra: Record<string, string | number> = {},
  ) => (
    <label className="field" key={key}>
      {label}
      <input
        type={type}
        value={String(options[key] ?? "")}
        placeholder={placeholder}
        onChange={(e) =>
          option(
            key,
            type === "number"
              ? e.target.value === ""
                ? ""
                : Number(e.target.value)
              : e.target.value,
          )
        }
        {...extra}
      />
    </label>
  );
  const select = (key: string, label: string, choices: [string, string][]) => (
    <label className="field" key={key}>
      {label}
      <select
        value={String(options[key] ?? "")}
        onChange={(e) => option(key, e.target.value)}
      >
        {choices.map(([v, l]) => (
          <option value={v} key={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
  const textArea = (key: string, label: string, placeholder: string) => (
    <label className="field" key={key}>
      {label}
      <textarea
        rows={4}
        value={String(options[key] ?? "")}
        onChange={(e) => option(key, e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
  const unsupported =
    capabilities &&
    (capabilities.engine === false
      ? "The PDF engine needs setup. Run npm run setup:engine."
      : tool.id === "translate" && !capabilities.translate
        ? "Connect a LibreTranslate service on the server to enable translation."
        : tool.id === "pdfa" && !capabilities.pdfa
          ? "Install Ghostscript on the server to enable PDF/A conversion."
          : tool.id === "ocr" && !capabilities.ocr
            ? "Run npm run setup:engine to install English OCR language data."
            : "");
  const hasPages =
    !tool.accept &&
    !["merge", "protect", "unlock", "repair", "compare"].includes(tool.id);
  return (
    <main className="tool-page">
      <div className="breadcrumb">
        <Link href="/">All tools</Link>
        <Icon name="ChevronRight" size={13} />
        <span>{tool.name}</span>
      </div>
      <section className="tool-heading">
        <div className={`tool-icon color-${tool.color}`}>
          <Icon name={tool.icon} size={30} />
        </div>
        <h1>{tool.name}</h1>
        <p>{tool.description}</p>
      </section>
      {result ? (
        <section className="result-panel">
          <div className="success-icon">
            <Icon name="Check" size={36} />
          </div>
          <span className="eyebrow small">ALL DONE</span>
          <h2>Your document is ready.</h2>
          <p>
            {result.name} <span className="dot-separator">·</span>{" "}
            {formatBytes(result.size)}
          </p>
          <a
            className="primary download-button"
            href={result.url}
            download={result.name}
          >
            <Icon name="Download" size={20} /> Download{" "}
            {result.name.split(".").pop()?.toUpperCase()}
          </a>
          {result.note && (
            <div className="notice">
              <Icon name="Info" size={18} />
              <p>{result.note}</p>
            </div>
          )}
          {result.text && <pre className="text-preview">{result.text}</pre>}
          <button className="text-button" onClick={clearResult}>
            <Icon name="RotateCcw" size={15} /> Back to editing
          </button>
          <div className="result-next">
            <p>Keep the good work going</p>
            {tools
              .filter(
                (t) =>
                  ["merge", "compress", "protect"].includes(t.id) &&
                  t.id !== tool.id,
              )
              .map((t) => (
                <Link key={t.id} href={`/${t.id}`}>
                  <Icon name={t.icon} size={18} />
                  {t.name}
                  <Icon name="ArrowRight" size={16} />
                </Link>
              ))}
          </div>
        </section>
      ) : (
        <div className="workbench">
          <div className="document-area">
            <div
              className={`dropzone ${dragging ? "drag-active" : ""} ${files.length ? "compact" : ""}`}
              onDragOver={(e) => {
                e.preventDefault();
                setDragging(true);
              }}
              onDragLeave={() => setDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragging(false);
                if (!busy) addFiles(Array.from(e.dataTransfer.files));
              }}
            >
              <div className="upload-illustration">
                <Icon
                  name={tool.id === "scan" ? "Camera" : "FileUp"}
                  size={39}
                />
                <span>
                  <Icon name="Plus" size={15} />
                </span>
              </div>
              <h2>
                {files.length
                  ? "Add more files"
                  : "A fresh start for your document"}
              </h2>
              <p>
                Drag and drop{" "}
                {tool.accept
                  ? "your files"
                  : "your PDF" + (tool.multiple ? "s" : "")}{" "}
                here, or choose from your device.
              </p>
              <button
                className="primary"
                disabled={busy}
                onClick={() => input.current?.click()}
              >
                <Icon name={tool.id === "scan" ? "Camera" : "Plus"} size={20} />
                {tool.id === "scan"
                  ? "Capture or select images"
                  : files.length && !tool.multiple
                    ? "Replace file"
                    : "Select " + (tool.accept ? "files" : "PDF files")}
              </button>
              <input
                ref={input}
                type="file"
                accept={tool.accept || ".pdf"}
                multiple={!!tool.multiple}
                capture={tool.id === "scan" ? "environment" : undefined}
                className="hidden"
                onChange={(e) => {
                  addFiles(Array.from(e.target.files || []));
                  e.target.value = "";
                }}
              />
              <span className="upload-limit">
                Up to 100 MB per job · {tool.multiple ? "50 files" : "1 file"}
              </span>
            </div>
            {files.length > 0 && (
              <div className="file-list">
                {files.map((file, i) => (
                  <div className="file-row" key={`${file.name}-${i}`}>
                    <span className="file-symbol">
                      <Icon name="FileText" size={22} />
                    </span>
                    <div>
                      <strong>{file.name}</strong>
                      <span>
                        {formatBytes(file.size)}
                        {i === 0 && preview ? ` · ${preview.pages} pages` : ""}
                      </span>
                    </div>
                    <div className="file-actions">
                      {tool.multiple && (
                        <>
                          <button
                            className="icon-button"
                            disabled={i === 0 || busy}
                            aria-label={`Move ${file.name} up`}
                            onClick={() => moveFile(i, -1)}
                          >
                            <Icon name="ChevronUp" size={17} />
                          </button>
                          <button
                            className="icon-button"
                            disabled={i === files.length - 1 || busy}
                            aria-label={`Move ${file.name} down`}
                            onClick={() => moveFile(i, 1)}
                          >
                            <Icon name="ChevronDown" size={17} />
                          </button>
                        </>
                      )}
                      <button
                        className="icon-button"
                        disabled={busy}
                        aria-label={`Remove ${file.name}`}
                        onClick={() => removeFile(i)}
                      >
                        <Icon name="X" size={18} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {previewBusy && (
              <div className="preview-loading">
                <span className="spinner" /> Reading pages...
              </div>
            )}
            {previewError && (
              <div className="notice">
                <Icon name="Info" size={18} />
                <p>
                  {previewError}{" "}
                  {previewError.toLowerCase().includes("password") &&
                    "Enter the password in settings, then refresh the preview."}
                </p>
              </div>
            )}
            {preview && (
              <section className="page-preview">
                <div className="section-title">
                  <h3>
                    Document preview <span>{preview.pages} pages</span>
                  </h3>
                  <button
                    className="text-button"
                    onClick={() => void inspect(files[0])}
                  >
                    <Icon name="RefreshCw" size={14} /> Refresh
                  </button>
                </div>
                {["organize", "extract", "remove", "split"].includes(
                  tool.id,
                ) && (
                  <p className="hint">
                    Click a page to add or remove its number in the page
                    selection. Enter a custom order in settings.
                  </p>
                )}
                <div className="thumbnail-grid">
                  {preview.thumbnails.map((p) => (
                    <button
                      type="button"
                      className={`thumbnail ${String(options.pages).split(",").includes(String(p.page)) ? "chosen" : ""}`}
                      key={p.page}
                      aria-label={`Select page ${p.page}`}
                      onClick={() => {
                        if (
                          !["organize", "extract", "remove", "split"].includes(
                            tool.id,
                          )
                        )
                          return;
                        const chosen = String(options.pages)
                          .split(",")
                          .filter(Boolean);
                        option(
                          "pages",
                          chosen.includes(String(p.page))
                            ? chosen
                                .filter((n) => n !== String(p.page))
                                .join(",")
                            : [...chosen, String(p.page)].join(","),
                        );
                      }}
                    >
                      <img
                        src={`data:image/png;base64,${p.image}`}
                        alt={`Preview of page ${p.page}`}
                        width={130}
                        height={184}
                      />
                      <span>{p.page}</span>
                    </button>
                  ))}
                </div>
                {preview.pages > 60 && (
                  <p className="hint">
                    Showing the first 60 pages. All {preview.pages} pages can be
                    processed using page ranges.
                  </p>
                )}
              </section>
            )}
            <div className="privacy-note">
              <Icon name="ShieldCheck" size={16} />
              <span>
                Uploads are deleted from the server after each request.
                Downloads stay in this tab.
              </span>
            </div>
          </div>
          <aside className="settings-panel">
            <div className="settings-title">
              <Icon name="SlidersHorizontal" size={18} />
              <h2>{tool.name} settings</h2>
            </div>
            <fieldset disabled={busy} className="settings-fields">
              {unsupported && (
                <div className="notice warning">
                  <Icon name="Info" size={18} />
                  <p>{unsupported}</p>
                </div>
              )}
              {hasPages && (
                <>
                  {field(
                    "pages",
                    tool.id === "remove"
                      ? "Pages to remove"
                      : tool.id === "organize"
                        ? "Page order"
                        : "Pages",
                    "text",
                    "All pages, e.g. 1,3,5-8",
                  )}
                  <p className="hint">
                    {tool.id === "organize"
                      ? "Enter pages in your preferred order, e.g. 3,1,2."
                      : "Leave empty for all pages unless removing pages."}
                  </p>
                </>
              )}
              {tool.id === "merge" && (
                <p className="settings-description">
                  Files are merged from top to bottom. Use the arrows next to
                  each file to change their order.
                </p>
              )}
              {tool.id === "split" &&
                select("splitMode", "Split mode", [
                  ["each", "One PDF per page (ZIP)"],
                  ["range", "Selected pages in one PDF"],
                ])}
              {tool.id === "compress" && (
                <>
                  {select("compression", "Compression level", [
                    ["balanced", "Lossless — preserve content"],
                    ["strong", "Strong — smaller, image-based PDF"],
                  ])}
                  {options.compression === "strong" && (
                    <p className="hint">
                      Strong compression converts pages to images and removes
                      selectable text, links, and forms.
                    </p>
                  )}
                </>
              )}
              {tool.id === "rotate" &&
                select("angle", "Rotate clockwise", [
                  ["90", "90° clockwise"],
                  ["180", "180°"],
                  ["270", "90° counterclockwise"],
                ])}
              {["watermark", "redact"].includes(tool.id) &&
                textArea(
                  "text",
                  tool.id === "redact"
                    ? "Text to redact (one phrase per line)"
                    : "Watermark text",
                  tool.id === "redact"
                    ? "Enter exact words or phrases"
                    : "CONFIDENTIAL",
                )}
              {tool.id === "watermark" && (
                <>
                  {field("fontSize", "Font size", "number", "", {
                    min: 6,
                    max: 144,
                  })}
                  <label className="field">
                    Opacity · {Math.round(Number(options.opacity) * 100)}%
                    <input
                      type="range"
                      min="0.05"
                      max="1"
                      step="0.05"
                      value={Number(options.opacity)}
                      onChange={(e) =>
                        option("opacity", Number(e.target.value))
                      }
                    />
                  </label>
                  {field("color", "Text color", "color")}
                </>
              )}
              {tool.id === "edit" && (
                <>
                  {select("editMode", "Add to document", [
                    ["text", "Text annotation"],
                    ["image", "Image"],
                    ["rectangle", "Rectangle"],
                  ])}
                  {options.editMode === "text" ? (
                    <>
                      {field("text", "Text", "text", "Your text here")}
                      {field("fontSize", "Font size", "number", "", {
                        min: 6,
                        max: 144,
                      })}
                    </>
                  ) : options.editMode === "image" ? (
                    <label className="field">
                      Image
                      <input
                        type="file"
                        accept="image/png,image/jpeg"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            if (file.size > 5 * 1024 * 1024) {
                              setError("Annotation images must be under 5 MB.");
                              return;
                            }
                            const reader = new FileReader();
                            reader.onload = () =>
                              option("image", String(reader.result));
                            reader.readAsDataURL(file);
                          }
                        }}
                      />
                    </label>
                  ) : null}
                  {field("color", "Color", "color")}
                </>
              )}
              {tool.id === "sign" && (
                <>
                  <label className="field">Draw your signature</label>
                  <Signature onChange={(image) => option("signature", image)} />
                  {field("text", "Or type your name", "text", "Your name")}
                  <p className="hint">
                    A drawn signature takes precedence over a typed name.
                  </p>
                </>
              )}
              {["edit", "sign", "forms"].includes(tool.id) &&
                (tool.id !== "forms" || options.formMode === "create") && (
                  <>
                    <div className="field-pair">
                      {field("x", "X position (pt)", "number", "", { min: 0 })}
                      {field("y", "Y position (pt)", "number", "", { min: 0 })}
                    </div>
                    {(tool.id === "sign" ||
                      (tool.id === "edit" && options.editMode !== "text")) && (
                      <div className="field-pair">
                        {field("width", "Width (pt)", "number", "", {
                          min: 10,
                        })}
                        {field("height", "Height (pt)", "number", "", {
                          min: 10,
                        })}
                      </div>
                    )}
                    <p className="hint">
                      Positions start at the top left. A4 pages are about 595 ×
                      842 points.
                    </p>
                  </>
                )}
              {tool.id === "crop" &&
                field("margin", "Trim each edge (points)", "number", "", {
                  min: 0,
                  max: 500,
                })}
              {["jpg-pdf", "scan"].includes(tool.id) && (
                <>
                  {select("orientation", "Page orientation", [
                    ["portrait", "A4 portrait"],
                    ["landscape", "A4 landscape"],
                  ])}
                  {field("margin", "Page margin (points)", "number", "", {
                    min: 0,
                    max: 150,
                  })}
                </>
              )}
              {tool.id === "page-numbers" && (
                <>
                  {field("start", "Start numbering at", "number", "", {
                    min: 1,
                  })}
                  {field("color", "Number color", "color")}
                  <p className="hint">
                    Numbers appear centered at the bottom of the page.
                  </p>
                </>
              )}
              {tool.id === "pdf-jpg" && (
                <>
                  {select("imageMode", "Conversion mode", [
                    ["pages", "Render pages as JPG"],
                    ["extract", "Extract embedded images"],
                  ])}
                  {select("dpi", "Image resolution", [
                    ["72", "72 DPI — screen"],
                    ["150", "150 DPI — standard"],
                    ["200", "200 DPI — high quality"],
                  ])}
                </>
              )}
              {tool.id === "protect" &&
                field(
                  "newPassword",
                  "New password",
                  "password",
                  "At least 6 characters",
                  { minLength: 6 },
                )}
              {!tool.accept && (
                <details
                  className="password-details"
                  open={
                    tool.id === "unlock" ||
                    !!previewError.toLowerCase().includes("password")
                  }
                >
                  <summary>Document password</summary>
                  {field(
                    "password",
                    "Existing password (if encrypted)",
                    "password",
                    "Enter PDF password",
                  )}
                  {files[0] && (
                    <button
                      type="button"
                      className="text-button"
                      onClick={() => void inspect(files[0])}
                    >
                      Unlock preview
                    </button>
                  )}
                </details>
              )}
              {tool.id === "html-pdf" &&
                textArea(
                  "html",
                  "Or paste HTML",
                  "<h1>Hello, PDF!</h1>\n<p>Your content here.</p>",
                )}
              {tool.id === "forms" && (
                <>
                  {select("formMode", "Form operation", [
                    ["fill", "Fill existing fields"],
                    ["create", "Create a new field"],
                  ])}
                  {options.formMode === "create" ? (
                    <>
                      {field("fieldName", "Field name", "text", "Full name")}
                      {select("fieldType", "Field type", [
                        ["text", "Text field"],
                        ["checkbox", "Checkbox"],
                      ])}
                    </>
                  ) : preview?.fields.length ? (
                    preview.fields.map((f) => (
                      <label className="field" key={f.name}>
                        {f.name}
                        <input
                          value={
                            (options.fields as Record<string, string>)?.[
                              f.name
                            ] || ""
                          }
                          onChange={(e) =>
                            option("fields", {
                              ...((options.fields as Record<string, string>) ||
                                {}),
                              [f.name]: e.target.value,
                            })
                          }
                        />
                        {f.type === "CheckBox" && (
                          <span className="hint">
                            Use Yes to check, Off to uncheck.
                          </span>
                        )}
                      </label>
                    ))
                  ) : (
                    <p className="hint">
                      Upload a fillable PDF to see its fields, or create a new
                      field.
                    </p>
                  )}
                </>
              )}
              {tool.id === "summarize" &&
                field("sentences", "Number of key sentences", "number", "", {
                  min: 1,
                  max: 20,
                })}
              {tool.id === "translate" &&
                select("language", "Translate into", [
                  ["es", "Spanish"],
                  ["fr", "French"],
                  ["de", "German"],
                  ["hi", "Hindi"],
                  ["en", "English"],
                  ["pt", "Portuguese"],
                  ["it", "Italian"],
                  ["ja", "Japanese"],
                ])}
              {tool.note && (
                <p className="tool-note">
                  <Icon name="Info" size={15} />
                  {tool.note}
                </p>
              )}
            </fieldset>
            {error && (
              <div className="error-message" role="alert">
                <Icon name="AlertCircle" size={18} />
                {error}
              </div>
            )}
            <button
              className="primary process-button"
              disabled={
                busy ||
                !!unsupported ||
                (!files.length && !(tool.id === "html-pdf" && options.html))
              }
              onClick={processFiles}
            >
              {busy ? (
                <>
                  <span className="spinner" /> Processing...
                </>
              ) : (
                <>
                  {tool.name}
                  <Icon name="ArrowRight" size={19} />
                </>
              )}
            </button>
            <p className="process-hint">
              {busy
                ? "Please keep this tab open. Large files can take a few minutes."
                : "Your finished file will be ready to download."}
            </p>
          </aside>
        </div>
      )}
    </main>
  );
}
