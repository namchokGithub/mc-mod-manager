import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ArrowUpRight, ChevronDown, Circle, CircleCheck } from "lucide-react";
import { CompatBadge } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import { batchMods, orderedBatches } from "../../lib/batches";
import { statusLabel, type CompatResult } from "../../lib/compatibility";
import type { BatchFile, Mod } from "../../lib/schema";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

/** Read-only installation guide built from batches.json; nothing here can change data. */
export function BuildPlanGuide({
  plan,
  mods,
  compat,
  onOpenMod,
}: {
  plan: BatchFile;
  mods: Mod[];
  compat: Map<string, CompatResult>;
  onOpenMod: (mod: Mod) => void;
}) {
  const batches = orderedBatches(plan);
  const [open, setOpen] = useState<Set<string>>(() => new Set());
  if (!batches.length) return null;
  const toggle = (id: string) =>
    setOpen((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section
      id="build-plan"
      className="build-guide"
      aria-labelledby="build-plan-title"
    >
      <div className="section-heading">
        <div>
          <div className="section-kicker">INSTALLATION GUIDE</div>
          <h2 id="build-plan-title">
            Build plan<span className="heading-period">.</span>
          </h2>
          <p>Install the pack batch by batch, checking each step as you go.</p>
        </div>
      </div>
      <ol className="plan-list">
        {batches.map((batch, index) => {
          const expanded = open.has(batch.id);
          const { mods: batchList, missing } = batchMods(batch, mods);
          return (
            <li key={batch.id} className="plan-batch">
              <button
                type="button"
                className="plan-toggle"
                aria-expanded={expanded}
                onClick={() => toggle(batch.id)}
              >
                <span className="plan-order" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="plan-title">
                  <strong>{batch.name}</strong>
                  <span>
                    {plural(batchList.length, "mod")}
                    {batch.checklist.length
                      ? ` · ${plural(batch.checklist.length, "step")}`
                      : ""}
                  </span>
                </span>
                <ChevronDown
                  size={16}
                  aria-hidden="true"
                  className={expanded ? "rotate" : undefined}
                />
              </button>
              {batch.description && (
                <p className="plan-description">{batch.description}</p>
              )}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    className="plan-collapse"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <div className="plan-body">
                      {batchList.length > 0 && (
                        <ul className="plan-mods">
                          {batchList.map((mod) => {
                            const result = compat.get(mod.id);
                            return (
                              <li key={mod.id}>
                                <ModArtwork
                                  name={mod.name}
                                  imageUrl={mod.imageUrl}
                                />
                                <span className="plan-mod-name">
                                  <button
                                    type="button"
                                    className="plan-mod-open"
                                    onClick={() => onOpenMod(mod)}
                                  >
                                    {mod.name}
                                  </button>
                                  <span>
                                    {mod.version ? `v${mod.version} · ` : ""}
                                    {mod.source}
                                  </span>
                                  {mod.notes && (
                                    <span className="plan-mod-note">
                                      {mod.notes}
                                    </span>
                                  )}
                                </span>
                                {result && (
                                  <CompatBadge
                                    status={result.status}
                                    label={statusLabel(result)}
                                    compact
                                  />
                                )}
                                {mod.sourceUrl && (
                                  <a
                                    className="plan-mod-link"
                                    href={mod.sourceUrl}
                                    target="_blank"
                                    rel="noreferrer"
                                    aria-label={`Open ${mod.name} on ${mod.source}`}
                                  >
                                    {mod.source}
                                    <ArrowUpRight
                                      size={13}
                                      aria-hidden="true"
                                    />
                                  </a>
                                )}
                              </li>
                            );
                          })}
                        </ul>
                      )}
                      {missing.length > 0 && (
                        <p className="mr-hint">
                          {plural(missing.length, "mod")} in this batch{" "}
                          {missing.length === 1 ? "is" : "are"} no longer in the
                          collection.
                        </p>
                      )}
                      {!batchList.length && !missing.length && (
                        <p className="mr-hint">No mods in this batch yet.</p>
                      )}
                      {batch.checklist.length > 0 && (
                        <ol className="plan-steps plan-steps-readonly">
                          {batch.checklist.map((item) => (
                            <li
                              key={item.id}
                              className={
                                item.done ? "plan-step done" : "plan-step"
                              }
                            >
                              {item.done ? (
                                <CircleCheck size={15} aria-hidden="true" />
                              ) : (
                                <Circle size={15} aria-hidden="true" />
                              )}
                              <span>{item.text}</span>
                              {item.done && (
                                <span className="sr-only">(done)</span>
                              )}
                            </li>
                          ))}
                        </ol>
                      )}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
