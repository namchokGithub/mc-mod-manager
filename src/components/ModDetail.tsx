import { ArrowUpRight, Link2 } from "lucide-react";
import type { CompatResult } from "../lib/compatibility";
import type { Mod } from "../lib/schema";
import { CompatBadge, CompatReasons } from "./CompatBadge";
import { Dialog } from "./ui/dialog";
import { ModArtwork } from "./ModArtwork";
import { useRetained } from "../lib/useRetained";

export function ModDetail({
  mod,
  compat,
  onClose,
}: {
  mod: Mod | null;
  compat: Map<string, CompatResult>;
  onClose: () => void;
}) {
  const shown = useRetained(mod);
  const shownCompat = shown ? compat.get(shown.id) : undefined;
  return (
    <Dialog
      open={Boolean(mod)}
      onOpenChange={(open) => !open && onClose()}
      title={shown?.name ?? "Mod details"}
      description={shown?.description || undefined}
    >
      {shown && (
        <div className="detail-body">
          <div className="detail-top">
            <ModArtwork name={shown.name} imageUrl={shown.imageUrl} large />
            <div>
              <span className={`status status-${shown.status}`}>
                {shown.status}
              </span>
              <p>
                {shown.category} · {shown.side} side
              </p>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Version</dt>
              <dd>
                {shown.version || "Not specified"}
                {shown.modrinth?.versionType && (
                  <small className="detail-sub">
                    {shown.modrinth.versionType}
                    {shown.modrinth.datePublished &&
                      Number.isFinite(
                        Date.parse(shown.modrinth.datePublished),
                      ) &&
                      ` · released ${new Date(shown.modrinth.datePublished).toLocaleDateString()}`}
                  </small>
                )}
              </dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{shown.source}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{shown.tags.length ? shown.tags.join(", ") : "None"}</dd>
            </div>
            <div>
              <dt>Dependencies</dt>
              <dd>
                {shown.dependencies.length
                  ? shown.dependencies.join(", ")
                  : "None listed"}
              </dd>
            </div>
          </dl>
          <section className="detail-note detail-compat">
            <div className="detail-compat-head">
              <h3>Compatibility</h3>
              {shownCompat && <CompatBadge status={shownCompat.status} />}
            </div>
            {shownCompat ? (
              <>
                <CompatReasons result={shownCompat} />
                {shown.modrinth?.versionNumber && (
                  <p className="detail-compat-source">
                    Checked against Modrinth version{" "}
                    {shown.modrinth.versionNumber}
                    {shown.modrinth.syncedAt
                      ? `, saved ${new Date(shown.modrinth.syncedAt).toLocaleDateString()}`
                      : ""}
                    .
                  </p>
                )}
              </>
            ) : (
              <p>Not checked because this mod is {shown.status}.</p>
            )}
          </section>
          {shown.notes && (
            <section className="detail-note">
              <h3>Notes</h3>
              <p>{shown.notes}</p>
            </section>
          )}
          {shown.sourceUrl && (
            <a
              className="detail-link"
              href={shown.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Link2 size={16} /> View on {shown.source}
              <ArrowUpRight size={16} />
            </a>
          )}
        </div>
      )}
    </Dialog>
  );
}
