"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  Archive,
  ArrowRight,
  ArrowLeftRight,
  BookOpen,
  Check,
  ChevronDown,
  Download,
  File,
  FileText,
  HardDrive,
  Image,
  Layers,
  LoaderCircle,
  LockKeyhole,
  Music2,
  Plus,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Trash2,
  Type,
  UploadCloud,
  Video,
  X,
  Box,
  AlertCircle,
} from "lucide-react";
import Header from "./Header";
import FormatPicker from "./FormatPicker";
import formats from "@/lib/conversion-formats.json";
import { formatBytes, recordActivity } from "./ToolWorkspace";
import { zipDownloads } from "@/lib/download-zip";
type Capabilities = {
  engines: Record<string, boolean>;
  routes: Record<string, string[]>;
  error?: string;
};
type Entry = {
  id: string;
  file: File;
  input: string;
  output: string;
  status: "ready" | "working" | "done" | "error";
  error?: string;
  url?: string;
  blob?: Blob;
  name?: string;
  note?: string;
};
const categories = formats as Record<string, string[]>;
const allFormats = [...new Set(Object.values(categories).flat())].sort(
  (a, b) => b.length - a.length,
);
const preferred = ["pdf", "png", "mp3", "mp4", "zip", "woff2", "epub", "xlsx"];
const icons: Record<string, typeof File> = {
  Archive: Archive,
  Audio: Music2,
  CAD: Box,
  Document: FileText,
  Ebook: BookOpen,
  Font: Type,
  Image: Image,
  Presentation: Layers,
  Spreadsheet: Layers,
  Vector: Box,
  Video: Video,
};
const requirements: Record<string, string> = {
  Archive:
    "ZIP and TAR are built in. Native 7-Zip adds formats such as CAB, CPIO, ISO, DMG, DEB and RPM. RAR uses installed WinRAR / UnRAR. Extraction support differs from archive creation support.",
  Audio:
    "Audio conversion uses FFmpeg. MIDI rendering and proprietary dictation formats need specialized local software.",
  CAD: "DXF renders locally with ezdxf. DWG and DWF require a compatible installed CAD converter; they are not enabled here.",
  Document:
    "PDF and text conversions are built in. LibreOffice enables additional Office formats. Complex layout fidelity depends on the source and engine.",
  Ebook:
    "Calibre enables local Kindle, MOBI, AZW3, LRF and other ebook conversions. DRM-protected books cannot be converted. Some formats support import only.",
  Font: "TTF, OTF, WOFF and WOFF2 use FontTools. CFF/TrueType outline conversion and EOT require another font engine.",
  Image:
    "Pillow handles common images. ImageMagick adds compatible camera RAW and specialized image formats, plus PSD, HEIC, ICNS and EPS outputs. RAW compatibility depends on the camera model.",
  Presentation:
    "PDF to PowerPoint exports page images. PPTX to PDF has a text fallback; LibreOffice adds full slide rendering and more input formats.",
  Spreadsheet:
    "CSV, TSV and XLSX work locally. Install LibreOffice for legacy and OpenDocument formats.",
  Vector:
    "SVG/SVGZ can become PDF or images. LibreOffice Draw adds supported CDR, CGM, EMF, WMF and Visio imports. Some formats and versions still need specialist software.",
  Video:
    "Video and audio extraction run locally through FFmpeg. Available codecs depend on the installed FFmpeg build.",
};
function detect(name: string) {
  return allFormats.find((f) => name.toLowerCase().endsWith("." + f)) || "";
}
export default function Converter({
  initialFrom = "",
  initialTo = "",
}: {
  initialFrom?: string;
  initialTo?: string;
}) {
  const [from, setFrom] = useState(
      allFormats.includes(initialFrom) ? initialFrom : "",
    ),
    [to, setTo] = useState(allFormats.includes(initialTo) ? initialTo : ""),
    [caps, setCaps] = useState<Capabilities | null>(null),
    [entries, setEntries] = useState<Entry[]>([]),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [drag, setDrag] = useState(false),
    [showOptions, setShowOptions] = useState(false),
    [category, setCategory] = useState("Archive"),
    [query, setQuery] = useState(""),
    [options, setOptions] = useState<Record<string, string>>({
      quality: "90",
      width: "",
      height: "",
      bitrate: "192",
      resolution: "original",
      start: "",
      duration: "",
    });
  const input = useRef<HTMLInputElement>(null),
    urls = useRef<Set<string>>(new Set());
  useEffect(() => {
    fetch("/api/convert")
      .then((r) => r.json())
      .then(setCaps)
      .catch(() =>
        setError(
          "The local converter is unavailable. Check that the app and Python engine are running.",
        ),
      );
    return () => {
      urls.current.forEach((url) => URL.revokeObjectURL(url));
    };
  }, []);
  const inputs = new Set(
    Object.entries(caps?.routes || {})
      .filter(([, outputs]) => outputs.length)
      .map(([source]) => source),
  );
  const targets = new Set(
    from ? caps?.routes[from] || [] : Object.values(caps?.routes || {}).flat(),
  );
  const sourceCategory = Object.keys(categories).find((c) =>
    categories[c].includes(from),
  );
  const categoryIcon = icons[sourceCategory || "Document"] || File;
  const SourceIcon = categoryIcon;
  function chooseFrom(value: string) {
    setFrom(value);
    if (value) {
      setCategory(
        Object.keys(categories).find((c) => categories[c].includes(value)) ||
          "Archive",
      );
      if (to && !caps?.routes[value]?.includes(to)) setTo("");
    }
  }
  function chooseTo(value: string) {
    setTo(value);
    setEntries((previous) =>
      previous.map((entry) => {
        if (entry.status === "working") return entry;
        if (entry.url) {
          URL.revokeObjectURL(entry.url);
          urls.current.delete(entry.url);
        }
        return {
          ...entry,
          output: value,
          status: "ready",
          url: undefined,
          blob: undefined,
          name: undefined,
          error: undefined,
        };
      }),
    );
  }
  function add(incoming: File[]) {
    setError("");
    if (
      entries.length + incoming.length > 50 ||
      [...entries.map((e) => e.file), ...incoming].reduce(
        (sum, file) => sum + file.size,
        0,
      ) >
        100 * 1024 * 1024
    ) {
      setError("Add up to 50 files with a combined size of 100 MB.");
      return;
    }
    const added: Entry[] = incoming.map((file) => {
      const source = detect(file.name);
      const choices = caps?.routes[source] || [];
      const target =
        to ||
        (source === "zip" && choices.includes("rar")
          ? "rar"
          : preferred.find((p) => choices.includes(p)) || choices[0] || "");
      const invalid = !source
        ? "This file extension is not in the format catalogue."
        : from && from !== source
          ? `Expected a ${from.toUpperCase()} file. Choose ANY to mix input formats.`
          : !choices.length
            ? "No local engine is installed for this format."
            : undefined;
      return {
        id: crypto.randomUUID(),
        file,
        input: source,
        output: target,
        status: invalid ? "error" : "ready",
        error: invalid,
      };
    });
    setEntries((previous) => [...previous, ...added]);
  }
  function update(id: string, patch: Partial<Entry>) {
    setEntries((previous) =>
      previous.map((entry) =>
        entry.id === id ? { ...entry, ...patch } : entry,
      ),
    );
  }
  function changeOutput(entry: Entry, output: string) {
    if (entry.url) {
      URL.revokeObjectURL(entry.url);
      urls.current.delete(entry.url);
    }
    update(entry.id, {
      output,
      status: "ready",
      url: undefined,
      blob: undefined,
      error: undefined,
      note: undefined,
    });
  }
  async function convertAll() {
    setBusy(true);
    setError("");
    try {
      for (const entry of entries.filter((e) => e.status !== "done")) {
        if (!caps?.routes[entry.input]?.includes(entry.output)) {
          update(entry.id, {
            status: "error",
            error: "Choose a supported output format for this file.",
          });
          continue;
        }
        update(entry.id, { status: "working", error: undefined });
        try {
          const form = new FormData();
          form.append("file", entry.file);
          form.append(
            "options",
            JSON.stringify({
              ...options,
              inputFormat: entry.input,
              outputFormat: entry.output,
            }),
          );
          const response = await fetch("/api/convert", {
            method: "POST",
            body: form,
          });
          if (!response.ok) {
            const message = await response.json();
            throw new Error(message.error || "Conversion failed.");
          }
          const blob = await response.blob();
          const name =
            response.headers
              .get("content-disposition")
              ?.match(/filename="([^"]+)"/)?.[1] || `converted.${entry.output}`;
          const url = URL.createObjectURL(blob);
          urls.current.add(url);
          update(entry.id, {
            status: "done",
            blob,
            url,
            name,
            note: decodeURIComponent(
              response.headers.get("x-result-note") || "",
            ),
          });
          recordActivity(
            `${entry.input.toUpperCase()} to ${entry.output.toUpperCase()}`,
            name,
            blob.size,
          );
        } catch (e) {
          update(entry.id, {
            status: "error",
            error: e instanceof Error ? e.message : "Conversion failed.",
          });
        }
      }
    } finally {
      setBusy(false);
    }
  }
  async function downloadAll() {
    try {
      const ready = entries.filter((e) => e.blob && e.name);
      const blob = await zipDownloads(
        ready.map((e) => ({ name: e.name!, blob: e.blob! })),
      );
      const url = URL.createObjectURL(blob);
      urls.current.add(url);
      const a = document.createElement("a");
      a.href = url;
      a.download = "converted-files.zip";
      a.click();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Unable to package files.");
    }
  }
  const done = entries.filter((e) => e.status === "done").length;
  const visibleFormats = categories[category].filter((f) =>
    f.includes(query.toLowerCase()),
  );
  const heading =
    from && to
      ? `${from.toUpperCase()} to ${to.toUpperCase()} Converter`
      : from
        ? `${from.toUpperCase()} Converter`
        : "Convert any file.";
  return (
    <div className="converter-site">
      <Header />
      <main>
        <section className="convert-hero">
          <div className="convert-hero-inner">
            <div className="convert-intro">
              <div className="convert-kicker">
                <span /> THE LOCAL FILE CONVERTER
              </div>
              <h1>{heading}</h1>
              <p>
                {from && sourceCategory === "Archive" ? (
                  <>
                    Convert your archives between ZIP, RAR, TAR.GZ, 7Z and more.
                    <br className="desktop-break" /> Your files stay on this
                    computer, from upload to download.
                  </>
                ) : (
                  <>
                    One workspace for your documents, images, audio, video,
                    archives,
                    <br className="desktop-break" /> and more. Pick a format.
                    Let your local engines do the rest.
                  </>
                )}
              </p>
              <div className="local-badge">
                <LockKeyhole size={13} /> Local processing. No external uploads.
              </div>
            </div>
            <div className="format-pair">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <div className="format-tile input-tile">
                <SourceIcon size={35} />
                <FormatPicker
                  label="Input format"
                  value={from}
                  onChange={chooseFrom}
                  available={caps ? inputs : undefined}
                  disabled={busy}
                />
              </div>
              <div className="pair-middle">
                <button
                  aria-label="Swap input and output formats"
                  disabled={
                    busy || !from || !to || !caps?.routes[to]?.includes(from)
                  }
                  onClick={() => {
                    const old = from;
                    chooseFrom(to);
                    chooseTo(old);
                  }}
                >
                  <RefreshCw size={22} />
                </button>
                <span>TO</span>
              </div>
              <div className="format-tile output-tile">
                <SourceIcon size={35} />
                <FormatPicker
                  label="Output format"
                  value={to}
                  onChange={chooseTo}
                  available={caps ? targets : undefined}
                  disabled={busy}
                />
              </div>
            </div>
          </div>
        </section>
        <section className="converter-workspace">
          <div
            className={`converter-upload ${drag ? "dragging" : ""} ${entries.length ? "has-files" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDrag(true);
            }}
            onDragLeave={() => setDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDrag(false);
              if (!busy) add(Array.from(e.dataTransfer.files));
            }}
          >
            {!entries.length ? (
              <>
                <UploadCloud
                  className="upload-cloud"
                  size={49}
                  strokeWidth={1.7}
                />
                <h2>Select your file to convert</h2>
                <p>or drop your file here.</p>
                <button
                  className="convert-primary select-file"
                  disabled={!caps || busy}
                  onClick={() => input.current?.click()}
                >
                  <Plus size={21} /> Select File{" "}
                  <span>
                    <ChevronDown size={20} />
                  </span>
                </button>
                <div className="convert-upload-meta">
                  {caps
                    ? "Up to 100 MB · Batch conversion supported"
                    : "Checking local conversion engines…"}
                </div>
              </>
            ) : (
              <>
                <div className="queue-heading">
                  <span>
                    <File size={18} /> {entries.length}{" "}
                    {entries.length === 1 ? "file" : "files"} selected
                  </span>
                  <button
                    disabled={busy}
                    onClick={() => input.current?.click()}
                  >
                    <Plus size={16} /> Add more files
                  </button>
                </div>
                <div className="conversion-queue">
                  {entries.map((entry) => (
                    <div
                      key={entry.id}
                      className={`conversion-row status-${entry.status}`}
                    >
                      <div className="conversion-file">
                        <span className="file-kind">
                          {entry.input.toUpperCase() || "FILE"}
                        </span>
                        <div>
                          <strong title={entry.file.name}>
                            {entry.file.name}
                          </strong>
                          <span>
                            {formatBytes(entry.file.size)}
                            {entry.blob
                              ? ` → ${formatBytes(entry.blob.size)}`
                              : ""}
                          </span>
                        </div>
                      </div>
                      <div className="row-conversion">
                        <span>to</span>
                        <select
                          aria-label={`Output format for ${entry.file.name}`}
                          value={entry.output}
                          disabled={busy}
                          onChange={(e) => changeOutput(entry, e.target.value)}
                        >
                          <option value="">Select</option>
                          {(caps?.routes[entry.input] || []).map((format) => (
                            <option value={format} key={format}>
                              {format.toUpperCase()}
                            </option>
                          ))}
                        </select>
                        <span className="row-status">
                          {entry.status === "working" ? (
                            <>
                              <LoaderCircle className="spin" size={15} />{" "}
                              Converting
                            </>
                          ) : entry.status === "done" ? (
                            <>
                              <Check size={15} /> Done
                            </>
                          ) : entry.status === "error" ? (
                            <>
                              <AlertCircle size={15} /> Error
                            </>
                          ) : (
                            "Ready"
                          )}
                        </span>
                      </div>
                      <div className="row-actions">
                        {entry.url && (
                          <a
                            href={entry.url}
                            download={entry.name}
                            aria-label={`Download ${entry.name}`}
                          >
                            <Download size={18} />
                          </a>
                        )}
                        <button
                          disabled={busy}
                          aria-label={`Remove ${entry.file.name}`}
                          onClick={() => {
                            if (entry.url) {
                              URL.revokeObjectURL(entry.url);
                              urls.current.delete(entry.url);
                            }
                            setEntries(
                              entries.filter((e) => e.id !== entry.id),
                            );
                          }}
                        >
                          <X size={18} />
                        </button>
                      </div>
                      {entry.error && (
                        <p className="row-error">{entry.error}</p>
                      )}
                      {entry.note && <p className="row-note">{entry.note}</p>}
                    </div>
                  ))}
                </div>
                <button
                  className="conversion-options-toggle"
                  onClick={() => setShowOptions(!showOptions)}
                >
                  <Settings2 size={16} /> Conversion options{" "}
                  <ChevronDown size={15} />
                </button>
                {showOptions && (
                  <fieldset className="conversion-options" disabled={busy}>
                    <label>
                      Image quality
                      <select
                        value={options.quality}
                        onChange={(e) =>
                          setOptions({ ...options, quality: e.target.value })
                        }
                      >
                        <option value="100">100% — maximum</option>
                        <option value="90">90% — high</option>
                        <option value="75">75% — balanced</option>
                        <option value="50">50% — small</option>
                      </select>
                    </label>
                    <label>
                      Image max width (px)
                      <input
                        type="number"
                        min="1"
                        placeholder="Original"
                        value={options.width}
                        onChange={(e) =>
                          setOptions({ ...options, width: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Image max height (px)
                      <input
                        type="number"
                        min="1"
                        placeholder="Original"
                        value={options.height}
                        onChange={(e) =>
                          setOptions({ ...options, height: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Audio bitrate
                      <select
                        value={options.bitrate}
                        onChange={(e) =>
                          setOptions({ ...options, bitrate: e.target.value })
                        }
                      >
                        {[64, 96, 128, 192, 256, 320].map((b) => (
                          <option key={b} value={b}>
                            {b} kbps
                          </option>
                        ))}
                      </select>
                    </label>
                    <label>
                      Video resolution
                      <select
                        value={options.resolution}
                        onChange={(e) =>
                          setOptions({ ...options, resolution: e.target.value })
                        }
                      >
                        <option value="original">Original</option>
                        <option value="1080">1080p</option>
                        <option value="720">720p</option>
                        <option value="480">480p</option>
                      </select>
                    </label>
                    <label>
                      Media start (seconds)
                      <input
                        type="number"
                        min="0"
                        value={options.start}
                        placeholder="0"
                        onChange={(e) =>
                          setOptions({ ...options, start: e.target.value })
                        }
                      />
                    </label>
                    <label>
                      Media duration (seconds)
                      <input
                        type="number"
                        min="0"
                        value={options.duration}
                        placeholder="Entire file"
                        onChange={(e) =>
                          setOptions({ ...options, duration: e.target.value })
                        }
                      />
                    </label>
                    <p>
                      Options apply to compatible formats. Font conversions
                      preserve the original outline type. Single-file GZ/BZ2/XZ
                      outputs cannot contain multiple archive entries.
                    </p>
                  </fieldset>
                )}
                <div className="convert-actions">
                  <span>
                    <ShieldCheck size={15} /> Processed on your computer
                  </span>
                  {done > 0 && (
                    <button
                      className="convert-secondary"
                      disabled={busy}
                      onClick={downloadAll}
                    >
                      <Download size={16} /> Download all ({done})
                    </button>
                  )}
                  <button
                    className="convert-primary"
                    disabled={
                      busy || entries.every((e) => e.status === "done") || !caps
                    }
                    onClick={convertAll}
                  >
                    {busy ? (
                      <>
                        <LoaderCircle size={18} className="spin" /> Converting…
                      </>
                    ) : (
                      <>
                        Convert <ArrowRight size={19} />
                      </>
                    )}
                  </button>
                </div>
              </>
            )}
            <input
              type="file"
              className="hidden"
              ref={input}
              multiple
              accept={from ? "." + from : undefined}
              onChange={(e) => {
                add(Array.from(e.target.files || []));
                e.target.value = "";
              }}
            />
          </div>
          {(error || caps?.error) && (
            <div className="converter-error" role="alert">
              <AlertCircle size={18} />
              {error || caps?.error}
            </div>
          )}
          <div className="converter-trust">
            <span>
              <HardDrive size={15} /> Local engines
            </span>
            <i />
            <span>
              <ShieldCheck size={15} /> Temporary files cleaned up
            </span>
            <i />
            <span>
              <Layers size={15} /> Convert files in batches
            </span>
          </div>
        </section>
        <section className="format-catalogue">
          <div className="catalogue-heading">
            <div>
              <span className="convert-kicker">FIND YOUR FORMAT</span>
              <h2>A format for every kind of work.</h2>
              <p>
                Explore the catalogue. Bright formats are available on this
                computer.
              </p>
            </div>
            <label className="catalogue-search">
              <input
                aria-label="Search format catalogue"
                placeholder="Search formats..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
          </div>
          <div className="catalogue-body">
            <div className="catalogue-categories">
              {Object.keys(categories).map((name) => {
                const CategoryIcon = icons[name] || File;
                return (
                  <button
                    key={name}
                    className={category === name ? "active" : ""}
                    onClick={() => {
                      setCategory(name);
                      setQuery("");
                    }}
                  >
                    <CategoryIcon size={17} />
                    {name}
                    <span>{categories[name].length}</span>
                  </button>
                );
              })}
            </div>
            <div className="catalogue-detail">
              <h3>{category} converters</h3>
              <div className="catalogue-formats">
                {visibleFormats.map((format) => (
                  <button
                    key={format}
                    disabled={caps ? !inputs.has(format) : true}
                    className={from === format ? "selected" : ""}
                    title={
                      inputs.has(format)
                        ? `Convert ${format.toUpperCase()} locally`
                        : "Additional local engine required"
                    }
                    onClick={() => {
                      chooseFrom(format);
                      window.scrollTo({ top: 0, behavior: "smooth" });
                    }}
                  >
                    {format.toUpperCase()}
                  </button>
                ))}
              </div>
              <p className="format-requirement">
                <AlertCircle size={15} />
                {requirements[category]}
              </p>
            </div>
          </div>
        </section>
        <section className="popular-conversions">
          <h2>A few everyday favorites</h2>
          <div>
            {[
              ["zip", "rar"],
              ["png", "jpg"],
              ["mp4", "mp3"],
              ["wav", "mp3"],
              ["pdf", "docx"],
              ["docx", "pdf"],
              ["ttf", "woff2"],
              ["dxf", "svg"],
            ].map(([source, target]) => (
              <button
                key={source + target}
                disabled={busy}
                onClick={() => {
                  chooseFrom(source);
                  chooseTo(target);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
              >
                <span>{source.toUpperCase()}</span>
                <ArrowRight size={18} />
                <span>{target.toUpperCase()}</span>
              </button>
            ))}
          </div>
        </section>
        <section className="converter-benefits">
          <div>
            <LockKeyhole size={27} />
            <h3>Your files stay here.</h3>
            <p>
              Conversions run with local software. Your documents are never
              uploaded to a cloud conversion service.
            </p>
          </div>
          <div>
            <Settings2 size={27} />
            <h3>Make the output your own.</h3>
            <p>
              Adjust image quality and dimensions, audio bitrate, video
              resolution, and media trim settings.
            </p>
          </div>
          <div>
            <Layers size={27} />
            <h3>One file, or a whole batch.</h3>
            <p>
              Add multiple files, choose individual output formats, and download
              completed results together.
            </p>
          </div>
        </section>
        <section className="local-engines">
          <div>
            <HardDrive size={22} />
            <h2>Your conversion engines</h2>
          </div>
          <div className="engine-list">
            {Object.entries({
              pillow: "Images",
              pdf: "PDF",
              ffmpeg: "Audio & video",
              rar: "RAR archives",
              sevenzip: "7Z archives",
              archive_native: "7-Zip extended archives",
              imagemagick: "ImageMagick",
              fonts: "Fonts",
              cad: "DXF drawings",
              office: "LibreOffice",
              calibre: "Calibre",
            }).map(([key, label]) => (
              <span key={key} className={caps?.engines[key] ? "ready" : ""}>
                <i />
                {label}
                <small>
                  {caps
                    ? caps.engines[key]
                      ? "Ready"
                      : "Not installed"
                    : "Checking"}
                </small>
              </span>
            ))}
          </div>
          <p>
            {caps &&
              `${inputs.size} input formats currently have a local conversion route. `}
            The catalogue includes formats that require additional local
            engines. Disabled formats are not advertised as working conversions.
            No cloud fallback is used.
          </p>
        </section>
      </main>
      <footer className="converter-footer">
        <Link href="/" className="brand">
          PDFstudio<span>.</span>
        </Link>
        <p>Every file. A little more possibility.</p>
        <div>
          <Link href="/">PDF tools</Link>
          <Link href="/workspace">My workspace</Link>
          <Link href="/about">About & privacy</Link>
        </div>
        <span>Independent software. Not affiliated with CloudConvert.</span>
      </footer>
    </div>
  );
}
