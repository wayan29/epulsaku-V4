
// src/app/(app)/tools/layout.tsx
import type { ReactNode } from "react";
import { Card, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Wrench } from "lucide-react";

// Dynamically generate metadata based on the last segment of the path
export async function generateMetadata({ params }: { params: Promise<{ slug?: string | string[] }> }) {
  // This is a basic way to get the last part of the route. For more complex nested routes, you might need a different approach.
  // We'll rely on the page itself to provide the title via its component structure. This metadata is more of a fallback.
  const resolvedParams = await params;
  const slug = Array.isArray(resolvedParams?.slug)
    ? resolvedParams.slug.join('/')
    : resolvedParams?.slug || '';
  const pathSegments = slug.split('/');
  const lastSegment = pathSegments[pathSegments.length - 1] || 'Tools';
  const title = lastSegment.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  return {
    title: `${title} - ePulsaku Tools`,
    description: `Utility tools for ePulsaku application, including checkers and calculators.`,
  };
}


export default function ToolsLayout({ children }: { children: ReactNode }) {
  // We cannot dynamically set CardTitle/Description here easily based on route.
  // So, each page will render its own CardHeader inside the CardContent provided by this layout.
  // This is a simpler approach for this structure.
  
  return (
    <div className="flex justify-center py-8">
      <Card className="relative w-full max-w-2xl overflow-hidden rounded-3xl border-[var(--ui-border)] bg-[var(--ui-surface)] shadow-xl dark:border-zinc-800 dark:bg-zinc-950">
        <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-[var(--ui-top-bar-from)] via-[var(--ui-top-bar-via)] to-[var(--ui-accent-gradient-to)] opacity-80" />
        <CardHeader className="px-6 pt-6 sm:px-8">
           <div className="mb-2 flex items-start gap-4">
             <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--ui-accent-gradient-from)] to-[var(--ui-accent-gradient-to)] text-white shadow-lg">
               <Wrench className="h-6 w-6" />
             </div>
             <div className="space-y-1">
               <CardTitle className="text-xl sm:text-2xl font-headline text-[var(--ui-text)] dark:text-zinc-100">Alat & Utilitas</CardTitle>
               <CardDescription className="text-[var(--ui-text-muted)] dark:text-zinc-400">
             Gunakan alat bantu di bawah ini untuk melakukan pengecekan cepat terkait produk dan layanan.
               </CardDescription>
             </div>
           </div>
        </CardHeader>
        {children}
      </Card>
    </div>
  );
}
