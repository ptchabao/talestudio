import Link from "next/link";
import { Wordmark } from "./brand";

/**
 * The official TALE STUDIO wordmark: the site's ember on light backgrounds, white on dark ones
 * (`inverted` for dark sections such as the footer, and everywhere in the dark theme).
 */
export function Logo({ href = "/", inverted = false }: { href?: string; inverted?: boolean }) {
  return (
    <Link href={href} aria-label="TaleStudio" className={`flex items-center ${inverted ? "text-white" : "text-ember dark:text-white"}`}>
      <Wordmark height={18} />
    </Link>
  );
}
