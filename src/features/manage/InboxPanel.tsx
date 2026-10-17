import { useId, useMemo, useState } from "react";
import { Inbox, ListPlus, PackagePlus, Search, Trash2, X } from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { useToast } from "../../app/ToastContext";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { Select } from "../../components/ui/select";
import { collectionMatch, inboxRepeats, promoteInbox } from "../../lib/inbox";
import { DEFAULT_CATEGORY, normalizeName } from "../../lib/quickAdd";
import type { InboxEntry } from "../../lib/schema";
import { useRetained } from "../../lib/useRetained";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

function InboxRow({
  entry,
  selected,
  inCollection,
  repeated,
  onToggle,
  onChange,
  onDelete,
}: {
  entry: InboxEntry;
  selected: boolean;
  inCollection?: string;
  repeated: boolean;
  onToggle: () => void;
  onChange: (entry: InboxEntry) => void;
  onDelete: () => void;
}) {
  // Edited locally and committed on blur; an empty name is not saved.
  const [name, setName] = useState(entry.name);
  const [notes, setNotes] = useState(entry.notes);
  return (
    <li className={selected ? "inbox-row selected" : "inbox-row"}>
      <input
        type="checkbox"
        className="row-check"
        checked={selected}
        aria-label={`Select ${entry.name}`}
        onChange={onToggle}
      />
      <div className="inbox-fields">
        <input
          className="plan-step-input"
          value={name}
          aria-label="Name"
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const trimmed = name.trim().replace(/\s+/g, " ");
            if (!trimmed) setName(entry.name);
            else if (trimmed !== entry.name)
              onChange({ ...entry, name: trimmed });
          }}
        />
        <input
          className="plan-step-input inbox-notes"
          value={notes}
          placeholder="Notes (optional)"
          aria-label={`Notes for ${entry.name}`}
          onChange={(event) => setNotes(event.target.value)}
          onBlur={() => notes !== entry.notes && onChange({ ...entry, notes })}
        />
        <span className="inbox-meta">
          Added {dateFormat.format(new Date(entry.createdAt))}
          {inCollection && (
            <span className="mr-chip mr-chip-warn">
              Already in the collection as “{inCollection}”
            </span>
          )}
          {repeated && (
            <span className="mr-chip mr-chip-warn">Duplicate in the inbox</span>
          )}
        </span>
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="row-delete"
        aria-label={`Delete ${entry.name} from the inbox`}
        onClick={onDelete}
      >
        <Trash2 size={16} />
      </Button>
    </li>
  );
}

/** Manage → Mod Inbox: names waiting to become mods. Separate from the collection. */
export function InboxPanel({ onQuickAdd }: { onQuickAdd: () => void }) {
  const { data, updateInbox, promoteInbox: applyPromotion } = useCollection();
  const notify = useToast();
  const entries = data.inbox.entries;
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  const [deleting, setDeleting] = useState<string[] | null>(null);
  const shownDeleting = useRetained(deleting);
  const [promoting, setPromoting] = useState<string[] | null>(null);
  const shownPromoting = useRetained(promoting);
  const [category, setCategory] = useState(DEFAULT_CATEGORY);
  const categoryId = useId();

  const repeats = useMemo(() => inboxRepeats(entries), [entries]);
  // Selection only keeps IDs that still exist.
  const selection = new Set(
    entries.filter((entry) => selected.has(entry.id)).map((entry) => entry.id),
  );
  const shown = query.trim()
    ? entries.filter((entry) =>
        `${entry.name} ${entry.notes}`
          .toLowerCase()
          .includes(normalizeName(query)),
      )
    : entries;
  const plan = shownPromoting
    ? promoteInbox(entries, shownPromoting, data.mods, category)
    : null;
  const categories = [
    ...new Set([DEFAULT_CATEGORY, ...data.mods.map((mod) => mod.category)]),
  ].sort((a, b) =>
    a === DEFAULT_CATEGORY
      ? -1
      : b === DEFAULT_CATEGORY
        ? 1
        : a.localeCompare(b),
  );

  const replace = (next: InboxEntry) =>
    updateInbox(entries.map((entry) => (entry.id === next.id ? next : entry)));
  const toggle = (id: string) =>
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const confirmPromotion = () => {
    if (!promoting) return;
    const result = promoteInbox(entries, promoting, data.mods, category);
    if (result.created.length) {
      try {
        applyPromotion(result.created, result.promotedIds);
      } catch {
        // Nothing was changed: the entries stay in the inbox.
        notify({
          kind: "error",
          title: "Not added to the collection",
          description:
            "The new mods did not pass validation. The inbox is unchanged.",
        });
        return;
      }
      setSelected((current) => {
        const next = new Set(current);
        for (const id of result.promotedIds) next.delete(id);
        return next;
      });
      notify({
        title: `Added ${result.created.length} ${result.created.length === 1 ? "mod" : "mods"} to the collection`,
        description: result.skipped.length
          ? `${result.skipped.length} stayed in the inbox because the collection already has them.`
          : "Planned, with details still unknown. They are not in any batch yet.",
      });
    }
    setPromoting(null);
  };

  return (
    <div className="inbox-panel">
      <div className="manage-section-head">
        <div>
          <h2>Mod inbox</h2>
          <p>
            Names to look into later. They are not part of the collection until
            you add them.
          </p>
        </div>
        <Button onClick={onQuickAdd}>
          <ListPlus size={17} /> Quick add to inbox
        </Button>
      </div>

      {entries.length > 0 && (
        <label className="search-field inbox-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">Search the inbox</span>
          <input
            value={query}
            placeholder="Search names and notes..."
            onChange={(event) => setQuery(event.target.value)}
          />
          {query && (
            <button
              type="button"
              className="search-clear"
              aria-label="Clear search"
              onClick={() => setQuery("")}
            >
              <X size={15} />
            </button>
          )}
        </label>
      )}

      {selection.size > 0 && (
        <div className="bulk-bar" role="region" aria-label="Inbox actions">
          <span role="status">
            <strong>{selection.size}</strong> selected
          </span>
          <div className="bulk-bar-actions">
            <Button
              variant="ghost"
              size="small"
              onClick={() => setSelected(new Set())}
            >
              Clear selection
            </Button>
            <Button
              variant="danger"
              size="small"
              onClick={() => setDeleting([...selection])}
            >
              <Trash2 size={15} /> Delete
            </Button>
            <Button size="small" onClick={() => setPromoting([...selection])}>
              <PackagePlus size={15} /> Add to collection
            </Button>
          </div>
        </div>
      )}

      {entries.length === 0 ? (
        <div className="empty-state">
          <div className="empty-icon">
            <Inbox size={24} />
          </div>
          <h3>The inbox is empty</h3>
          <p>Paste mod names here to sort through later.</p>
          <Button onClick={onQuickAdd}>
            <ListPlus size={17} /> Quick add to inbox
          </Button>
        </div>
      ) : shown.length === 0 ? (
        <p className="mr-hint">No inbox entries match “{query}”.</p>
      ) : (
        <ul className="inbox-list">
          {shown.map((entry) => (
            <InboxRow
              key={entry.id}
              entry={entry}
              selected={selection.has(entry.id)}
              inCollection={collectionMatch(entry, data.mods)?.name}
              repeated={repeats.has(entry.id)}
              onToggle={() => toggle(entry.id)}
              onChange={replace}
              onDelete={() => setDeleting([entry.id])}
            />
          ))}
        </ul>
      )}

      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${shownDeleting?.length ?? 0} inbox ${shownDeleting?.length === 1 ? "entry" : "entries"}?`}
        description="This only removes them from the inbox. The mod collection is not changed."
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) {
                const removed = new Set(deleting);
                updateInbox(entries.filter((entry) => !removed.has(entry.id)));
                notify({
                  kind: "info",
                  title: `Removed ${deleting.length} from the inbox`,
                  description: "The mod collection was not changed.",
                });
              }
              setDeleting(null);
            }}
          >
            <Trash2 size={16} /> Delete
          </Button>
        </div>
      </Dialog>

      <Dialog
        open={promoting !== null}
        onOpenChange={(open) => !open && setPromoting(null)}
        title="Add to the collection?"
        description="Each name becomes a Planned mod with unknown details. Nothing is fetched, and no batch is assigned."
        size="wide"
      >
        {plan && (
          <div className="quick-add">
            <div className="form-field">
              <span id={categoryId}>Category for the new mods</span>
              <Select
                aria-labelledby={categoryId}
                value={category}
                onValueChange={setCategory}
                options={categories.map((value) => ({ value, label: value }))}
              />
            </div>
            <div className="quick-add-preview">
              <span className="mr-hint" role="status">
                {plan.created.length} to add
                {plan.skipped.length
                  ? ` · ${plan.skipped.length} already in the collection (they stay in the inbox)`
                  : ""}
              </span>
              <ul>
                {plan.created.map((mod) => (
                  <li key={mod.id}>
                    <span>{mod.name}</span>
                  </li>
                ))}
                {plan.skipped.map(({ entry, existingName }) => (
                  <li key={entry.id} className="quick-add-skip">
                    <span>{entry.name}</span>
                    <span className="mr-chip mr-chip-warn">
                      Already in the collection as “{existingName}”
                    </span>
                  </li>
                ))}
              </ul>
            </div>
            <div className="dialog-actions">
              <Button variant="ghost" onClick={() => setPromoting(null)}>
                Cancel
              </Button>
              <Button
                disabled={!plan.created.length}
                onClick={confirmPromotion}
              >
                <PackagePlus size={16} /> Add {plan.created.length} to
                collection
              </Button>
            </div>
          </div>
        )}
      </Dialog>
    </div>
  );
}
