import { EMBER, Wordmark } from "@/components/brand";
import type { Dictionary } from "@/i18n/config";
import { ImageResponse } from "next/og";

export const OG_SIZE = { width: 1200, height: 630 };

/** Share card (Open Graph / X / WhatsApp): abyss canvas, the white wordmark (dark background), tagline and the four studios. */
export function ogImage(t: Dictionary) {
  const studios = Object.values(t.studios.items).map((s) => s.name);
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", padding: 72, background: "#000710", color: "#ffffff" }}>
        <div style={{ display: "flex" }}>
          <Wordmark color="#ffffff" height={52} />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 28 }}>
          <div style={{ fontSize: 80, fontWeight: 700, letterSpacing: -3, lineHeight: 1.04, maxWidth: 1000 }}>{t.meta.tagline}</div>
          <div style={{ fontSize: 30, lineHeight: 1.4, color: "#b9bbc6", maxWidth: 1000 }}>{t.meta.description}</div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          {studios.map((name) => (
            <div key={name} style={{ display: "flex", flexShrink: 0, whiteSpace: "nowrap", padding: "10px 20px", borderRadius: 999, border: "2px solid #2a2f37", fontSize: 22, color: "#ffffff" }}>
              {name}
            </div>
          ))}
          <div style={{ display: "flex", flexShrink: 0, marginLeft: "auto", width: 12, height: 12, borderRadius: 6, background: EMBER }} />
        </div>
      </div>
    ),
    OG_SIZE,
  );
}
