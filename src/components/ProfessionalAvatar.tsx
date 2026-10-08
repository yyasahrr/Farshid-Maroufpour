import Image from "next/image";
import { isRemoteImage } from "@/lib/service-media";

type AvatarSize = "sm" | "md" | "lg" | "xl";
const SIZE_CLASS: Record<AvatarSize, string> = {
  sm: "h-9 w-9 text-sm",
  md: "h-12 w-12 text-base",
  lg: "h-16 w-16 text-xl",
  xl: "h-24 w-24 text-3xl",
};

/** Shared, consistently circular barber/team identity image with a safe initials fallback. */
export function ProfessionalAvatar({
  name,
  imageUrl,
  size = "md",
  className = "",
  decorative = false,
}: {
  name: string;
  imageUrl?: string | null;
  size?: AvatarSize;
  className?: string;
  decorative?: boolean;
}) {
  const image = imageUrl?.trim();
  const initial = [...name.trim()][0] ?? "؟";

  return (
    <span
      className={`relative isolate inline-grid shrink-0 place-items-center overflow-hidden rounded-full border-2 border-white bg-brand-50 font-black text-brand-700 shadow-sm ring-1 ring-brand-900/10 ${SIZE_CLASS[size]} ${className}`}
      aria-hidden={decorative && !image ? true : undefined}
      role={!image && !decorative ? "img" : undefined}
      aria-label={!image && !decorative ? name : undefined}
    >
      {image ? (
        <Image
          src={image}
          alt={decorative ? "" : name}
          fill
          sizes={size === "xl" ? "96px" : size === "lg" ? "64px" : size === "md" ? "48px" : "36px"}
          className="object-cover"
          unoptimized={isRemoteImage(image)}
        />
      ) : (
        <span aria-hidden="true">{initial}</span>
      )}
    </span>
  );
}
