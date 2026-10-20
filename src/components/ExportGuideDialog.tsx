import { useMemo, useState } from "react";
import { FileDown } from "lucide-react";
import { useToast } from "../app/ToastContext";
import { orderedBatches } from "../lib/batches";
import {
  buildGuide,
  defaultGuideOptions,
  guideFilename,
  type GuideFormat,
  type GuideOptions,
} from "../lib/buildGuide";
import type { Collection } from "../lib/schema";
import { downloadText } from "../lib/storage";
import { Button } from "./ui/button";
import { Dialog } from "./ui/dialog";
import { Select } from "./ui/select";

const PREVIEW_LINES = 80;

function ExportGuideForm({
  collection,
  currentBatchId,
  onDone,
}: {
  collection: Collection;
  currentBatchId: string | null;
  onDone: () => void;
}) {
  const notify = useToast();
  const batches = orderedBatches(collection.batches);
  const current = batches.find((batch) => batch.id === currentBatchId);
  // Opened from a batch: start with that batch; otherwise every batch.
  const [options, setOptions] = useState<GuideOptions>({
    ...defaultGuideOptions,
    batchId: current?.id ?? null,
  });
  const generatedAt = useMemo(() => new Date(), []);
  const guide = useMemo(
    () => buildGuide(collection, options, generatedAt),
    [collection, options, generatedAt],
  );
  const lines = guide.split("\n");
  const set = (next: Partial<GuideOptions>) =>
    setOptions((value) => ({ ...value, ...next }));

  const exportGuide = () => {
    const filename = guideFilename(
      collection.modpack.name,
      options.format,
      batches.find((batch) => batch.id === options.batchId)?.name,
    );
    try {
      downloadText(
        filename,
        guide,
        options.format === "markdown" ? "text/markdown" : "text/plain",
      );
    } catch {
      notify({
        kind: "error",
        title: "Guide not exported",
        description: "The browser could not create the file.",
      });
      return;
    }
    notify({
      kind: "info",
      title: `${filename} exported`,
      description: "Created in this browser; nothing was uploaded.",
    });
    onDone();
  };

  if (!batches.length)
    return (
      <>
        <p className="mr-hint">
          The build plan has no batches yet. Add a batch in Manage → Build
          plan to export a guide.
        </p>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onDone}>
            Close
          </Button>
        </div>
      </>
    );

  return (
    <div className="guide-export">
      <div className="guide-options">
        <Select
          aria-label="Batches to export"
          size="sm"
          value={options.batchId ?? ""}
          onValueChange={(value) => set({ batchId: value || null })}
          options={[
            { value: "", label: `All batches (${batches.length})` },
            // Every batch can be chosen; opening from a batch only preselects it.
            ...batches.map((batch, index) => ({
              value: batch.id,
              label: `Batch ${index + 1}: ${batch.name}`,
            })),
          ]}
        />
        <Select
          aria-label="File format"
          size="sm"
          value={options.format}
          onValueChange={(value) => set({ format: value as GuideFormat })}
          options={[
            { value: "markdown", label: "Markdown (.md)" },
            { value: "text", label: "Plain text (.txt)" },
          ]}
        />
      </div>
      <div className="guide-checks" role="group" aria-label="Sections">
        {(
          [
            ["includeDependencies", "Dependencies & warnings"],
            ["includeNotes", "Mod notes"],
            ["includeSteps", "Installation steps"],
          ] as const
        ).map(([key, label]) => (
          <label key={key} className="mr-check">
            <input
              type="checkbox"
              checked={options[key]}
              onChange={(event) => set({ [key]: event.target.checked })}
            />
            {label}
          </label>
        ))}
      </div>
      <div className="guide-preview">
        <span className="mr-hint">
          Preview
          {lines.length > PREVIEW_LINES
            ? ` (first ${PREVIEW_LINES} of ${lines.length} lines)`
            : ""}
        </span>
        <pre tabIndex={0} aria-label="Guide preview">
          {lines.slice(0, PREVIEW_LINES).join("\n")}
        </pre>
      </div>
      <div className="dialog-actions">
        <Button variant="ghost" onClick={onDone}>
          Cancel
        </Button>
        <Button onClick={exportGuide}>
          <FileDown size={16} /> Export guide
        </Button>
      </div>
    </div>
  );
}

/**
 * Read-only build guide export (Markdown or plain text), generated in the browser from the
 * current data, including unsaved edits. Used in Manage and on the public Preview page.
 */
export function ExportGuideDialog({
  open,
  onOpenChange,
  collection,
  currentBatchId = null,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: Collection;
  currentBatchId?: string | null;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Export build guide"
      description="A step-by-step guide for installing the pack in CurseForge. Saved files are not changed."
      size="wide"
    >
      {open && (
        <ExportGuideForm
          collection={collection}
          currentBatchId={currentBatchId}
          onDone={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
