import { notFound } from "next/navigation";
import { tools } from "@/lib/tools";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import ToolWorkspace from "@/components/ToolWorkspace";
export async function generateMetadata({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: id } = await params;
  const tool = tools.find((t) => t.id === id);
  return { title: tool ? `${tool.name} — PDF Studio` : "Tool not found" };
}
export default async function ToolPage({
  params,
}: {
  params: Promise<{ tool: string }>;
}) {
  const { tool: id } = await params;
  const tool = tools.find((t) => t.id === id);
  if (!tool) notFound();
  return (
    <>
      <Header />
      <ToolWorkspace key={tool.id} tool={tool} />
      <Footer />
    </>
  );
}
