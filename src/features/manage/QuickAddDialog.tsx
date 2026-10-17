import { useId, useMemo, useState } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import {
  DEFAULT_CATEGORY,
  parseQuickAdd,
  quickAddMods,
} from "../../lib/quickAdd";
import type { Mod } from "../../lib/schema";

const PREVIEW_LIMIT = 50;

function QuickAddForm({
  mods,
  onAdd,
  onCancel,
}: {
  mods: Mod[];
  onAdd: (created: Mod[]) => boolean;
  onCancel: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const lines = useMemo(() => parseQuickAdd(text, mods), [text, mods]);
  const toAdd = lines.filter((line) => includeDuplicates || !line.duplicate);
  const skipped = lines.length - toAdd.length;
  const categories = [
    ...new Set([DEFAULT_CATEGORY, ...mods.map((mod) => mod.category)]),
  ].sort((a, b) =>
    a === DEFAULT_CATEGORY
      ? -1
      : b === DEFAULT_CATEGORY
        ? 1
        : a.localeCompare(b),
  );

  return (
    <form
      className="editor-form quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        if (!toAdd.length) return;
        if (
          onAdd(
            quickAddMods(
              toAdd.map((line) => line.name),
              mods,
              category,
            ),
          )
        )
          onCancel();
      }}
    >
      <label className="form-field form-field-wide">
        <span>Mod names, one per line</span>
        <textarea
          autoFocus
          rows={7}
          value={text}
          placeholder={"Create\nJust Enough Items\nFarmer's Delight"}
          aria-describedby={`${id}-hint`}
          onChange={(event) => setText(event.target.value)}
        />
        <small id={`${id}-hint`}>
          Added as Planned with no version, source link, or compatibility data.
          Link them to Modrinth or import their JARs later to fill that in.
        </small>
      </label>
      <div className="quick-add-options">
        <div className="form-field">
          <span id={`${id}-category`}>Category</span>
          <Select
            aria-labelledby={`${id}-category`}
            value={category}
            onValueChange={setCategory}
            options={categories.map((value) => ({ value, label: value }))}
          />
        </div>
        <label className="mr-check">
          <input
            type="checkbox"
            checked={includeDuplicates}
            onChange={(event) => setIncludeDuplicates(event.target.checked)}
          />
          Also add duplicates as separate mods
        </label>
      </div>
      {lines.length > 0 && (
        <div className="quick-add-preview">
          <span className="mr-hint" role="status">
            {toAdd.length} to add
            {skipped
              ? ` · ${skipped} duplicate${skipped === 1 ? "" : "s"} skipped`
              : ""}
          </span>
          <ul>
            {lines.slice(0, PREVIEW_LIMIT).map((line, index) => (
              <li
                key={`${index}:${line.name}`}
                className={
                  line.duplicate && !includeDuplicates
                    ? "quick-add-skip"
                    : undefined
                }
              >
                <span>{line.name}</span>
                {line.duplicate === "list" && (
                  <span className="mr-chip mr-chip-warn">
                    Already in the list as “{line.existingName}”
                  </span>
                )}
                {line.duplicate === "repeat" && (
                  <span className="mr-chip mr-chip-warn">Repeated</span>
                )}
              </li>
            ))}
            {lines.length > PREVIEW_LIMIT && (
              <li className="mr-hint">
                and {lines.length - PREVIEW_LIMIT} more
              </li>
            )}
          </ul>
        </div>
      )}
      <div className="dialog-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit" disabled={!toAdd.length}>
          <ListPlus size={16} /> Add {toAdd.length}{" "}
          {toAdd.length === 1 ? "mod" : "mods"}
        </Button>
      </div>
    </form>
  );
}

/** Adds name-only mods without Modrinth or JAR files; nothing is matched or fetched. */
export function QuickAddDialog({
  open,
  onOpenChange,
  mods,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mods: Mod[];
  onAdd: (created: Mod[]) => boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick add mods"
      description="Paste mod names to plan with now and fill in details later."
      size="wide"
    >
      {open && (
        <QuickAddForm
          mods={mods}
          onAdd={onAdd}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
