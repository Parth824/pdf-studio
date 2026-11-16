"use client";
import Link from "next/link";
import { useState } from "react";
import Icon from "./Icon";
import { categories, tools } from "@/lib/tools";
export default function Header() {
  const [menu, setMenu] = useState(false);
  return (
    <header className="header">
      <div className="header-inner">
        <Link href="/" className="brand" aria-label="PDF Studio home">
          <span className="brand-icon">
            <Icon name="Files" size={23} />
          </span>
          <span>
            PDF<span className="brand-light">studio</span>
            <span className="brand-dot">.</span>
          </span>
        </Link>
        <nav className="main-nav" aria-label="Main navigation">
          <Link href="/merge">MERGE PDF</Link>
          <Link href="/split">SPLIT PDF</Link>
          <Link href="/compress">COMPRESS PDF</Link>
          <Link href="/convert">CONVERT FILES</Link>
          <button onClick={() => setMenu(!menu)} aria-expanded={menu}>
            ALL PDF TOOLS <Icon name="ChevronDown" size={14} />
          </button>
        </nav>
        <div className="header-right">
          <Link href="/workflow" className="workflow-link">
            <Icon name="Workflow" size={17} /> Workflows
          </Link>
          <Link href="/workspace" className="workspace-link">
            My workspace <Icon name="ArrowUpRight" size={15} />
          </Link>
          <button
            className="icon-button menu-toggle"
            onClick={() => setMenu(!menu)}
            aria-label="Toggle tools menu"
            aria-expanded={menu}
          >
            <Icon name={menu ? "X" : "Menu"} size={22} />
          </button>
        </div>
      </div>
      {menu && (
        <div className="mega-menu">
          <div className="mega-inner">
            <Link
              href="/convert"
              className="converter-menu-link"
              onClick={() => setMenu(false)}
            >
              <Icon name="RefreshCw" size={20} /> All file converters —
              archives, images, audio, video & more{" "}
              <Icon name="ArrowRight" size={16} />
            </Link>
            {categories.slice(1).map((category) => (
              <div key={category}>
                <h3>{category}</h3>
                {tools
                  .filter((t) => t.category === category)
                  .map((t) => (
                    <Link
                      key={t.id}
                      href={`/${t.id}`}
                      onClick={() => setMenu(false)}
                    >
                      <span className={`ink-${t.color}`}>
                        <Icon name={t.icon} size={18} />
                      </span>
                      {t.name}
                    </Link>
                  ))}
              </div>
            ))}
          </div>
        </div>
      )}
    </header>
  );
}
