import { useState } from "react";
import { Box } from "lucide-react";

const colors = ["#80bfa5", "#9ab4d0", "#d1b585", "#ad9fcc", "#b7c79c"];

export function ModArtwork({
  name,
  imageUrl,
  large = false,
}: {
  name: string;
  imageUrl: string;
  large?: boolean;
}) {
  const [failedUrl, setFailedUrl] = useState("");
  const color =
    colors[
      Array.from(name).reduce((sum, char) => sum + char.charCodeAt(0), 0) %
        colors.length
    ];
  return (
    <div
      className={`mod-artwork${large ? " mod-artwork-large" : ""}`}
      style={{ "--art-color": color } as React.CSSProperties}
    >
      {imageUrl && failedUrl !== imageUrl ? (
        <img src={imageUrl} alt="" onError={() => setFailedUrl(imageUrl)} />
      ) : (
        <Box size={large ? 32 : 25} strokeWidth={1.5} aria-hidden="true" />
      )}
    </div>
  );
}
