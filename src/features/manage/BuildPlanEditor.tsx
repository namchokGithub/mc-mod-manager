import { useEffect, useId, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  FileDown,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { useToast } from "../../app/ToastContext";
import { ModArtwork } from "../../components/ModArtwork";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import { Dialog } from "../../components/ui/dialog";
import {
  assignMod,
  batchMods,
  moveItem,
  newBatchId,
  newChecklistId,
  orderedBatches,
  unassignMod,
} from "../../lib/batches";
import { DependencyOverview } from "../../components/DependencyOverview";
import { ExportGuideDialog } from "../../components/ExportGuideDialog";
import type { Batch, ChecklistItem, Mod } from "../../lib/schema";
import { useRetained } from "../../lib/useRetained";

const plural = (count: number, word: string) =>
  `${count} ${word}${count === 1 ? "" : "s"}`;

function ChecklistRow({
  item,
  first,
  last,
  onChange,
  onMove,
  onRemove,
}: {
  item: ChecklistItem;
  first: boolean;
  last: boolean;
  onChange: (item: ChecklistItem) => void;
  onMove: (offset: -1 | 1) => void;
  onRemove: () => void;
}) {
  // Edited locally and committed on blur, so clearing the text to retype never fails validation.
  const [text, setText] = useState(item.text);
  return (
    <li className="plan-step">
      <input
        type="checkbox"
        className="row-check"
        checked={item.done}
        aria-label={`Mark “${item.text}” as done`}
        onChange={(event) => onChange({ ...item, done: event.target.checked })}
      />
      <input
        className="plan-step-input"
        value={text}
        aria-label="Checklist step"
        onChange={(event) => setText(event.target.value)}
        onBlur={() => {
          const trimmed = text.trim();
          if (!trimmed) setText(item.text);
          else if (trimmed !== item.text) onChange({ ...item, text: trimmed });
        }}
      />
      <div className="row-actions">
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
          aria-label={`Delete step “${item.text}”`}
          onClick={onRemove}
        >
          <Trash2 size={15} />
        </Button>
      </div>
    </li>
  );
}

function BatchBody({
  batch,
  onChange,
  onOpenMod,
}: {
  batch: Batch;
  onChange: (batch: Batch) => void;
  onOpenMod: (mod: Mod) => void;
}) {
  const { data } = useCollection();
  const [step, setStep] = useState("");
  const addId = useId();
  const { mods, missing } = batchMods(batch, data.mods);
  const available = data.mods
    .filter((mod) => !batch.modIds.includes(mod.id))
    .sort((a, b) => a.name.localeCompare(b.name));
  const setChecklist = (checklist: ChecklistItem[]) =>
    onChange({ ...batch, checklist });

  return (
    <div className="plan-body">
      <section aria-labelledby={`${addId}-mods`}>
        <h4 id={`${addId}-mods`}>Mods</h4>
        <Combobox
          aria-labelledby={`${addId}-mods`}
          size="sm"
          value=""
          placeholder={
            available.length ? "Add a mod to this batch…" : "All mods added"
          }
          searchPlaceholder="Search mods…"
          emptyText="No mods match."
          disabled={!available.length}
          options={available.map((mod) => ({ value: mod.id, label: mod.name }))}
          onValueChange={(id) => id && onChange(assignMod(batch, id))}
        />
        {mods.length || missing.length ? (
          <ul className="plan-mods">
            {mods.map((mod) => (
              <li key={mod.id}>
                <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
                <span className="plan-mod-name">
                  <strong>{mod.name}</strong>
                  <span>
                    {mod.version ? `v${mod.version} · ` : ""}
                    {mod.source}
                  </span>
                </span>
                <span className={`status status-${mod.status}`}>
                  {mod.status}
                </span>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={`Remove ${mod.name} from this batch`}
                  title="Remove from batch"
                  onClick={() => onChange(unassignMod(batch, mod.id))}
                >
                  <X size={15} />
                </Button>
              </li>
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
                  aria-label={`Remove missing mod ${id} from this batch`}
                  onClick={() => onChange(unassignMod(batch, id))}
                >
                  <X size={15} />
                </Button>
              </li>
            ))}
          </ul>
        ) : (
          <p className="mr-hint">No mods in this batch yet.</p>
        )}
      </section>
      <DependencyOverview
        batchId={batch.id}
        plan={data.batches}
        mods={data.mods}
        onOpenMod={onOpenMod}
      />
      <section aria-labelledby={`${addId}-steps`}>
        <h4 id={`${addId}-steps`}>Checklist</h4>
        {batch.checklist.length ? (
          <ol className="plan-steps">
            {batch.checklist.map((item, index) => (
              <ChecklistRow
                key={item.id}
                item={item}
                first={index === 0}
                last={index === batch.checklist.length - 1}
                onChange={(next) =>
                  setChecklist(
                    batch.checklist.map((other) =>
                      other.id === next.id ? next : other,
                    ),
                  )
                }
                onMove={(offset) =>
                  setChecklist(moveItem(batch.checklist, index, offset))
                }
                onRemove={() =>
                  setChecklist(
                    batch.checklist.filter((other) => other.id !== item.id),
                  )
                }
              />
            ))}
          </ol>
        ) : (
          <p className="mr-hint">
            Add steps such as “Launch once and check the log” or “Test a new
            world”.
          </p>
        )}
        <form
          className="plan-add-step"
          onSubmit={(event) => {
            event.preventDefault();
            const text = step.trim();
            if (!text) return;
            setChecklist([
              ...batch.checklist,
              { id: newChecklistId(batch.checklist), text, done: false },
            ]);
            setStep("");
          }}
        >
          <input
            className="plan-step-input"
            value={step}
            placeholder="New checklist step…"
            aria-label="New checklist step"
            onChange={(event) => setStep(event.target.value)}
          />
          <Button
            type="submit"
            variant="secondary"
            size="small"
            disabled={!step.trim()}
          >
            <Plus size={15} /> Add step
          </Button>
        </form>
      </section>
    </div>
  );
}

/** Manage → Build plan: ordered installation batches that reference mods by ID. */
export function BuildPlanEditor({
  onOpenMod,
  focusBatchId,
}: {
  onOpenMod: (mod: Mod) => void;
  /** Expanded and scrolled into view when the editor opens (from the dashboard). */
  focusBatchId?: string | null;
}) {
  const { data, updateBatches } = useCollection();
  const notify = useToast();
  const batches = orderedBatches(data.batches);
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
          modIds: [],
          checklist: [],
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
            Group mods into batches to install in order, with steps to check
            after each one.
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
      {batches.length ? (
        <ol className="plan-list">
          {batches.map((batch, index) => {
            const open = expanded.has(batch.id);
            const done = batch.checklist.filter((item) => item.done).length;
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
                        {plural(batch.modIds.length, "mod")} ·{" "}
                        {batch.checklist.length
                          ? `${done}/${batch.checklist.length} steps done`
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
                      onClick={() => updateBatches(moveItem(batches, index, 1))}
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
                  <p className="plan-description">{batch.description}</p>
                )}
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
                      />
                    </motion.div>
                  )}
                </AnimatePresence>
              </li>
            );
          })}
        </ol>
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
        description="Batches are installed in order. Mods stay in the main list; a batch only refers to them."
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
        description={`This removes the batch and its ${plural(shownDeleting?.checklist.length ?? 0, "checklist step")}. Its ${plural(shownDeleting?.modIds.length ?? 0, "mod")} stay in the mod list.`}
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
