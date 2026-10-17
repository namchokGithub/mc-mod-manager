import { ArrowUpRight, Link2 } from "lucide-react";
import type { Mod } from "../lib/schema";
import { Dialog } from "./ui/dialog";
import { ModArtwork } from "./ModArtwork";
import { useRetained } from "../lib/useRetained";

export function ModDetail({
  mod,
  onClose,
}: {
  mod: Mod | null;
  onClose: () => void;
}) {
  const shown = useRetained(mod);
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
              <dd>{shown.version || "Not specified"}</dd>
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
