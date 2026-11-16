"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
export default function About() {
  const [status, setStatus] = useState<Record<string, boolean> | null>(null);
  useEffect(() => {
    fetch("/api/health")
      .then((r) => r.json())
      .then(setStatus)
      .catch(() => setStatus({ engine: false }));
  }, []);
  return (
    <main className="simple-page">
      <span className="eyebrow">BUILT FOR EVERYDAY DOCUMENTS</span>
      <h1>A simpler place for your PDFs.</h1>
      <p>
        PDF Studio is an independent, open-source-ready PDF toolkit built with
        Next.js and a Python document engine. It is not affiliated with
        iLovePDF.
      </p>
      <section className="content-card">
        <h2>Your files, your control</h2>
        <p>
          Your files are sent to this server for processing in temporary job
          folders. Each folder is deleted when its request completes, whether it
          succeeds or fails. Downloads are held in your browser tab until you
          leave or start a new operation. Favorites, workflow recipes, and
          recent activity metadata are stored in this browser only.
        </p>
        <p>
          File conversions use local engines only, with no cloud fallback.
          Translation can use a LibreTranslate service running on this same
          computer; remote translation endpoints are rejected. No analytics,
          advertising trackers, accounts, or cloud storage integrations are
          included.
        </p>
      </section>
      <section className="content-card">
        <h2>More than PDF</h2>
        <p>
          The file converter adds archives, audio, video, images, fonts,
          spreadsheets, ebooks and DXF drawings. The format catalogue checks
          which engines are installed and disables unavailable formats. It
          includes image quality and resize settings, audio bitrate, video
          resolution, media trimming, and batch downloads.
        </p>
        <Link href="/convert" className="text-button">
          Open the local file converter →
        </Link>
      </section>
      <section className="content-card">
        <h2>Processing engine status</h2>
        <table>
          <thead>
            <tr>
              <th>Capability</th>
              <th>Status</th>
              <th>Requirement</th>
            </tr>
          </thead>
          <tbody>
            {[
              ["engine", "Core PDF tools", "Python dependencies"],
              ["office", "Original Office layout", "LibreOffice"],
              ["ocr", "English OCR", "Tesseract English language data"],
              ["pdfa", "Archival conversion", "Ghostscript"],
              ["translate", "Document translation", "LibreTranslate service"],
            ].map(([key, label, requirement]) => (
              <tr key={key}>
                <td>{label}</td>
                <td>
                  <span
                    className={`status-pill ${status && !status[key] ? "unavailable" : ""}`}
                  >
                    {status
                      ? status[key]
                        ? "Ready"
                        : "Setup needed"
                      : "Checking..."}
                  </span>
                </td>
                <td>{requirement}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section className="content-card">
        <h2>What to expect</h2>
        <p>
          The core tools produce real downloadable files. Some conversions
          necessarily change document structure: PDF to Word reflows text;
          PowerPoint exports use page images; Excel extracts tables when
          detected. Without LibreOffice, modern Office files use a text and
          table conversion. OCR recognizes English. Summaries select existing
          sentences; no generative AI service is connected.
        </p>
        <p>
          Signatures are visual signatures. Comparison reports text changes.
          Redaction removes matching text and intersecting content permanently.
          Cropping only changes the visible page area. Review important output
          before sharing. PDF/A output needs independent conformance validation.
        </p>
        <p>
          Limits: 100 MB per request, 50 uploaded files, 500 pages per PDF, two
          processing jobs at once, and three minutes per job. Large scanned
          documents may need smaller batches.
        </p>
      </section>
      <section className="content-card">
        <h2>Made to run on your own server</h2>
        <p>
          The application includes setup scripts, a Docker image definition, a
          deployment guide, and functional engine tests. Hosting must support
          Node.js, Python, and the optional document engines.
        </p>
        <div className="about-links">
          <Link href="/">Explore tools →</Link>
          <Link href="/workflow">Build a workflow →</Link>
        </div>
      </section>
    </main>
  );
}
