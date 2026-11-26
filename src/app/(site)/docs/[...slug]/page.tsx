import { docMetadata, DocPage, docParams } from "@/site/pages/DocPage";

// Only the pages that exist are built.
export const dynamicParams = false;
export function generateStaticParams() {
  return docParams();
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return docMetadata("en", slug.join("/"));
}

export default async function Page({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  return <DocPage lang="en" slug={slug.join("/")} />;
}
