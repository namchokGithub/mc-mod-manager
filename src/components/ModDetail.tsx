import { ArrowUpRight, Link2 } from "lucide-react";
import type { Mod } from "../lib/schema";
import { Dialog } from "./ui/dialog";
import { ModArtwork } from "./ModArtwork";

export function ModDetail({
  mod,
  onClose,
}: {
  mod: Mod | null;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={Boolean(mod)}
      onOpenChange={(open) => !open && onClose()}
      title={mod?.name ?? "Mod details"}
      description={mod?.description}
    >
      {mod && (
        <div className="detail-body">
          <div className="detail-top">
            <ModArtwork name={mod.name} imageUrl={mod.imageUrl} large />
            <div>
              <span className={`status status-${mod.status}`}>
                {mod.status}
              </span>
              <p>
                {mod.category} · {mod.side} side
              </p>
            </div>
          </div>
          <dl className="detail-list">
            <div>
              <dt>Version</dt>
              <dd>{mod.version || "Not specified"}</dd>
            </div>
            <div>
              <dt>Source</dt>
              <dd>{mod.source}</dd>
            </div>
            <div>
              <dt>Tags</dt>
              <dd>{mod.tags.length ? mod.tags.join(", ") : "None"}</dd>
            </div>
            <div>
              <dt>Dependencies</dt>
              <dd>
                {mod.dependencies.length
                  ? mod.dependencies.join(", ")
                  : "None listed"}
              </dd>
            </div>
          </dl>
          {mod.notes && (
            <section className="detail-note">
              <h3>Notes</h3>
              <p>{mod.notes}</p>
            </section>
          )}
          {mod.sourceUrl && (
            <a
              className="detail-link"
              href={mod.sourceUrl}
              target="_blank"
              rel="noreferrer"
            >
              <Link2 size={16} /> View on {mod.source}
              <ArrowUpRight size={16} />
            </a>
          )}
        </div>
      )}
    </Dialog>
  );
}
