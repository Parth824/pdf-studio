import Converter from "@/components/Converter";
export const metadata = {
  title: "File Converter — PDF Studio",
  description:
    "Convert archives, audio, video, documents, images, ebooks, fonts and CAD files with local engines.",
};
export default async function ConvertPage({
  searchParams,
}: {
  searchParams: Promise<{ from?: string; to?: string }>;
}) {
  const params = await searchParams;
  return (
    <Converter initialFrom={params.from || ""} initialTo={params.to || ""} />
  );
}
