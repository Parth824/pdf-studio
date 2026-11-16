"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { formatBytes } from "./ToolWorkspace";
import { tools } from "@/lib/tools";
export default function Workspace() {
  const [history, setHistory] = useState<
      { tool: string; name: string; size: number; date: string }[]
    >([]),
    [favorites, setFavorites] = useState<string[]>([]);
  useEffect(() => {
    try {
      setHistory(JSON.parse(localStorage.getItem("pdf-history") || "[]"));
      setFavorites(JSON.parse(localStorage.getItem("pdf-favorites") || "[]"));
    } catch {}
  }, []);
  return (
    <main className="simple-page">
      <span className="eyebrow">A LITTLE SPACE OF YOUR OWN</span>
      <h1>My workspace</h1>
      <p>
        Your favorites and recent activity, saved in this browser. Files are
        never stored in your activity history.
      </p>
      <section className="content-card">
        <div className="section-title">
          <h2>Recent activity</h2>
          {history.length > 0 && (
            <button
              className="text-button"
              onClick={() => {
                localStorage.removeItem("pdf-history");
                setHistory([]);
              }}
            >
              Clear history
            </button>
          )}
        </div>
        {history.length ? (
          history.map((entry, i) => (
            <div className="history-row" key={i}>
              <Icon name="FileCheck2" size={23} />
              <div>
                <strong>{entry.tool}</strong>
                <span>
                  {entry.name} · {formatBytes(entry.size)}
                </span>
              </div>
              <time dateTime={entry.date}>
                {new Date(entry.date).toLocaleDateString()}
              </time>
            </div>
          ))
        ) : (
          <div className="empty-state">
            <Icon name="Clock3" size={30} />
            <h2>Your next great document starts here.</h2>
            <p>Completed operations will appear in your activity history.</p>
            <Link href="/" className="primary">
              Find a PDF tool <Icon name="ArrowRight" size={16} />
            </Link>
          </div>
        )}
      </section>
      <section className="content-card">
        <h2>Your favorites</h2>
        {favorites.length ? (
          <div className="result-next">
            {tools
              .filter((t) => favorites.includes(t.id))
              .map((t) => (
                <Link key={t.id} href={`/${t.id}`}>
                  <Icon name={t.icon} size={20} />
                  {t.name}
                  <Icon name="ArrowUpRight" size={15} />
                </Link>
              ))}
          </div>
        ) : (
          <p>Use the star on any tool card to keep it here.</p>
        )}
      </section>
    </main>
  );
}
