import Link from "next/link";
import Header from "@/components/Header";
export default function NotFound() {
  return (
    <>
      <Header />
      <main className="empty-state">
        <h1>That page isn’t in this document.</h1>
        <p>Let’s get you back to the tools.</p>
        <Link href="/" className="primary">
          Back to all tools
        </Link>
      </main>
    </>
  );
}
