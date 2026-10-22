import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowUpRight,
  ChevronDown,
  Circle,
  CircleCheck,
  FileDown,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { ExportGuideDialog } from "../../components/ExportGuideDialog";
import { Button } from "../../components/ui/button";
import { CompatBadge } from "../../components/CompatBadge";
import { DependencyOverview } from "../../components/DependencyOverview";
import { ModArtwork } from "../../components/ModArtwork";
import { MarkdownText } from "../../components/MarkdownText";
import { batchMods, orderedBatches } from "../../lib/batches";
import { statusLabel, type CompatResult } from "../../lib/compatibility";
import {
  batchContent,
  batchCountText,
  installGuidance,
  planTypeLabels,
  type BatchContent,
} from "../../lib/batchContent";
import { contentSourceLabels, contentStatusLabels } from "../../lib/content";
import {
  contentItemCompat,
  contentSourceText,
  contentStatusLabel,
  contentVerificationText,
} from "../../lib/contentVerification";
import {
  contentTypes,
  type Batch,
  type BatchFile,
  type Collection,
  type Mod,
  type Step,
} from "../../lib/schema";
import { liquidLens } from "../../lib/liquidLens";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

type FirstModPlacement = { key: string; label: string };

const stepBatch = (batch: Batch, step: Step): Batch => ({
  ...batch,
  steps: [step],
});

const firstOpenStepId = (batch: Batch) =>
  batch.steps.find((step) => step.itemRefs.some((ref) => ref.type === "mod"))
    ?.id ??
  batch.steps.find((step) => step.itemRefs.length > 0)?.id ??
  batch.steps[0]?.id;

function ModRows({
  mods,
  compat,
  onOpenMod,
  repeatStepNameByModId,
}: {
  mods: Mod[];
  compat: Map<string, CompatResult>;
  onOpenMod: (mod: Mod) => void;
  repeatStepNameByModId?: ReadonlyMap<string, string>;
}) {
  return (
    <ul className="preview-plan-items">
      {mods.map((mod) => {
        const result = compat.get(mod.id);
        const repeatedFrom = repeatStepNameByModId?.get(mod.id);
        return (
          <li key={mod.id} className="preview-plan-item">
            <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
            <span className="preview-plan-item-copy">
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
              {repeatedFrom && (
                <span className="preview-plan-item-repeat">
                  Recheck from {repeatedFrom} · no reinstall needed
                </span>
              )}
              {mod.notes && <span className="plan-mod-note">{mod.notes}</span>}
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
                <ArrowUpRight size={13} aria-hidden="true" />
              </a>
            )}
          </li>
        );
      })}
    </ul>
  );
}

function ContentGroups({
  content,
  collection,
}: {
  content: BatchContent;
  collection: Collection;
}) {
  return contentTypes.map((type) => {
    const { items, missing } = content[type];
    if (!items.length && !missing.length) return null;
    return (
      <section key={type} className="preview-plan-content-group">
        <h5>
          {planTypeLabels[type].many} <span>{items.length}</span>
        </h5>
        {items.length > 0 && (
          <ul className="preview-plan-items">
            {items.map((item) => {
              const result = contentItemCompat(
                item,
                type,
                collection.modpack.minecraftVersion,
              );
              const source = contentSourceText(item, contentSourceLabels);
              return (
                <li key={item.id} className="preview-plan-item">
                  <ModArtwork name={item.name} imageUrl={item.imageUrl} />
                  <span className="preview-plan-item-copy">
                    <strong>{item.name}</strong>
                    <span>
                      {item.version ? `v${item.version} · ` : ""}
                      {source} · {contentStatusLabels[item.status]}
                    </span>
                    {item.notes && (
                      <span className="plan-mod-note">{item.notes}</span>
                    )}
                  </span>
                  <CompatBadge
                    status={result.status}
                    label={contentStatusLabel(result)}
                    source={contentVerificationText(result)}
                    compact
                  />
                  {item.sourceUrl && (
                    <a
                      className="plan-mod-link"
                      href={item.sourceUrl}
                      target="_blank"
                      rel="noreferrer"
                      aria-label={`Open ${item.name} on ${contentSourceLabels[item.source]}`}
                    >
                      {contentSourceLabels[item.source]}
                      <ArrowUpRight size={13} aria-hidden="true" />
                    </a>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {missing.length > 0 && (
          <p className="mr-hint">
            {plural(missing.length, planTypeLabels[type].one)} in this step{" "}
            {missing.length === 1 ? "is" : "are"} no longer in the collection.
          </p>
        )}
        {items.length > 0 && <p className="mr-hint">{installGuidance[type]}</p>}
      </section>
    );
  });
}

function StepAccordion({
  batch,
  mods,
  compat,
  collection,
  openSteps,
  onToggle,
  onOpenMod,
  firstPlacementByModId,
}: {
  batch: Batch;
  mods: Mod[];
  compat: Map<string, CompatResult>;
  collection: Collection;
  openSteps: Set<string>;
  onToggle: (stepId: string) => void;
  onOpenMod: (mod: Mod) => void;
  firstPlacementByModId: ReadonlyMap<string, FirstModPlacement>;
}) {
  return (
    <ol className="preview-plan-steps">
      {batch.steps.map((step, index) => {
        const scopedBatch = stepBatch(batch, step);
        const { mods: stepMods, missing } = batchMods(scopedBatch, mods);
        const content = batchContent(scopedBatch, collection);
        const itemCount =
          stepMods.length +
          contentTypes.reduce(
            (total, type) => total + content[type].items.length,
            0,
          );
        const repeatStepNameByModId = new Map(
          step.itemRefs.flatMap((ref) => {
            if (ref.type !== "mod") return [];
            const first = firstPlacementByModId.get(ref.id);
            return first && first.key !== `${batch.id}:${step.id}`
              ? [[ref.id, first.label] as const]
              : [];
          }),
        );
        const expanded = openSteps.has(step.id);
        const panelId = `${batch.id}-${step.id}-details`;

        return (
          <li
            key={step.id}
            className={
              step.done
                ? expanded
                  ? "preview-plan-step is-open is-done"
                  : "preview-plan-step is-done"
                : expanded
                  ? "preview-plan-step is-open"
                  : "preview-plan-step"
            }
          >
            <button
              type="button"
              className="preview-plan-step-toggle"
              aria-expanded={expanded}
              aria-controls={panelId}
              onClick={() => onToggle(step.id)}
            >
              <span className="preview-plan-step-state" aria-hidden="true">
                {step.done ? <CircleCheck size={17} /> : <Circle size={17} />}
              </span>
              <span className="preview-plan-step-title">
                <strong>
                  <span className="preview-plan-step-number">{index + 1}</span>
                  {step.name}
                </strong>
                <span>
                  {batchCountText(stepMods.length, content)}
                  {missing.length > 0
                    ? ` · ${plural(missing.length, "missing mod")}`
                    : ""}
                </span>
              </span>
              <span className="preview-plan-step-count">{itemCount} items</span>
              <ChevronDown size={17} aria-hidden="true" />
            </button>
            <AnimatePresence initial={false}>
              {expanded && (
                <motion.div
                  id={panelId}
                  className="preview-plan-step-panel"
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  transition={{ duration: 0.2, ease: "easeOut" }}
                >
                  <div className="preview-plan-step-body">
                    {step.description && (
                      <MarkdownText className="preview-plan-step-description">
                        {step.description}
                      </MarkdownText>
                    )}
                    {repeatStepNameByModId.size > 0 && (
                      <p className="preview-plan-repeat-note">
                        Repeated mods are shown as rechecks, so they do not need
                        to be installed again.
                      </p>
                    )}
                    {stepMods.length > 0 && (
                      <section className="preview-plan-mod-group">
                        <div className="preview-plan-group-heading">
                          <h5>Mods for this step</h5>
                          <span>{plural(stepMods.length, "mod")}</span>
                        </div>
                        <ModRows
                          mods={stepMods}
                          compat={compat}
                          onOpenMod={onOpenMod}
                          repeatStepNameByModId={repeatStepNameByModId}
                        />
                        <p className="mr-hint">{installGuidance.mod}</p>
                      </section>
                    )}
                    {!stepMods.length && !missing.length && (
                      <p className="preview-plan-empty">
                        No mods required for this step.
                      </p>
                    )}
                    {missing.length > 0 && (
                      <p className="mr-hint">
                        {plural(missing.length, "mod")} in this step{" "}
                        {missing.length === 1 ? "is" : "are"} no longer in the
                        collection.
                      </p>
                    )}
                    <ContentGroups content={content} collection={collection} />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </li>
        );
      })}
    </ol>
  );
}

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
  const { data: collection } = useCollection();
  const batches = orderedBatches(plan);
  const initialBatch =
    batches.find((batch) =>
      batch.steps.some((step) => step.itemRefs.length > 0),
    ) ?? batches[0];
  const firstPlacementByModId = new Map<string, FirstModPlacement>();
  batches.forEach((batch) => {
    batch.steps.forEach((step) => {
      step.itemRefs.forEach((ref) => {
        if (ref.type !== "mod" || firstPlacementByModId.has(ref.id)) return;
        firstPlacementByModId.set(ref.id, {
          key: `${batch.id}:${step.id}`,
          label: `${batch.name} — ${step.name}`,
        });
      });
    });
  });
  const [openBatches, setOpenBatches] = useState<Set<string>>(
    () => new Set(initialBatch ? [initialBatch.id] : []),
  );
  const [openStepsByBatch, setOpenStepsByBatch] = useState<
    Record<string, Set<string>>
  >(() => {
    const firstStepId = initialBatch && firstOpenStepId(initialBatch);
    return initialBatch && firstStepId
      ? { [initialBatch.id]: new Set([firstStepId]) }
      : {};
  });
  // null: closed; "": all batches; otherwise the batch it was opened from.
  const [exportFor, setExportFor] = useState<string | null>(null);

  if (!batches.length) return null;

  const toggleBatch = (batch: Batch) => {
    setOpenBatches((current) => {
      const next = new Set(current);
      if (next.has(batch.id)) next.delete(batch.id);
      else next.add(batch.id);
      return next;
    });
    setOpenStepsByBatch((current) => {
      if (current[batch.id]) return current;
      const firstStepId = firstOpenStepId(batch);
      return firstStepId
        ? { ...current, [batch.id]: new Set([firstStepId]) }
        : current;
    });
  };

  const toggleStep = (batchId: string, stepId: string) => {
    setOpenStepsByBatch((current) => {
      const next = new Set(current[batchId] ?? []);
      if (next.has(stepId)) next.delete(stepId);
      else next.add(stepId);
      return { ...current, [batchId]: next };
    });
  };

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
        <Button variant="secondary" onClick={() => setExportFor("")}>
          <FileDown size={16} /> Export guide
        </Button>
      </div>
      <ol className="preview-plan-list">
        {batches.map((batch, index) => {
          const expanded = openBatches.has(batch.id);
          const { mods: batchList } = batchMods(batch, mods);
          const content = batchContent(batch, collection);
          const completed = batch.steps.filter((step) => step.done).length;
          return (
            <li key={batch.id} className="preview-plan-batch" ref={liquidLens}>
              <button
                type="button"
                className="preview-plan-batch-toggle"
                aria-expanded={expanded}
                onClick={() => toggleBatch(batch)}
              >
                <span className="preview-plan-order" aria-hidden="true">
                  {index + 1}
                </span>
                <span className="preview-plan-batch-title">
                  <strong>{batch.name}</strong>
                  <span>
                    {batchCountText(batchList.length, content)} ·{" "}
                    {plural(batch.steps.length, "step")}
                  </span>
                </span>
                <span className="preview-plan-progress">
                  {completed} of {batch.steps.length} completed
                </span>
                <ChevronDown size={17} aria-hidden="true" />
              </button>
              {batch.description && (
                <MarkdownText className="preview-plan-batch-description">
                  {batch.description}
                </MarkdownText>
              )}
              <AnimatePresence initial={false}>
                {expanded && (
                  <motion.div
                    className="preview-plan-batch-panel"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.2, ease: "easeOut" }}
                  >
                    <div className="preview-plan-batch-body">
                      {batch.steps.length > 0 ? (
                        <StepAccordion
                          batch={batch}
                          mods={mods}
                          compat={compat}
                          collection={collection}
                          openSteps={openStepsByBatch[batch.id] ?? new Set()}
                          onToggle={(stepId) => toggleStep(batch.id, stepId)}
                          onOpenMod={onOpenMod}
                          firstPlacementByModId={firstPlacementByModId}
                        />
                      ) : (
                        <p className="preview-plan-empty">
                          No steps in this batch yet.
                        </p>
                      )}
                      <DependencyOverview
                        batchId={batch.id}
                        plan={plan}
                        mods={mods}
                        onOpenMod={onOpenMod}
                      />
                      <div className="preview-plan-export">
                        <Button
                          variant="ghost"
                          size="small"
                          onClick={() => setExportFor(batch.id)}
                        >
                          <FileDown size={15} /> Export this batch
                        </Button>
                      </div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </li>
          );
        })}
      </ol>
      <ExportGuideDialog
        open={exportFor !== null}
        onOpenChange={(value) => !value && setExportFor(null)}
        collection={collection}
        currentBatchId={exportFor || null}
      />
    </section>
  );
}
