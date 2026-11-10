import { EMBER, MONOGRAM_PATH } from "@/components/brand";
import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

/** Home-screen icon (iOS): the "T" of the wordmark on the site's ember. iOS rounds the corners itself. */
export default function AppleIcon() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", background: EMBER }}>
        <svg width="112" height="101" viewBox="3 2 180 162" fill="#ffffff"><path d={MONOGRAM_PATH} /></svg>
      </div>
    ),
    size,
  );
}
