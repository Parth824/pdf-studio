"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import Icon from "./Icon";
import { categories, tools } from "@/lib/tools";
export default function Home() {
  const [category, setCategory] = useState("All tools"),
    [search, setSearch] = useState(""),
    [favorites, setFavorites] = useState<string[]>([]),
    [onlyFavorites, setOnlyFavorites] = useState(false);
  useEffect(() => {
    try {
      setFavorites(JSON.parse(localStorage.getItem("pdf-favorites") || "[]"));
    } catch {}
  }, []);
  const shown = tools.filter(
    (t) =>
      (category === "All tools" || t.category === category) &&
      `${t.name} ${t.description}`
        .toLowerCase()
        .includes(search.toLowerCase()) &&
      (!onlyFavorites || favorites.includes(t.id)),
  );
  function toggle(id: string) {
    const next = favorites.includes(id)
      ? favorites.filter((f) => f !== id)
      : [...favorites, id];
    setFavorites(next);
    localStorage.setItem("pdf-favorites", JSON.stringify(next));
  }
  return (
    <>
      <section className="hero">
        <div className="eyebrow">
          <span /> YOUR EVERYDAY PDF TOOLKIT
        </div>
        <h1>
          Every PDF tool you need.
          <br />
          <span>All in one happy place.</span>
        </h1>
        <p>
          Big ideas shouldn’t get stuck in documents. Merge, split, compress,
          convert,
          <br className="desktop-break" /> and edit your PDFs with simple tools
          that just make life easier.
        </p>
        <div className="hero-assurances">
          <span>
            <Icon name="Check" size={15} /> No account needed
          </span>
          <span>
            <Icon name="ShieldCheck" size={15} /> Files deleted after processing
          </span>
          <span>
            <Icon name="Zap" size={15} /> Ready in a few clicks
          </span>
        </div>
        <div className="hero-doodle doodle-left">
          <Icon name="FileText" size={49} />
          <span className="doodle-tag">.pdf</span>
        </div>
        <div className="hero-doodle doodle-right">
          <Icon name="Files" size={45} />
          <span className="doodle-star">✦</span>
        </div>
      </section>
      <main className="home-main" id="tools">
        <div className="tool-toolbar">
          <div
            className="category-tabs"
            role="tablist"
            aria-label="Tool categories"
          >
            {categories.map((c) => (
              <button
                role="tab"
                aria-selected={category === c}
                className={category === c ? "active" : ""}
                onClick={() => setCategory(c)}
                key={c}
              >
                {c}
              </button>
            ))}
          </div>
          <div className="search-box">
            <Icon name="Search" size={17} />
            <input
              aria-label="Search PDF tools"
              placeholder="Find a tool..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            {search && (
              <button
                className="icon-button"
                aria-label="Clear search"
                onClick={() => setSearch("")}
              >
                <Icon name="X" size={14} />
              </button>
            )}
          </div>
        </div>
        <div className="tools-meta">
          <span>
            {onlyFavorites
              ? "Your favorite tools"
              : category === "All tools"
                ? "A tool for every to-do"
                : category}
            <span className="count">{shown.length}</span>
          </span>
          <button
            className={
              onlyFavorites ? "favorite-filter selected" : "favorite-filter"
            }
            onClick={() => setOnlyFavorites(!onlyFavorites)}
          >
            <Icon name="Star" size={15} />
            {onlyFavorites ? "Show all tools" : "Favorites"}
          </button>
        </div>
        <div className="tool-grid">
          {shown.map((t) => (
            <article key={t.id} className="tool-card">
              <Link href={`/${t.id}`} className="tool-card-link">
                <div className={`tool-icon color-${t.color}`}>
                  <Icon name={t.icon} size={30} />
                </div>
                <h2>
                  {t.name} {t.badge && <span className="badge">{t.badge}</span>}
                </h2>
                <p>{t.description}</p>
                <span className="card-arrow">
                  <Icon name="ArrowUpRight" size={18} />
                </span>
              </Link>
              <button
                className={`favorite-button ${favorites.includes(t.id) ? "saved" : ""}`}
                aria-label={`${favorites.includes(t.id) ? "Unfavorite" : "Favorite"} ${t.name}`}
                onClick={() => toggle(t.id)}
              >
                <Icon name="Star" size={15} />
              </button>
            </article>
          ))}
        </div>
        {shown.length === 0 && (
          <div className="empty-state">
            <Icon name="Search" size={32} />
            <h2>No tools found</h2>
            <p>Try another search or choose a different category.</p>
            <button
              className="secondary"
              onClick={() => {
                setSearch("");
                setCategory("All tools");
                setOnlyFavorites(false);
              }}
            >
              Show all tools
            </button>
          </div>
        )}
        <Link href="/convert?from=zip&to=rar" className="converter-promo">
          <span className="color-red">
            <Icon name="RefreshCw" size={25} />
          </span>
          <div>
            <span className="eyebrow small">MORE THAN PDF</span>
            <h2>One place for all your file conversions.</h2>
            <p>
              Archives, images, audio, video, fonts and more. Processed locally.
            </p>
          </div>
          <span>
            Explore converters <Icon name="ArrowRight" size={18} />
          </span>
        </Link>
        <section className="workflow-banner">
          <div className="workflow-visual">
            <span>
              <Icon name="Files" size={23} />
            </span>
            <i />
            <span>
              <Icon name="Minimize2" size={23} />
            </span>
            <i />
            <span>
              <Icon name="Check" size={23} />
            </span>
          </div>
          <div>
            <span className="eyebrow small">LESS REPETITION. MORE DONE.</span>
            <h2>Your tools. Your flow.</h2>
            <p>
              Put your everyday PDF tasks on repeat with a reusable workflow.
            </p>
          </div>
          <Link href="/workflow" className="dark-button">
            Create a workflow <Icon name="ArrowRight" size={17} />
          </Link>
        </section>
        <section className="benefits">
          <div>
            <div className="benefit-icon">
              <Icon name="MousePointer2" size={24} />
            </div>
            <h3>Simple by design</h3>
            <p>
              Choose a tool, add your files, and you’re on your way. No manuals
              required.
            </p>
          </div>
          <div>
            <div className="benefit-icon">
              <Icon name="ShieldCheck" size={24} />
            </div>
            <h3>Your documents stay yours</h3>
            <p>
              Files are processed temporarily and deleted when your request
              completes.
            </p>
          </div>
          <div>
            <div className="benefit-icon">
              <Icon name="Laptop" size={24} />
            </div>
            <h3>Wherever work finds you</h3>
            <p>
              A responsive workspace that feels at home on your phone, tablet,
              or computer.
            </p>
          </div>
        </section>
      </main>
      <section className="closing">
        <span className="closing-icon">
          <Icon name="Heart" size={22} />
        </span>
        <h2>Good documents. Less effort.</h2>
        <p>More space for the work that matters.</p>
        <a href="#tools">
          Explore all PDF tools <Icon name="ArrowUpRight" size={16} />
        </a>
      </section>
    </>
  );
}
