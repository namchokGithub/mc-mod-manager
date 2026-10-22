import { useEffect, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ArrowRightLeft,
  ChevronDown,
  FileDown,
  GitBranch,
  ListChecks,
  Pencil,
  Plus,
  Search,
  Trash2,
  X,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { useToast } from "../../app/ToastContext";
import { ModArtwork } from "../../components/ModArtwork";
import { MarkdownText } from "../../components/MarkdownText";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import { Dialog } from "../../components/ui/dialog";
import {
  assignItem,
  batchMods,
  itemRefsOf,
  modAssignmentLocations,
  moveItem,
  moveItemToStep,
  newBatchId,
  newStepId,
  modIdsOf,
  orderedBatches,
  unassignItem,
} from "../../lib/batches";
import { DependencyOverview } from "../../components/DependencyOverview";
import { batchDependencyOverview } from "../../lib/dependencyOverview";
import { ExportGuideDialog } from "../../components/ExportGuideDialog";
import { Select } from "../../components/ui/select";
import {
  batchContent,
  batchCountText,
  contentKeyByType,
  installGuidance,
  planTypeLabels,
  type PlanItemType,
} from "../../lib/batchContent";
import { contentStatusLabels } from "../../lib/content";
import { matchesSearchText } from "../../lib/mods";
import {
  planningDashboard,
  type BatchSummary,
} from "../../lib/planningDashboard";
import {
  contentTypes,
  type Batch,
  type ContentItem,
  type ContentKey,
  type Mod,
  type Step,
  modStatusLabels,
  modStatuses,
} from "../../lib/schema";
import { useRetained } from "../../lib/useRetained";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

const modStatusOptions = modStatuses.map((value) => ({
  value,
  label: modStatusLabels[value],
}));

function BatchReadiness({
  batches,
  onOpenBatch,
}: {
  batches: BatchSummary[];
  onOpenBatch: (id: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const batchesWithIssues = batches.filter((item) => {
    const { issues } = item;
    return (
      issues.requiredMissing.length +
        issues.optionalMissing.length +
        issues.unresolved.length +
        issues.later.length +
        issues.unknown.length +
        item.deletedRefs.length +
        item.missingContent.length >
      0
    );
  }).length;
  return (
    <section className="plan-readiness" aria-labelledby="plan-readiness-title">
      <div className="plan-readiness-head">
        <h3 id="plan-readiness-title">
          <button
            type="button"
            className="plan-readiness-toggle"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
          >
            <span>
              <strong>Batch readiness</strong>
              <small>
                {batchesWithIssues
                  ? `${batchesWithIssues} ${batchesWithIssues === 1 ? "batch needs" : "batches need"} attention before installation.`
                  : "Every batch is ready from the available dependency metadata."}
              </small>
            </span>
            <ChevronDown
              size={16}
              aria-hidden="true"
              className={open ? "rotate" : undefined}
            />
          </button>
        </h3>
      </div>
      <ol className="plan-readiness-list" hidden={!open}>
        {batches.map((item) => {
          const { issues } = item;
          const labels = [
            issues.requiredMissing.length
              ? `${issues.requiredMissing.length} required missing`
              : "",
            issues.unresolved.length
              ? `${issues.unresolved.length} unresolved`
              : "",
            issues.later.length ? `${issues.later.length} scheduled later` : "",
            item.deletedRefs.length + item.missingContent.length
              ? `${item.deletedRefs.length + item.missingContent.length} deleted reference${item.deletedRefs.length + item.missingContent.length === 1 ? "" : "s"}`
              : "",
            issues.optionalMissing.length
              ? `${issues.optionalMissing.length} optional not added`
              : "",
            issues.unknown.length
              ? `${issues.unknown.length} unknown metadata`
              : "",
          ].filter(Boolean);
          const hasIssues = labels.length > 0;
          return (
            <li
              key={item.batch.id}
              className={`plan-readiness-item${hasIssues ? " has-issues" : ""}`}
            >
              <span className="plan-order" aria-hidden="true">
                {item.position}
              </span>
              <div className="plan-readiness-main">
                <strong>{item.batch.name}</strong>
                <span>
                  {item.modCount} {item.modCount === 1 ? "mod" : "mods"}
                  {labels.length ? ` · ${labels.join(" · ")}` : " · Ready"}
                </span>
                {hasIssues && (
                  <details className="plan-readiness-details">
                    <summary>View what needs attention</summary>
                    <ul>
                      {issues.requiredMissing.map(({ mod, entry }) => (
                        <li key={`required:${mod.id}:${entry.key}`}>
                          <span className="plan-readiness-tone danger">
                            Required missing
                          </span>
                          <strong>{mod.name}</strong> needs {entry.label}
                        </li>
                      ))}
                      {issues.unresolved.map(({ mod, entry }) => (
                        <li key={`unresolved:${mod.id}:${entry.key}`}>
                          <span className="plan-readiness-tone warning">
                            Can’t verify
                          </span>
                          <strong>{mod.name}</strong> needs {entry.label}
                          {entry.reason && ` — ${entry.reason}`}
                        </li>
                      ))}
                      {issues.later.map(({ mod, entry }) => {
                        const target = entry.batches.find(
                          (batch) => batch.position > item.position,
                        );
                        return (
                          <li key={`later:${mod.id}:${entry.key}`}>
                            <span className="plan-readiness-tone warning">
                              Scheduled later
                            </span>
                            <strong>{mod.name}</strong> needs {entry.label}
                            {target && ` in Batch ${target.position}`}
                          </li>
                        );
                      })}
                      {issues.optionalMissing.map(({ mod, entry }) => (
                        <li key={`optional:${mod.id}:${entry.key}`}>
                          <span className="plan-readiness-tone neutral">
                            Optional not added
                          </span>
                          <strong>{mod.name}</strong> can use {entry.label}
                        </li>
                      ))}
                      {issues.unknown.map((mod) => (
                        <li key={`unknown:${mod.id}`}>
                          <span className="plan-readiness-tone neutral">
                            Unknown metadata
                          </span>
                          <strong>{mod.name}</strong> has no dependency metadata
                        </li>
                      ))}
                      {item.deletedRefs.map((id) => (
                        <li key={`deleted-mod:${id}`}>
                          <span className="plan-readiness-tone danger">
                            Deleted reference
                          </span>
                          Mod {id} is no longer in the collection
                        </li>
                      ))}
                      {item.missingContent.map((ref) => (
                        <li key={`deleted-content:${ref.type}:${ref.id}`}>
                          <span className="plan-readiness-tone danger">
                            Deleted reference
                          </span>
                          {planTypeLabels[ref.type].one} {ref.id} is no longer
                          in the collection
                        </li>
                      ))}
                    </ul>
                  </details>
                )}
              </div>
              <Button
                variant="ghost"
                size="small"
                onClick={() => onOpenBatch(item.batch.id)}
              >
                Open batch
              </Button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}

function StepCard({
  batch,
  item,
  open,
  onOpenChange,
  first,
  last,
  onChange,
  onBatchChange,
  onMove,
  onRemove,
  onOpenContent,
  highlighted,
}: {
  batch: Batch;
  item: Step;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  first: boolean;
  last: boolean;
  onChange: (item: Step) => void;
  onBatchChange: (batch: Batch) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
  onOpenContent: (key: ContentKey, item: ContentItem) => void;
  highlighted?: boolean;
}) {
  // Edited locally and committed on blur, so clearing the text to retype never fails validation.
  const [name, setName] = useState(item.name);
  const [description, setDescription] = useState(item.description);
  const [editing, setEditing] = useState(false);
  const { data, saveMod } = useCollection();
  const [typeFilter, setTypeFilter] = useState<PlanItemType | "">("");
  const [addModsOpen, setAddModsOpen] = useState(false);
  const [modSearch, setModSearch] = useState("");
  const modSearchRef = useRef<HTMLInputElement>(null);
  const [selectedModIds, setSelectedModIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [moveModIds, setMoveModIds] = useState<Set<string>>(() => new Set());
  const [recentModIds, setRecentModIds] = useState<Set<string>>(
    () => new Set(),
  );
  const notify = useToast();
  const stepBatch = { ...batch, steps: [item] };
  const { mods, missing } = batchMods(stepBatch, data.mods);
  const content = batchContent(stepBatch, data);
  const count = batchCountText(mods.length, content);
  const stepPlan = {
    ...data.batches,
    batches: data.batches.batches.map((planBatch) =>
      planBatch.id === batch.id ? { ...batch, steps: [item] } : planBatch,
    ),
  };
  const dependencyCounts = batchDependencyOverview(
    batch.id,
    stepPlan,
    data.mods,
  ).counts;
  const filteredMods = data.mods.filter((mod) =>
    matchesSearchText(mod.name, modSearch),
  );
  const ownerOf = (modId: string) =>
    batch.steps.find((step) =>
      step.itemRefs.some((ref) => ref.type === "mod" && ref.id === modId),
    );
  const otherBatchLocationsByModId = new Map<string, string[]>();
  orderedBatches(data.batches).forEach((planBatch, batchIndex) => {
    if (planBatch.id === batch.id) return;
    planBatch.steps.forEach((step) => {
      step.itemRefs.forEach((ref) => {
        if (ref.type !== "mod") return;
        const locations = otherBatchLocationsByModId.get(ref.id) ?? [];
        locations.push(`Batch ${batchIndex + 1} · ${step.name}`);
        otherBatchLocationsByModId.set(ref.id, locations);
      });
    });
  });
  // Mods have their own multi-select dialog; this compact picker is for other content only.
  const available = contentTypes
    .filter((type) => typeFilter === "" || typeFilter === type)
    .flatMap((type) =>
      data[contentKeyByType[type]].items
        .filter(
          (contentItem) =>
            !itemRefsOf(batch).some(
              (ref) => ref.type === type && ref.id === contentItem.id,
            ),
        )
        .map((contentItem) => ({
          value: `${type}:${contentItem.id}`,
          name: contentItem.name,
          label: `${contentItem.name} · ${planTypeLabels[type].one}${contentItem.version ? ` · v${contentItem.version}` : ""} · ${contentStatusLabels[contentItem.status]}`,
        })),
    )
    .sort((a, b) => a.name.localeCompare(b.name));
  const add = (value: string) => {
    const split = value.indexOf(":");
    const type = value.slice(0, split) as PlanItemType;
    const id = value.slice(split + 1);
    onBatchChange(assignItem(batch, item.id, { type, id }));
  };
  const resetModPicker = () => {
    setModSearch("");
    setSelectedModIds(new Set());
    setMoveModIds(new Set());
  };
  useEffect(() => {
    if (!recentModIds.size) return;
    const timeout = window.setTimeout(() => setRecentModIds(new Set()), 1800);
    return () => window.clearTimeout(timeout);
  }, [recentModIds]);
  const cancelEdit = () => {
    setName(item.name);
    setDescription(item.description);
    setEditing(false);
  };
  const saveEdit = () => {
    const nextName = name.trim();
    if (!nextName) return;
    onChange({ ...item, name: nextName, description: description.trim() });
    setName(nextName);
    setDescription(description.trim());
    setEditing(false);
  };
  const applyMods = () => {
    const added = [...selectedModIds].flatMap((id) =>
      data.mods.filter((mod) => mod.id === id),
    );
    const moved = [...moveModIds].flatMap((id) => {
      const mod = data.mods.find((candidate) => candidate.id === id);
      const owner = ownerOf(id);
      return mod && owner ? [{ mod, from: owner.name }] : [];
    });
    let next = batch;
    for (const id of selectedModIds)
      next = assignItem(next, item.id, { type: "mod", id });
    for (const id of moveModIds) {
      const owner = ownerOf(id);
      if (owner)
        next = moveItemToStep(next, owner.id, item.id, {
          type: "mod",
          id,
        });
    }
    onBatchChange(next);
    setRecentModIds(new Set([...selectedModIds, ...moveModIds]));
    const [movedItem] = moved;
    if (movedItem && !added.length) {
      notify({
        title: `Moved ${movedItem.mod.name} to ${item.name}`,
        description: `From ${movedItem.from}.`,
      });
    } else if (moved.length || added.length) {
      notify({
        title: `Updated ${item.name}`,
        description: [
          added.length && `Added ${plural(added.length, "mod")}.`,
          moved.length && `Moved ${plural(moved.length, "mod")}.`,
        ]
          .filter(Boolean)
          .join(" "),
      });
    }
    setAddModsOpen(false);
    resetModPicker();
  };
  return (
    <li
      id={`step-${batch.id}-${item.id}`}
      className={`plan-step-card${open ? " open" : ""}${highlighted ? " plan-step-highlight" : ""}`}
      onBlur={(event) => {
        // Keep the inline draft while focus moves within this Step. Leaving it
        // commits the edit before another control, including local save, runs.
        if (
          editing &&
          !event.currentTarget.contains(event.relatedTarget as Node | null)
        )
          saveEdit();
      }}
    >
      <div className="plan-step-head">
        <input
          type="checkbox"
          className="row-check"
          checked={item.done}
          aria-label={`Mark “${item.name}” as done`}
          onChange={(event) =>
            onChange({ ...item, done: event.target.checked })
          }
        />
        <div className="plan-step-title">
          {editing ? (
            <input
              className="plan-step-name"
              value={name}
              aria-label="Step name"
              autoFocus
              onChange={(event) => setName(event.target.value)}
            />
          ) : (
            <button
              type="button"
              className="plan-step-edit-trigger"
              onClick={() => setEditing(true)}
            >
              {item.name}
            </button>
          )}
          <span>
            {count} · {item.done ? "Completed" : "Not started"}
          </span>
        </div>
        <div className="plan-step-actions">
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${item.name}`}
            onClick={() => setEditing(true)}
          >
            <Pencil size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move step up"
            disabled={first}
            onClick={() => onMove(-1)}
          >
            <ArrowUp size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Move step down"
            disabled={last}
            onClick={() => onMove(1)}
          >
            <ArrowDown size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            className="row-delete"
            aria-label={`Delete step “${item.name}”`}
            onClick={onRemove}
          >
            <Trash2 size={15} />
          </Button>
          <Button
            variant="ghost"
            size="icon"
            aria-label={`${open ? "Collapse" : "Expand"} ${item.name}`}
            aria-expanded={open}
            onClick={() => onOpenChange(!open)}
          >
            <ChevronDown size={16} className={open ? "rotate" : undefined} />
          </Button>
        </div>
      </div>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            className="plan-step-body"
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            transition={{ duration: 0.2, ease: "easeOut" }}
          >
            {editing ? (
              <div className="plan-inline-editor">
                <textarea
                  className="plan-step-description-input"
                  value={description}
                  aria-label="Step description"
                  placeholder="Add a test note or installation instruction…"
                  rows={description ? 3 : 2}
                  onChange={(event) => setDescription(event.target.value)}
                />
                <div className="plan-inline-actions">
                  <Button variant="ghost" size="small" onClick={cancelEdit}>
                    Cancel
                  </Button>
                  <Button
                    size="small"
                    disabled={!name.trim()}
                    onClick={saveEdit}
                  >
                    Save Step
                  </Button>
                </div>
              </div>
            ) : item.description ? (
              <MarkdownText className="plan-step-description">
                {item.description}
              </MarkdownText>
            ) : (
              <button
                type="button"
                className="plan-step-add-note"
                onClick={() => setEditing(true)}
              >
                Add a test note or installation instruction…
              </button>
            )}
            <section
              className="plan-step-items"
              aria-label={`Items in ${item.name}`}
            >
              <div className="plan-step-items-head">
                <h5>Items in this Step</h5>
                <div className="plan-step-item-actions">
                  <span className="plan-count">{count}</span>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setAddModsOpen(true)}
                  >
                    <Plus size={15} /> Add mods
                  </Button>
                </div>
              </div>
              <div className="plan-add-row plan-step-add-row">
                <Select
                  aria-label="Content type"
                  size="sm"
                  variant="compact"
                  value={typeFilter}
                  onValueChange={(value) =>
                    setTypeFilter(value as PlanItemType | "")
                  }
                  options={contentTypeFilterOptions}
                />
                <Combobox
                  aria-label="Add an item to this Step"
                  size="sm"
                  value=""
                  placeholder={
                    available.length
                      ? "Search and add an item…"
                      : "Everything of this type is already in this batch"
                  }
                  searchPlaceholder="Search by name…"
                  emptyText="Nothing matches."
                  disabled={!available.length}
                  options={available.map(({ value, label }) => ({
                    value,
                    label,
                  }))}
                  onValueChange={(value) => value && add(value)}
                />
              </div>
              {mods.length || missing.length ? (
                <ul className="plan-mods">
                  {mods.map((mod) => (
                    <motion.li
                      key={mod.id}
                      className={
                        recentModIds.has(mod.id) ? "plan-mod-recent" : undefined
                      }
                      initial={
                        recentModIds.has(mod.id) ? { opacity: 0, y: -4 } : false
                      }
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2, ease: "easeOut" }}
                    >
                      <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
                      <span className="plan-mod-name">
                        <strong>{mod.name}</strong>
                        <span>
                          {mod.version ? `v${mod.version} · ` : ""}
                          {mod.source} · {mod.side} side
                        </span>
                      </span>
                      <Select
                        aria-label={`Status for ${mod.name}`}
                        className={`plan-mod-status plan-mod-status-${mod.status}`}
                        size="sm"
                        variant="compact"
                        value={mod.status}
                        options={modStatusOptions}
                        onValueChange={(value) => {
                          const status = value as Mod["status"];
                          if (status === mod.status) return;
                          saveMod({ ...mod, status }, mod.id);
                          notify({
                            title: `Updated ${mod.name}`,
                            description: `Status: ${modStatusLabels[status]}.`,
                          });
                        }}
                      />
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove ${mod.name} from this Step`}
                        title="Remove from Step"
                        onClick={() =>
                          onBatchChange(
                            unassignItem(batch, item.id, {
                              type: "mod",
                              id: mod.id,
                            }),
                          )
                        }
                      >
                        <X size={15} />
                      </Button>
                    </motion.li>
                  ))}
                  {missing.map((id) => (
                    <li key={id} className="plan-missing">
                      <span className="plan-mod-name">
                        <strong>{id}</strong>
                        <span>No longer in the mod list</span>
                      </span>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Remove missing mod ${id} from this Step`}
                        onClick={() =>
                          onBatchChange(
                            unassignItem(batch, item.id, { type: "mod", id }),
                          )
                        }
                      >
                        <X size={15} />
                      </Button>
                    </li>
                  ))}
                </ul>
              ) : (
                <div className="plan-step-empty">
                  <p className="mr-hint">No mods added yet.</p>
                  <Button
                    variant="secondary"
                    size="small"
                    onClick={() => setAddModsOpen(true)}
                  >
                    <Plus size={15} /> Add mods
                  </Button>
                </div>
              )}
              {mods.length > 0 && (
                <p className="mr-hint">{installGuidance.mod}</p>
              )}
              {mods.length > 0 && (
                <p className="plan-step-dependency" role="status">
                  <GitBranch size={15} aria-hidden="true" />
                  {dependencyCounts.resolved} dependencies found ·{" "}
                  {dependencyCounts.requiredMissing > 0 &&
                    `${dependencyCounts.requiredMissing} missing · `}
                  {dependencyCounts.optionalMissing > 0 &&
                    `${dependencyCounts.optionalMissing} optional not added · `}
                  {dependencyCounts.unresolved} unresolved
                  {dependencyCounts.later > 0 &&
                    ` · ${dependencyCounts.later} in a later batch`}
                </p>
              )}
              {contentTypes.map((type) => (
                <ContentGroup
                  key={type}
                  type={type}
                  items={content[type].items}
                  missing={content[type].missing}
                  onRemove={(id) =>
                    onBatchChange(unassignItem(batch, item.id, { type, id }))
                  }
                  onOpen={(contentItem) =>
                    onOpenContent(contentKeyByType[type], contentItem)
                  }
                />
              ))}
            </section>
          </motion.div>
        )}
      </AnimatePresence>
      <Dialog
        open={addModsOpen}
        onOpenChange={(next) => {
          setAddModsOpen(next);
          if (!next) resetModPicker();
        }}
        title={`Add mods to ${item.name}`}
        description="Select unassigned mods, or move a mod already assigned to another Step in this batch."
        size="wide"
        onOpenAutoFocus={(event) => {
          event.preventDefault();
          modSearchRef.current?.focus();
        }}
      >
        <div className="plan-mod-picker">
          <label className="plan-mod-search">
            <Search size={16} aria-hidden="true" />
            <span className="sr-only">Search mods</span>
            <input
              ref={modSearchRef}
              value={modSearch}
              placeholder="Search mods…"
              onChange={(event) => setModSearch(event.target.value)}
            />
          </label>
          <ul className="plan-mod-picker-list">
            {filteredMods.map((mod) => {
              const owner = ownerOf(mod.id);
              const inCurrentStep = owner?.id === item.id;
              const selected = selectedModIds.has(mod.id);
              const moving = moveModIds.has(mod.id);
              const otherBatchLocations =
                otherBatchLocationsByModId.get(mod.id) ?? [];
              const planLocationLabel = otherBatchLocations.length
                ? otherBatchLocations.length === 1
                  ? `Already in ${otherBatchLocations[0]}`
                  : `Already in ${otherBatchLocations.length} plan steps`
                : null;
              return (
                <li key={mod.id}>
                  <label
                    className={
                      owner
                        ? "plan-mod-picker-option"
                        : "plan-mod-picker-option plan-mod-picker-option-full-row"
                    }
                  >
                    <input
                      type="checkbox"
                      checked={selected}
                      disabled={Boolean(owner)}
                      onChange={() =>
                        setSelectedModIds((current) => {
                          const next = new Set(current);
                          if (next.has(mod.id)) next.delete(mod.id);
                          else next.add(mod.id);
                          return next;
                        })
                      }
                    />
                    <span>
                      <strong>{mod.name}</strong>
                      <small>
                        {mod.version ? `v${mod.version} · ` : ""}
                        {mod.source}
                      </small>
                    </span>
                    {!owner && planLocationLabel && (
                      <span
                        className="plan-mod-plan-location"
                        title={otherBatchLocations.join("\n")}
                      >
                        {planLocationLabel}
                      </span>
                    )}
                  </label>
                  {inCurrentStep ? (
                    <span className="mr-hint">Already in this Step</span>
                  ) : owner ? (
                    <Button
                      variant="ghost"
                      size="small"
                      className={`plan-mod-move${moving ? " active" : ""}`}
                      aria-pressed={moving}
                      onClick={() =>
                        setMoveModIds((current) => {
                          const next = new Set(current);
                          if (next.has(mod.id)) next.delete(mod.id);
                          else next.add(mod.id);
                          return next;
                        })
                      }
                    >
                      <ArrowRightLeft size={15} />
                      {moving ? "Will move here" : `Move from ${owner.name}`}
                    </Button>
                  ) : null}
                </li>
              );
            })}
          </ul>
          {!filteredMods.length && (
            <p className="mr-hint">No mods match this search.</p>
          )}
          <div className="dialog-actions">
            <Button
              variant="ghost"
              onClick={() => {
                setAddModsOpen(false);
                resetModPicker();
              }}
            >
              Cancel
            </Button>
            <Button
              disabled={!selectedModIds.size && !moveModIds.size}
              onClick={applyMods}
            >
              Add {selectedModIds.size + moveModIds.size} mods
            </Button>
          </div>
        </div>
      </Dialog>
    </li>
  );
}

const contentTypeFilterOptions = [
  { value: "", label: "All other content" },
  ...contentTypes.map((type) => ({
    value: type,
    label: planTypeLabels[type].many,
  })),
];

/** Resource packs, data packs, or shaders in one batch, with links to their entries. */
function ContentGroup({
  type,
  items,
  missing,
  onRemove,
  onOpen,
}: {
  type: (typeof contentTypes)[number];
  items: ContentItem[];
  missing: string[];
  onRemove: (id: string) => void;
  onOpen: (item: ContentItem) => void;
}) {
  const headingId = useId();
  if (!items.length && !missing.length) return null;
  const label = planTypeLabels[type];
  return (
    <section aria-labelledby={headingId}>
      <h4 id={headingId}>
        {label.many} <span className="plan-count">{items.length}</span>
      </h4>
      <ul className="plan-mods">
        {items.map((item) => (
          <li key={item.id}>
            <ModArtwork name={item.name} imageUrl={item.imageUrl} />
            <span className="plan-mod-name">
              <button
                type="button"
                className="plan-mod-open"
                onClick={() => onOpen(item)}
              >
                {item.name}
              </button>
              <span>
                {item.version ? `v${item.version} · ` : ""}
                {item.source}
              </span>
            </span>
            <span className={`status status-${item.status}`}>
              {contentStatusLabels[item.status]}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove ${item.name} from this batch`}
              title="Remove from batch"
              onClick={() => onRemove(item.id)}
            >
              <X size={15} />
            </Button>
          </li>
        ))}
        {missing.map((id) => (
          <li key={id} className="plan-missing">
            <span className="plan-mod-name">
              <strong>{id}</strong>
              <span>No longer in the {label.many.toLowerCase()} list</span>
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label={`Remove missing ${label.one} ${id} from this batch`}
              onClick={() => onRemove(id)}
            >
              <X size={15} />
            </Button>
          </li>
        ))}
      </ul>
      <p className="mr-hint">{installGuidance[type]}</p>
    </section>
  );
}

function BatchBody({
  batch,
  onChange,
  onOpenMod,
  onOpenContent,
  focusStep,
}: {
  batch: Batch;
  onChange: (batch: Batch) => void;
  onOpenMod: (mod: Mod) => void;
  onOpenContent: (key: ContentKey, item: ContentItem) => void;
  focusStep?: { id: string; request: number };
}) {
  const { data } = useCollection();
  const [newStepName, setNewStepName] = useState("");
  const [openStepId, setOpenStepId] = useState<string | null>(
    () => batch.steps.find((step) => !step.done)?.id ?? null,
  );
  const [highlightedStepId, setHighlightedStepId] = useState<string | null>(
    null,
  );
  const addId = useId();
  const setSteps = (steps: Step[]) => onChange({ ...batch, steps });

  useEffect(() => {
    if (!focusStep || !batch.steps.some((step) => step.id === focusStep.id))
      return;
    const frame = requestAnimationFrame(() => {
      setOpenStepId(focusStep.id);
      setHighlightedStepId(focusStep.id);
      document
        .getElementById(`step-${batch.id}-${focusStep.id}`)
        ?.scrollIntoView({ block: "center" });
    });
    const timeout = window.setTimeout(() => setHighlightedStepId(null), 1800);
    return () => {
      cancelAnimationFrame(frame);
      window.clearTimeout(timeout);
    };
  }, [batch.id, batch.steps, focusStep]);

  return (
    <div className="plan-body">
      <section aria-labelledby={`${addId}-steps`}>
        <div className="plan-steps-heading">
          <h4 id={`${addId}-steps`}>Steps</h4>
          <span className="plan-count">
            {plural(batch.steps.length, "total")}
          </span>
        </div>
        {batch.steps.length ? (
          <ol className="plan-steps">
            {batch.steps.map((item, index) => (
              <StepCard
                key={item.id}
                batch={batch}
                item={item}
                open={openStepId === item.id}
                onOpenChange={(nextOpen) =>
                  setOpenStepId(nextOpen ? item.id : null)
                }
                first={index === 0}
                last={index === batch.steps.length - 1}
                onChange={(next) =>
                  setSteps(
                    batch.steps.map((other) =>
                      other.id === next.id ? next : other,
                    ),
                  )
                }
                onBatchChange={onChange}
                onMove={(offset) =>
                  setSteps(moveItem(batch.steps, index, offset))
                }
                onRemove={() =>
                  setSteps(batch.steps.filter((other) => other.id !== item.id))
                }
                onOpenContent={onOpenContent}
                highlighted={highlightedStepId === item.id}
              />
            ))}
          </ol>
        ) : (
          <div className="plan-steps-empty">
            <p className="mr-hint">
              Start with a Step to group installation or testing work.
            </p>
          </div>
        )}
        <form
          className="plan-add-step"
          onSubmit={(event) => {
            event.preventDefault();
            const name = newStepName.trim();
            if (!name) return;
            const id = newStepId(batch.steps);
            setSteps([
              ...batch.steps,
              {
                id,
                name,
                description: "",
                done: false,
                itemRefs: [],
              },
            ]);
            setOpenStepId(id);
            setNewStepName("");
          }}
        >
          <input
            className="plan-step-input"
            value={newStepName}
            placeholder={
              batch.steps.length ? "New Step…" : "Name your first Step…"
            }
            aria-label="New Step"
            onChange={(event) => setNewStepName(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            size="small"
            disabled={!newStepName.trim()}
          >
            <Plus size={15} />{" "}
            {batch.steps.length ? "Add step" : "Add first Step"}
          </Button>
        </form>
      </section>
      <DependencyOverview
        batchId={batch.id}
        plan={data.batches}
        mods={data.mods}
        onOpenMod={onOpenMod}
      />
    </div>
  );
}

/** Manage → Build plan: ordered installation batches that reference mods by ID. */
export function BuildPlanEditor({
  onOpenMod,
  onOpenContent,
  focusBatchId,
}: {
  onOpenMod: (mod: Mod) => void;
  onOpenContent: (key: ContentKey, item: ContentItem) => void;
  /** Expanded and scrolled into view when the editor opens (from the dashboard). */
  focusBatchId?: string | null;
}) {
  const { data, updateBatches } = useCollection();
  const notify = useToast();
  const batches = orderedBatches(data.batches);
  const readiness = useMemo(() => planningDashboard(data).batches, [data]);
  const [planSearch, setPlanSearch] = useState("");
  const [stepFocus, setStepFocus] = useState<{
    batchId: string;
    id: string;
    request: number;
  } | null>(null);
  const stepFocusRequest = useRef(0);
  const planSearchResults = useMemo(() => {
    if (!planSearch.trim()) return [];
    const modsById = new Map(data.mods.map((mod) => [mod.id, mod]));
    return [...modAssignmentLocations(data.batches).entries()]
      .flatMap(([id, locations]) => {
        const mod = modsById.get(id);
        return mod && matchesSearchText(mod.name, planSearch)
          ? locations.map((location) => ({ mod, location }))
          : [];
      })
      .slice(0, 20);
  }, [data.batches, data.mods, planSearch]);
  const [expanded, setExpanded] = useState<Set<string>>(
    () => new Set(focusBatchId ? [focusBatchId] : []),
  );
  useEffect(() => {
    if (focusBatchId)
      document
        .getElementById(`batch-${focusBatchId}`)
        ?.scrollIntoView({ block: "start" });
  }, [focusBatchId]);
  // null: closed; "" : all batches; otherwise the batch the export was opened from.
  const [exportFor, setExportFor] = useState<string | null>(null);
  const [form, setForm] = useState<{
    batch: Batch | null;
    name: string;
    description: string;
    error?: string;
  } | null>(null);
  const shownForm = useRetained(form);
  const [deleting, setDeleting] = useState<Batch | null>(null);
  const shownDeleting = useRetained(deleting);
  const formId = useId();

  const replace = (next: Batch) =>
    updateBatches(
      batches.map((batch) => (batch.id === next.id ? next : batch)),
    );
  const toggle = (id: string) =>
    setExpanded((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const openBatch = (id: string) => {
    setExpanded((current) => new Set(current).add(id));
    requestAnimationFrame(() =>
      document
        .getElementById(`batch-${id}`)
        ?.scrollIntoView({ block: "start" }),
    );
  };
  const focusPlanStep = (batchId: string, stepId: string) => {
    setExpanded((current) => new Set(current).add(batchId));
    const request = stepFocusRequest.current + 1;
    stepFocusRequest.current = request;
    setStepFocus({
      batchId,
      id: stepId,
      request,
    });
    window.setTimeout(
      () =>
        setStepFocus((current) =>
          current?.request === request ? null : current,
        ),
      1800,
    );
    setPlanSearch("");
  };
  const submitForm = () => {
    if (!form) return;
    const name = form.name.trim();
    if (!name) {
      setForm({ ...form, error: "Give the batch a name." });
      return;
    }
    if (form.batch)
      replace({ ...form.batch, name, description: form.description.trim() });
    else {
      const id = newBatchId(name, batches);
      updateBatches([
        ...batches,
        {
          id,
          name,
          description: form.description.trim(),
          order: batches.length + 1,
          steps: [],
        },
      ]);
      setExpanded((current) => new Set(current).add(id));
    }
    notify({
      title: form.batch ? `Saved ${name}` : `Added ${name}`,
      description: "Stored in this browser’s draft.",
    });
    setForm(null);
  };

  return (
    <div className="build-plan">
      <div className="manage-section-head">
        <div>
          <h2>Build plan</h2>
          <p>
            Group mods, resource packs, data packs, and shaders into batches to
            install in order, with steps to check after each one.
          </p>
        </div>
        <div className="section-head-actions">
          <Button
            variant="secondary"
            disabled={!batches.length}
            onClick={() => setExportFor("")}
          >
            <FileDown size={16} /> Export guide
          </Button>
          <Button
            onClick={() => setForm({ batch: null, name: "", description: "" })}
          >
            <Plus size={17} /> New batch
          </Button>
        </div>
      </div>
      <div className="plan-find-mod">
        <label className="plan-find-mod-field">
          <Search size={16} aria-hidden="true" />
          <span className="sr-only">Find a mod in this plan</span>
          <input
            value={planSearch}
            placeholder="Find a mod in this plan…"
            onChange={(event) => setPlanSearch(event.target.value)}
          />
          {planSearch && (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Clear build plan search"
              onClick={() => setPlanSearch("")}
            >
              <X size={15} />
            </Button>
          )}
        </label>
        {planSearch.trim() && (
          <ul className="plan-find-mod-results" aria-label="Matching plan mods">
            {planSearchResults.map(({ mod, location }) => (
              <li key={`${mod.id}:${location.batchId}:${location.stepId}`}>
                <button
                  type="button"
                  onClick={() =>
                    focusPlanStep(location.batchId, location.stepId)
                  }
                >
                  <strong>{mod.name}</strong>
                  <span>
                    Batch {location.batchPosition} · {location.batchName} ·{" "}
                    {location.stepName}
                  </span>
                </button>
              </li>
            ))}
            {!planSearchResults.length && (
              <li className="mr-hint">No assigned mods match this search.</li>
            )}
          </ul>
        )}
      </div>
      {batches.length ? (
        <>
          <BatchReadiness batches={readiness} onOpenBatch={openBatch} />
          <ol className="plan-list">
            {batches.map((batch, index) => {
              const open = expanded.has(batch.id);
              const done = batch.steps.filter((item) => item.done).length;
              const stepProgress = batch.steps.length
                ? Math.round((done / batch.steps.length) * 100)
                : 0;
              return (
                <li
                  key={batch.id}
                  id={`batch-${batch.id}`}
                  className="plan-batch"
                >
                  <div className="plan-head">
                    <button
                      type="button"
                      className="plan-toggle"
                      aria-expanded={open}
                      onClick={() => toggle(batch.id)}
                    >
                      <span className="plan-order" aria-hidden="true">
                        {index + 1}
                      </span>
                      <span className="plan-title">
                        <strong>{batch.name}</strong>
                        <span>
                          {batchCountText(
                            modIdsOf(batch).length,
                            batchContent(batch, data),
                          )}{" "}
                          ·{" "}
                          {batch.steps.length
                            ? `${done}/${batch.steps.length} steps done`
                            : "no steps"}
                        </span>
                      </span>
                      <ChevronDown
                        size={16}
                        aria-hidden="true"
                        className={open ? "rotate" : undefined}
                      />
                    </button>
                    <div className="row-actions">
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${batch.name} up`}
                        disabled={index === 0}
                        onClick={() =>
                          updateBatches(moveItem(batches, index, -1))
                        }
                      >
                        <ArrowUp size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Move ${batch.name} down`}
                        disabled={index === batches.length - 1}
                        onClick={() =>
                          updateBatches(moveItem(batches, index, 1))
                        }
                      >
                        <ArrowDown size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Edit ${batch.name}`}
                        onClick={() =>
                          setForm({
                            batch,
                            name: batch.name,
                            description: batch.description,
                          })
                        }
                      >
                        <Pencil size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Export a guide for ${batch.name}`}
                        title="Export guide"
                        onClick={() => setExportFor(batch.id)}
                      >
                        <FileDown size={16} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="row-delete"
                        aria-label={`Delete ${batch.name}`}
                        onClick={() => setDeleting(batch)}
                      >
                        <Trash2 size={16} />
                      </Button>
                    </div>
                  </div>
                  {batch.description && (
                    <MarkdownText className="plan-description">
                      {batch.description}
                    </MarkdownText>
                  )}
                  <div
                    className="plan-batch-progress"
                    role="progressbar"
                    aria-label={`${batch.name} Step progress`}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-valuenow={stepProgress}
                  >
                    <span style={{ width: `${stepProgress}%` }} />
                  </div>
                  <AnimatePresence initial={false}>
                    {open && (
                      <motion.div
                        className="plan-collapse"
                        initial={{ opacity: 0, height: 0 }}
                        animate={{ opacity: 1, height: "auto" }}
                        exit={{ opacity: 0, height: 0 }}
                        transition={{ duration: 0.2, ease: "easeOut" }}
                      >
                        <BatchBody
                          batch={batch}
                          onChange={replace}
                          onOpenMod={onOpenMod}
                          onOpenContent={onOpenContent}
                          focusStep={
                            stepFocus?.batchId === batch.id
                              ? stepFocus
                              : undefined
                          }
                        />
                      </motion.div>
                    )}
                  </AnimatePresence>
                </li>
              );
            })}
          </ol>
        </>
      ) : (
        <div className="empty-state">
          <div className="empty-icon">
            <ListChecks size={24} />
          </div>
          <h3>No batches yet</h3>
          <p>
            Start with a batch such as “Core libraries”, then add mods and the
            steps to check after installing them.
          </p>
          <Button
            onClick={() => setForm({ batch: null, name: "", description: "" })}
          >
            <Plus size={17} /> New batch
          </Button>
        </div>
      )}

      <Dialog
        open={form !== null}
        onOpenChange={(open) => !open && setForm(null)}
        title={shownForm?.batch ? `Edit ${shownForm.batch.name}` : "New batch"}
        description="Batches are installed in order. Items stay in their collections; a batch only refers to them."
      >
        <form
          className="editor-form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            submitForm();
          }}
        >
          <div className="form-grid">
            <label
              className={`form-field form-field-wide${shownForm?.error ? " has-error" : ""}`}
            >
              <span>
                Name
                <span className="field-required" aria-hidden="true">
                  *
                </span>
              </span>
              <input
                autoFocus
                value={shownForm?.name ?? ""}
                placeholder="e.g. Core libraries"
                aria-invalid={shownForm?.error ? true : undefined}
                aria-describedby={
                  shownForm?.error ? `${formId}-error` : undefined
                }
                onChange={(event) =>
                  form &&
                  setForm({
                    ...form,
                    name: event.target.value,
                    error: undefined,
                  })
                }
              />
              {shownForm?.error && (
                <small
                  id={`${formId}-error`}
                  className="field-error"
                  role="alert"
                >
                  {shownForm.error}
                </small>
              )}
            </label>
            <label className="form-field form-field-wide">
              <span>Description</span>
              <textarea
                rows={3}
                value={shownForm?.description ?? ""}
                placeholder="What this batch adds and why it comes at this point"
                onChange={(event) =>
                  form && setForm({ ...form, description: event.target.value })
                }
              />
            </label>
          </div>
          <div className="dialog-actions">
            <Button type="button" variant="ghost" onClick={() => setForm(null)}>
              Cancel
            </Button>
            <Button type="submit">
              {shownForm?.batch ? "Save batch" : "Add batch"}
            </Button>
          </div>
        </form>
      </Dialog>

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${shownDeleting?.name ?? "batch"}?`}
        description={`This removes the batch and its ${plural(shownDeleting?.steps.length ?? 0, "Step")}. Its ${plural(modIdsOf(shownDeleting ?? { id: "", name: "", description: "", order: 1, steps: [] }).length, "mod")} stay in the mod list.`}
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) {
                updateBatches(
                  batches.filter((batch) => batch.id !== deleting.id),
                );
                notify({
                  kind: "info",
                  title: `Deleted ${deleting.name}`,
                  description: "Its mods are still in the mod list.",
                });
              }
              setDeleting(null);
            }}
          >
            <Trash2 size={16} /> Delete batch
          </Button>
        </div>
      </Dialog>
      <ExportGuideDialog
        open={exportFor !== null}
        onOpenChange={(open) => !open && setExportFor(null)}
        collection={data}
        currentBatchId={exportFor || null}
      />
    </div>
  );
}
