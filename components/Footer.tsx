import Link from "next/link";
import Icon from "./Icon";
export default function Footer() {
  return (
    <footer>
      <div className="footer-top">
        <Link href="/" className="brand">
          <span className="brand-icon">
            <Icon name="Files" size={21} />
          </span>
          <span>
            PDF<span className="brand-light">studio</span>.
          </span>
        </Link>
        <p>A little less paperwork. A little more possibility.</p>
        <div>
          <Link href="/">All tools</Link>
          <Link href="/workflow">Workflows</Link>
          <Link href="/about">About & privacy</Link>
          <Link href="/workspace">My workspace</Link>
        </div>
      </div>
      <div className="footer-bottom">
        <span>
          © {new Date().getFullYear()} PDF Studio. An independent PDF toolkit.
        </span>
        <span>
          <Icon name="Globe2" size={14} /> English{" "}
          <span className="footer-heart">
            Made for your everyday documents.
          </span>
        </span>
      </div>
    </footer>
  );
}
