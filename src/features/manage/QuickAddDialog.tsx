import { useId, useMemo, useState } from "react";
import { ListPlus } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { parseQuickAdd } from "../../lib/quickAdd";
import type { InboxEntry, Mod } from "../../lib/schema";

const PREVIEW_LIMIT = 50;

function QuickAddForm({
  mods,
  inbox,
  onAdd,
  onCancel,
}: {
  mods: Mod[];
  inbox: InboxEntry[];
  /** Receives the names to put in the Mod Inbox; nothing is added to the collection. */
  onAdd: (names: string[]) => boolean;
  onCancel: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [includeDuplicates, setIncludeDuplicates] = useState(false);
  const lines = useMemo(
    () => parseQuickAdd(text, { inbox, collection: mods }),
    [text, inbox, mods],
  );
  const toAdd = lines.filter((line) => includeDuplicates || !line.duplicate);
  const skipped = lines.length - toAdd.length;

  return (
    <form
      className="editor-form quick-add"
      onSubmit={(event) => {
        event.preventDefault();
        if (!toAdd.length) return;
        if (onAdd(toAdd.map((line) => line.name))) onCancel();
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
          Names go to the Mod Inbox only. Add them to the collection from there
          when you are ready.
        </small>
      </label>
      <div className="quick-add-options">
        <label className="mr-check">
          <input
            type="checkbox"
            checked={includeDuplicates}
            onChange={(event) => setIncludeDuplicates(event.target.checked)}
          />
          Also add names that are already in the inbox or collection
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
                {line.duplicate === "inbox" && (
                  <span className="mr-chip mr-chip-warn">
                    Already in the inbox as “{line.existingName}”
                  </span>
                )}
                {line.duplicate === "collection" && (
                  <span className="mr-chip mr-chip-warn">
                    Already in the collection as “{line.existingName}”
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
          <ListPlus size={16} /> Add {toAdd.length} to inbox
        </Button>
      </div>
    </form>
  );
}

/** Quick Add to Inbox: saves pasted names to the Mod Inbox; nothing is matched or fetched. */
export function QuickAddDialog({
  open,
  onOpenChange,
  mods,
  inbox,
  onAdd,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mods: Mod[];
  inbox: InboxEntry[];
  onAdd: (names: string[]) => boolean;
}) {
  return (
    <Dialog
      open={open}
      onOpenChange={onOpenChange}
      title="Quick add to inbox"
      description="Paste mod names to keep for later. They are not added to the collection yet."
      size="wide"
    >
      {open && (
        <QuickAddForm
          mods={mods}
          inbox={inbox}
          onAdd={onAdd}
          onCancel={() => onOpenChange(false)}
        />
      )}
    </Dialog>
  );
}
