import { ArrowUpCircle, CircleCheck, CircleHelp } from "lucide-react";
import type { Mod } from "../../lib/schema";
import { updateLabels, type UpdateResult } from "../../lib/updates";

/** Shows the last update check for a linked mod; hidden once the mod's version changes. */
export function UpdateBadge({
  mod,
  result,
  onUpdate,
}: {
  mod: Mod;
  result?: UpdateResult;
  onUpdate: (versionId?: string) => void;
}) {
  if (!result || !mod.modrinth) return null;
  if (result.checkedVersionId !== mod.modrinth.versionId) return null;
  if (result.status === "update-available")
    return (
      <button
        type="button"
        className="update-badge update-available"
        title={result.reason}
        onClick={() => onUpdate(result.latest?.id)}
      >
        <ArrowUpCircle size={13} aria-hidden="true" />
        {result.latest?.versionNumber
          ? `Update to ${result.latest.versionNumber}`
          : updateLabels["update-available"]}
      </button>
    );
  const Icon = result.status === "up-to-date" ? CircleCheck : CircleHelp;
  return (
    <span
      className={`update-badge update-${result.status} compat-compact`}
      title={`${updateLabels[result.status]}: ${result.reason}`}
    >
      <Icon size={13} aria-hidden="true" />
      <span className="sr-only">{updateLabels[result.status]}</span>
    </span>
  );
}
