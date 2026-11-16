"use client";
import { useEffect, useRef, useState } from "react";
import { Search, ChevronDown, ChevronRight, X } from "lucide-react";
import formats from "@/lib/conversion-formats.json";
export type FormatCategories = Record<string, string[]>;
export default function FormatPicker({
  value,
  onChange,
  available,
  label,
  compact = false,
  disabled = false,
}: {
  value: string;
  onChange: (value: string) => void;
  available?: Set<string>;
  label: string;
  compact?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false),
    [category, setCategory] = useState("Archive"),
    [query, setQuery] = useState("");
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    function outside(e: PointerEvent) {
      if (!root.current?.contains(e.target as Node)) setOpen(false);
    }
    function key(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", key);
    };
  }, [open]);
  const categories = formats as FormatCategories;
  const items = (
    query
      ? [...new Set(Object.values(categories).flat())]
      : categories[category]
  )
    .filter((f) => f.includes(query.toLowerCase()))
    .sort();
  return (
    <div
      className={`format-picker ${compact ? "compact-picker" : ""}`}
      ref={root}
    >
      <button
        type="button"
        className="format-trigger"
        aria-label={label}
        aria-expanded={open}
        disabled={disabled}
        onClick={() => {
          setOpen(!open);
          setQuery("");
        }}
      >
        <span>{value ? value.toUpperCase() : "ANY"}</span>
        <ChevronDown size={compact ? 14 : 17} />
      </button>
      {open && (
        <div className="format-popover">
          <div className="format-search">
            <Search size={18} />
            <input
              aria-label={`Search ${label.toLowerCase()}`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Format"
              autoFocus
            />
            <button onClick={() => setOpen(false)} aria-label="Close formats">
              <X size={16} />
            </button>
          </div>
          <div className="format-browser">
            <div className="format-categories">
              {Object.keys(categories).map((c) => (
                <button
                  key={c}
                  className={c === category ? "active" : ""}
                  onClick={() => {
                    setCategory(c);
                    setQuery("");
                  }}
                >
                  {c}
                  <ChevronRight size={15} />
                </button>
              ))}
            </div>
            <div className="format-options">
              {!query && (
                <button
                  className={!value ? "selected" : ""}
                  onClick={() => {
                    onChange("");
                    setOpen(false);
                  }}
                >
                  ANY
                </button>
              )}
              {items.map((format) => (
                <button
                  key={format}
                  disabled={!!available && !available.has(format)}
                  className={value === format ? "selected" : ""}
                  title={
                    available && !available.has(format)
                      ? "Requires another local engine or is not compatible with this input"
                      : format.toUpperCase()
                  }
                  onClick={() => {
                    onChange(format);
                    setOpen(false);
                  }}
                >
                  {format.toUpperCase()}
                </button>
              ))}
              {!items.length && <p>No matching formats</p>}
            </div>
          </div>
          <div className="format-help">
            <span /> Available formats use engines on this computer. Dimmed
            formats need another engine.
          </div>
        </div>
      )}
    </div>
  );
}
