export function isPublicAssetPath(value: string): boolean {
  if (!value.startsWith("public/assets/")) return false;
  const segments = value.split("/");
  return (
    segments.length > 2 &&
    segments.every(
      (segment) =>
        segment !== "" &&
        segment !== "." &&
        segment !== ".." &&
        !segment.includes("\\") &&
        Array.from(segment).every((character) => character.charCodeAt(0) >= 32),
    )
  );
}

export function resolveHeroImageUrl(value: string, baseUrl: string): string {
  if (!isPublicAssetPath(value)) return value;
  const assetPath = value
    .slice("public/".length)
    .split("/")
    .map(encodeURIComponent)
    .join("/");
  return `${baseUrl.endsWith("/") ? baseUrl : `${baseUrl}/`}${assetPath}`;
}
