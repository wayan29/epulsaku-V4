// src/components/products/ProductCard.tsx
import Link from "next/link";
import Image from "next/image";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { LucideIcon } from "lucide-react";
import { ArrowRight, Tag, Bookmark } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ProductCardProps {
  title: string;
  description: string;
  icon?: LucideIcon;
  imageUrl?: string;
  href?: string;
  onClick?: () => void;
  productCount?: number; // Added to display product count
  isSelected?: boolean;
}

export default function ProductCard({
  title,
  description,
  icon: IconComponent,
  imageUrl,
  href,
  onClick,
  productCount,
  isSelected,
}: ProductCardProps) {
  const cardBaseClasses = `group relative text-center bg-[var(--ui-surface)] dark:bg-zinc-950 border-[var(--ui-border)] dark:border-zinc-800 shadow-sm hover:shadow-xl transition-all duration-300 rounded-3xl h-[180px] flex flex-col items-center justify-center p-4 overflow-hidden border`;
  const selectedClasses = isSelected ? 'ring-2 ring-[var(--ui-accent)] border-[var(--ui-accent)]' : '';
  const cursorClass = onClick || href ? 'cursor-pointer hover:-translate-y-1' : 'cursor-default';

  const IconDisplay = IconComponent || Tag;

  const cardContent = (
    <Card className={`${cardBaseClasses} ${selectedClasses} ${cursorClass}`}>
      {productCount !== undefined && (
         <Badge className="absolute top-3 right-3 flex items-center gap-1 bg-[var(--ui-accent)] hover:bg-[var(--ui-accent-hover)] text-white border-none shadow-sm px-2 py-0.5 rounded-full">
            <Bookmark className="h-3 w-3" />
            <span className="font-semibold text-xs">{productCount}</span>
         </Badge>
      )}

      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-white dark:bg-zinc-900 border border-[var(--ui-border)] dark:border-zinc-800 shadow-sm group-hover:shadow-md transition-shadow">
        {imageUrl ? (
          <div className="relative h-10 w-10">
            <Image
              src={imageUrl}
              alt={title}
              fill
              className="object-contain transition-transform group-hover:scale-110 duration-300"
              onError={(e) => (e.currentTarget.style.display = 'none')}
            />
          </div>
        ) : (
          <IconDisplay className="h-8 w-8 text-[var(--ui-accent)] transition-transform group-hover:scale-110 duration-300" />
        )}
      </div>

      <CardTitle className="text-base font-bold text-[var(--ui-text)] dark:text-zinc-100 leading-tight mb-1">{title}</CardTitle>
      <p className="text-xs text-[var(--ui-text-secondary)] dark:text-zinc-500 line-clamp-2 px-1">{description}</p>
    </Card>
  );

  if (href) {
    return (
      <Link href={href} className="block h-full">
        {cardContent}
      </Link>
    );
  }

  if (onClick) {
    return (
      <div onClick={onClick} className="block h-full">
        {cardContent}
      </div>
    );
  }

  return <div className="block h-full">{cardContent}</div>;
}