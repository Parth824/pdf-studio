"use client";
import { useEffect, useRef, useState } from "react";
import Icon from "./Icon";
import { recordActivity } from "./ToolWorkspace";
const choices = [
  ["rotate", "Rotate 90°"],
  ["compress", "Lossless compression"],
  ["watermark", "Add watermark"],
  ["page-numbers", "Add page numbers"],
];
type Step = { tool: string; text: string };
export default function Workflow() {
  const [steps, setSteps] = useState<Step[]>([
      { tool: "rotate", text: "" },
      { tool: "compress", text: "" },
    ]),
    [file, setFile] = useState<File | null>(null),
    [status, setStatus] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),
    [download, setDownload] = useState("");
  const activeUrl = useRef("");
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem("pdf-workflow") || "null");
      if (Array.isArray(saved) && saved.length) setSteps(saved);
    } catch {}
    return () => {
      if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    };
  }, []);
  async function run() {
    if (!file) return;
    setBusy(true);
    setError("");
    setDownload("");
    if (activeUrl.current) URL.revokeObjectURL(activeUrl.current);
    let current = file;
    try {
      for (let i = 0; i < steps.length; i++) {
        setStatus(
          `Step ${i + 1} of ${steps.length}: ${choices.find((c) => c[0] === steps[i].tool)?.[1]}`,
        );
        const data = new FormData();
        data.append("files", current);
        data.append("tool", steps[i].tool);
        data.append(
          "options",
          JSON.stringify({
            text: steps[i].text,
            angle: 90,
            compression: "balanced",
            fontSize: 36,
            opacity: 0.25,
          }),
        );
        const response = await fetch("/api/process", {
          method: "POST",
          body: data,
        });
        if (!response.ok) throw new Error((await response.json()).error);
        current = new File([await response.blob()], "workflow.pdf", {
          type: "application/pdf",
        });
      }
      const url = URL.createObjectURL(current);
      activeUrl.current = url;
      setDownload(url);
      setStatus("Every step is complete. Your PDF is ready.");
      recordActivity("Workflow", "workflow.pdf", current.size);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Workflow failed.");
      setStatus("");
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="simple-page">
      <span className="eyebrow">MAKE REPETITIVE WORK FEEL EFFORTLESS</span>
      <h1>Your tools. Your flow.</h1>
      <p>
        Chain PDF operations together, save the recipe, and use it again
        whenever you need it.
      </p>
      <section className="content-card">
        <h2>Build your workflow</h2>
        <fieldset disabled={busy} className="settings-fields">
          {steps.map((step, i) => (
            <div className="workflow-step" key={i}>
              <span>{i + 1}</span>
              <select
                aria-label={`Operation for step ${i + 1}`}
                value={step.tool}
                onChange={(e) =>
                  setSteps(
                    steps.map((s, j) =>
                      j === i ? { ...s, tool: e.target.value } : s,
                    ),
                  )
                }
              >
                {choices.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
              {step.tool === "watermark" && (
                <input
                  aria-label="Watermark text"
                  placeholder="Watermark text"
                  value={step.text}
                  onChange={(e) =>
                    setSteps(
                      steps.map((s, j) =>
                        j === i ? { ...s, text: e.target.value } : s,
                      ),
                    )
                  }
                />
              )}
              <button
                className="icon-button"
                aria-label={`Remove step ${i + 1}`}
                disabled={steps.length === 1}
                onClick={() => setSteps(steps.filter((_, j) => i !== j))}
              >
                <Icon name="X" size={17} />
              </button>
            </div>
          ))}
          <div className="workflow-controls">
            <button
              className="secondary"
              disabled={steps.length >= 8}
              onClick={() =>
                setSteps([...steps, { tool: "compress", text: "" }])
              }
            >
              <Icon name="Plus" size={16} /> Add step
            </button>
            <button
              className="secondary"
              onClick={() => {
                localStorage.setItem("pdf-workflow", JSON.stringify(steps));
                setStatus("Workflow saved in this browser.");
              }}
            >
              <Icon name="Save" size={16} /> Save workflow
            </button>
          </div>
          <label className="workflow-file">
            Choose a PDF to run through your workflow
            <input
              type="file"
              accept=".pdf"
              onChange={(e) => {
                setFile(e.target.files?.[0] || null);
                setDownload("");
                setStatus("");
              }}
            />
          </label>
        </fieldset>
        <button className="primary" disabled={!file || busy} onClick={run}>
          {busy ? <span className="spinner" /> : <Icon name="Play" size={17} />}{" "}
          Run workflow
        </button>
        {status && <p role="status">{status}</p>}
        {error && (
          <div className="error-message" role="alert">
            {error}
          </div>
        )}
        {download && (
          <div className="workflow-result">
            <a href={download} download="workflow.pdf" className="primary">
              <Icon name="Download" size={17} /> Download PDF
            </a>
          </div>
        )}
      </section>
    </main>
  );
}
