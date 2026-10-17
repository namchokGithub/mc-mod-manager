import { useState } from "react";
import { Box } from "lucide-react";

// Tints are theme tokens (--art-1 … --art-5) defined in styles.css.
const colors = [1, 2, 3, 4, 5].map((index) => `var(--art-${index})`);

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
