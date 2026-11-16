# PDF Studio

A responsive Next.js / React PDF toolkit inspired by the tool-grid experience of iLovePDF, with independent branding and a Python document-processing backend. This is a web application; React Native is not required for the browser interface.

The app also includes a **local-only file converter** at `/convert`, with a dark interface, searchable format dropdowns, category catalogue, individual output formats, batch processing, settings, and ZIP downloads. Open `/convert?from=zip&to=rar` for the ZIP-to-RAR workflow. It does not use CloudConvert's API and never sends conversion files to an external service.

## Local file converter

| Category | Local implementation |
| --- | --- |
| Archives | ZIP, TAR, TAR.GZ, TAR.BZ2, TAR.XZ, GZ, BZ2, XZ, 7Z; RAR creation/extraction with installed RAR/UnRAR |
| Audio / video | Installed FFmpeg; format conversion, audio extraction, bitrate, resolution and trimming |
| Images | Pillow + HEIF decoder; common raster formats, quality, proportional resizing, white background when exporting transparency to JPEG |
| Fonts | FontTools: TTF/OTF to WOFF/WOFF2 and compatible web-font round trips; no outline-type rewriting |
| CAD | ezdxf: 2D DXF drawings to SVG, PDF or PNG; no DWG/DWF engine included |
| Documents | Existing PDF engine, local text/HTML/Markdown conversion, Office fallbacks; LibreOffice expands supported Office formats |
| Spreadsheets | CSV/TSV/XLSX table conversion and HTML export use the first worksheet, up to 10,000 rows and 100 columns; LibreOffice adds native workbook formats and workbook PDF export |
| Ebooks | Text/HTML/DOCX to reflowed EPUB; EPUB/FB2/CBZ reading; optional Calibre for other non-DRM ebook formats |
| Vectors | SVG/SVGZ to PDF and raster images; PDF pages to SVG |

The catalogue deliberately distinguishes **available conversions** from **formats needing additional local software**. Listing a format does not mean every possible pair works. Unsupported formats are dimmed. Proprietary formats, DRM-protected books, EOT fonts, font outline conversion, and DWG/DWF are not implemented by the included engines. This is not complete CloudConvert parity.

Archive expansion rejects traversal paths and links, limits entries to 2,000 and expanded content to 200 MB. GZ/BZ2/XZ outputs hold one file; use the TAR variants for multiple entries. FFmpeg receives local filenames and a restricted protocol list. Conversion requests run one at a time; browser batches are processed sequentially. Outputs are downloaded individually or bundled locally in the browser. A 200 MB limit applies to combined ZIP downloads.

The current Windows installation auto-detects FFmpeg at `C:/ffmpeg/bin/ffmpeg.exe` and WinRAR/UnRAR under `C:/Program Files/WinRAR`. RAR creation uses the installed program under its existing license; no license is supplied or bypassed by this project. Override paths through `FFMPEG_PATH`, `RAR_PATH`, `UNRAR_PATH` and `CALIBRE_PATH` when needed.

### Additional local converters

The Windows setup below downloads LibreOffice 26.8.3, 7-Zip 26.06, Calibre Portable 9.18.0, and ImageMagick Portable 7.1.2-35 from their publishers or publisher-listed mirrors. It extracts them inside `.runtime/engines`, without changing default applications or uploading documents. Downloads resume from completed segments. LibreOffice's package is checked against its published SHA-256.

```powershell
.venv\Scripts\python.exe scripts\setup-extra-engines.py
```

The app detects these local copies automatically. Refresh the converter after setup (capabilities are cached for up to 60 seconds). `SEVENZIP_PATH` and `MAGICK_PATH` can override the detected executables.

Setup also initializes a document-free LibreOffice profile template and starts a local Office service. On Windows, conversions reuse that process through a named pipe, avoiding repeated application startup. Jobs run serially, load documents hidden with macros and link updates disabled, and close each document after export. The service starts automatically if needed. The command-line fallback on other platforms uses isolated profile copies. To initialize the profile separately, run `.venv\Scripts\python.exe scripts\warm-office.py`.

- LibreOffice adds legacy DOC/XLS/PPT, Office templates, OpenDocument formats, and supported Pages/Numbers/Keynote imports. Each application uses its own export filters. Import support does not imply export support.
- For DOCX/PPTX/XLSX-to-PDF, a stalled or failed native conversion falls back to local text/table rendering and includes a layout warning in the result. Native conversions have bounded execution times; timed-out Windows child processes are stopped.
- Calibre adds non-DRM MOBI, AZW3, LRF, LIT, PDB, RB, SNB and TCR conversion, alongside EPUB, FB2 and text. It also supplies PDF-to-EPUB conversion. Ebook layouts may reflow.
- Native 7-Zip reads CAB, CPIO, ISO, DMG, ARJ, DEB, RPM, LHA and supported compressed archive inputs. Members are streamed individually into checked local paths under the existing entry and size limits. These formats are not all writable.
- ImageMagick exposes only selected image decoders and encoders reported by the installed build. Additional exports include supported PSD, HEIC, ICNS, EPS and image-extension aliases. External delegates and network image coders are disabled. Camera-model support varies.

Some catalogue formats still require specialist software, including DWG/DWF, MIDI synthesis, EOT/font-outline conversion and several older archive formats. DRM removal and universal conversion between unrelated categories are not provided.

Engine references: [LibreOffice filters](https://help.libreoffice.org/latest/en-US/text/shared/guide/convertfilters.html), [Calibre formats](https://manual.calibre-ebook.com/faq.html#what-formats-does-calibre-support-conversion-to-from), [ImageMagick policy](https://imagemagick.org/security-policy/).

## Run on Windows

Prerequisites: Node.js 20.9+ and Python 3.10+ installed with the Python launcher (`py`).

```powershell
cd E:\pdfCN\pdf-studio
npm.cmd install
npm.cmd run setup:engine
npm.cmd run dev
```

Open **http://localhost:3000**. The setup script creates `.venv`, installs the Python libraries, and downloads English OCR data into `.runtime/tessdata`. If `py` opens the Microsoft Store instead of Python, set `PYTHON_PATH` to an installed Python executable before setup.

After setup, you can also double-click `start-local.cmd`. It starts the production build if one exists, or the development server otherwise.

```powershell
$env:PYTHON_PATH = 'C:\Path\To\Python\python.exe'
npm.cmd run setup:engine
Remove-Item Env:PYTHON_PATH
```

After setup, `PYTHON_PATH` should normally be unset so the application uses the project virtual environment. To use a different environment, set it to that environment's Python executable.

For a production build:

```powershell
npm.cmd run build
npm.cmd start
```

## Functionality

All 33 tool cards have individual workspaces with uploads, settings, processing, error feedback, and downloads. Supported PDF uploads show page thumbnails, page counts, and interactive form-field discovery. The interface includes category filtering, search, favorites, local activity history, responsive layouts, and saved multistep workflows.

| Tools                            | Behavior                                                                                                                     |
| -------------------------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| Merge                            | Combine PDFs in file-list order; move files up/down                                                                          |
| Split                            | Individual PDFs in a ZIP, or selected pages in one PDF                                                                       |
| Extract / remove / organize      | Custom page ranges and page order, including reverse ranges                                                                  |
| Compress                         | Lossless structure optimization, or explicitly selected raster compression; returns original when no size saving is achieved |
| Rotate / crop                    | Rotate selected pages; trim visible page margins                                                                             |
| Edit                             | Add text, images, or a rectangle at coordinates                                                                              |
| Watermark / page numbers         | Apply text watermarks or bottom-center numbering                                                                             |
| Sign                             | Draw a signature or add a typed name; visual signatures only                                                                 |
| Protect / unlock                 | AES-256 encryption; remove encryption with the correct password                                                              |
| Redact                           | Permanently remove matching text and intersecting content; remove metadata and embedded attachments                          |
| Forms                            | Fill discovered fields; create text fields and checkboxes                                                                    |
| PDF to JPG                       | Render selected pages or extract embedded images into a ZIP                                                                  |
| JPG / scan to PDF                | Images to A4 PDF; scan mode adds grayscale contrast and mobile camera capture                                                |
| PDF to Word                      | Editable extracted text; scanned pages embedded as images                                                                    |
| PDF to PowerPoint                | One rendered page image per slide; slide text is not individually editable                                                   |
| PDF to Excel                     | Detected tables, or text rows when no table is found; formula execution is disabled                                          |
| Word / PowerPoint / Excel to PDF | LibreOffice conversion when installed; modern Office files have a reflowed text/table fallback                               |
| HTML to PDF                      | Uploaded or pasted HTML rendered locally; scripts and external resources removed                                             |
| Repair                           | Rewrite recoverable PDF content and structure; does not reconstruct missing data                                             |
| OCR                              | Searchable PDF using English Tesseract data                                                                                  |
| Compare                          | Downloadable page-by-page text diff; visual-only changes are not detected                                                    |
| Summarize                        | Local extractive sentence ranking; not a generative AI model                                                                 |
| PDF to Markdown                  | Extracted text grouped under page headings                                                                                   |
| Translate                        | LibreTranslate integration; requires service configuration; translated text is reflowed                                      |
| PDF/A                            | Ghostscript integration; requires Ghostscript and subsequent independent conformance validation                              |
| Workflows                        | Chain rotation, lossless compression, watermarks, and page numbering                                                         |

This implementation does **not** reproduce every proprietary iLovePDF capability. It does not include cloud-drive integrations, user accounts, billing, remote signature requests, certificate-based signing, AI layout-preserving translation, original-text replacement, automatic form detection, or native desktop/mobile applications. Office fallback conversions do not preserve original layout or images. The tool UI explains these limits.

## Optional engines

Copy `.env.example` to `.env.local` and configure installed tools or services. Restart Next.js after changing settings.

```dotenv
SOFFICE_PATH=C:/Program Files/LibreOffice/program/soffice.exe
GHOSTSCRIPT_PATH=C:/Program Files/gs/gs10.08.0/bin/gswin64c.exe
TRANSLATE_URL=http://127.0.0.1:5000
TRANSLATE_API_KEY=
```

`TRANSLATE_URL` must point to a LibreTranslate-compatible service on this same computer (`localhost`, `127.0.0.1`, or `::1`); remote endpoints are rejected. The engine calls `/translate` only when Translate is used. Supported target languages depend on the locally installed models. For self-hosting, see [LibreTranslate](https://github.com/LibreTranslate/LibreTranslate).

LibreOffice and Ghostscript are auto-detected when available on PATH or in standard Windows installation directories. The `/about` page shows live dependency status. English OCR data is installed by `setup:engine`; the engine also accepts the `TESSDATA_PREFIX` environment variable.

Official downloads: [LibreOffice](https://www.libreoffice.org/download/), [Ghostscript](https://ghostscript.com/releases/gsdnld.html). For archival use, validate PDF/A output with [veraPDF](https://verapdf.org/).

## Deploy with Docker

```bash
docker compose up --build -d
```

The image includes Python, LibreOffice, Ghostscript, Tesseract English data, and document fonts. It runs as an unprivileged user. Compose binds to `127.0.0.1:3000`; use an HTTPS reverse proxy for public access. Translation is configured separately via environment variables. Docker is not required for local development.

The server executes native Python and document engines. It needs a container or VM that permits child processes; it cannot run as a static export or directly in Cloudflare Workers / Sites hosting. No hosted deployment is included.

Before making it public, apply deployment-appropriate request limits, authentication if needed, and infrastructure monitoring. The app's two-job concurrency counter is per Node process, not a distributed queue. The API enforces request, file-count and page-count limits; a reverse proxy should also enforce a 105 MB request-body ceiling. Container memory and CPU limits bound native processing. Abnormal process termination can leave temporary files outside normal cleanup; the supplied container uses ephemeral `/tmp`.

## Validation

```powershell
npm.cmd run typecheck
npm.cmd run test:engine
npm.cmd run test:converter
npm.cmd run build
```

With the local server running, create browser fixtures and run the browser smoke suite:

```powershell
.venv\Scripts\python.exe engine\create_fixtures.py
npm.cmd run test:browser
.venv\Scripts\python.exe engine\verify_browser_outputs.py
```

The browser suite uses installed Edge or Chrome and checks search, favorites, PDF uploads and downloads, password protection, workflows, ZIP-to-RAR, batch ZIP generation, image resizing, and mobile layouts. Screenshots and generated test files are saved under ignored `test-output/`.

The engine suite uses generated sample PDFs, images, and Office files. It checks real outputs: page order/count, ZIP contents, text extraction, permanent redaction, password round trips, annotations, forms, Office conversions, and OCR. It also checks clear errors for missing optional dependencies. OCR tests explicitly skip when language data is unavailable. PDF/A conformance and translation require their optional services for end-to-end validation.

## Structure

```text
app/                  Next.js pages and API route handlers
components/           Home, tool workspaces, settings, workflow builder
lib/tools.ts          Tool catalogue and capability descriptions
lib/engine.ts         Bounded Python subprocess runner
engine/process.py     Document processing operations
engine/test_engine.py Functional output tests
scripts/              Setup and test entrypoints
Dockerfile            Container build with native document engines
```

Temporary uploads are staged under the OS temporary directory and removed after each API request. Downloads use browser object URLs. Favorites, recent operation metadata, and saved workflow definitions are stored in localStorage, not on the server. Fonts are requested from Google Fonts; system fonts are used if that request fails.

PyMuPDF and Ghostscript are available under AGPL or commercial licenses. Review dependency licenses for your intended deployment and distribution. No application license has been selected on the owner's behalf.
