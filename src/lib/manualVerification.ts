import { normalizeLoader } from "./modrinth/mapping";
import { sortMinecraftVersions } from "./modrinth/versionFilters";
import type { ManualVerification } from "./schema";

export type ManualVerificationInput = {
  source: ManualVerification["source"];
  version: string;
  gameVersions: string[];
  loaders: string[];
  evidenceUrl: string;
  /** The user ticked that they checked the source themselves. */
  confirmed: boolean;
};

export type ManualVerificationErrors = Partial<
  Record<keyof ManualVerificationInput, string>
>;

/** Accepts only absolute http(s) URLs. The page is never fetched: a valid URL is not proof. */
export function isEvidenceUrl(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/** Checks the form and builds the snapshot; nothing is saved until the user saves the mod. */
export function buildManualVerification(
  input: ManualVerificationInput,
  now = new Date(),
):
  | { value: ManualVerification; errors?: undefined }
  | { errors: ManualVerificationErrors } {
  const errors: ManualVerificationErrors = {};
  const version = input.version.trim();
  const gameVersions = sortMinecraftVersions(
    input.gameVersions.map((value) => value.trim()).filter(Boolean),
  );
  const loaders = [
    ...new Set(
      input.loaders
        .map((value) => normalizeLoader(value) ?? value.trim().toLowerCase())
        .filter(Boolean),
    ),
  ];
  if (!version) errors.version = "Enter the version you checked.";
  if (!gameVersions.length)
    errors.gameVersions = "Add at least one Minecraft version.";
  if (!loaders.length) errors.loaders = "Add at least one modloader.";
  if (!isEvidenceUrl(input.evidenceUrl))
    errors.evidenceUrl = "Enter the full http(s) link you checked.";
  if (!input.confirmed)
    errors.confirmed = "Confirm that you checked these values yourself.";
  if (Object.keys(errors).length) return { errors };
  return {
    value: {
      source: input.source,
      version,
      gameVersions,
      loaders,
      evidenceUrl: input.evidenceUrl.trim(),
      verifiedAt: now.toISOString(),
    },
  };
}
