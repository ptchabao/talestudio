import { getDictionary } from "@/i18n/server";
import { OG_SIZE, ogImage } from "@/lib/og-image";

export const alt = "TaleStudio — AI video production studio";
export const size = OG_SIZE;
export const contentType = "image/png";

export default async function Image() {
  return ogImage(await getDictionary());
}
