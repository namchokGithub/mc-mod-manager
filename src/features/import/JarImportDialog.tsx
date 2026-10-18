import { useMemo, useRef, useState } from "react";
import {
  CircleAlert,
  FileArchive,
  FolderOpen,
  Info,
  LoaderCircle,
  RotateCcw,
  ShieldCheck,
  Upload,
} from "lucide-react";
import { Button } from "../../components/ui/button";
import {
  candidateToMod,
  findBatchDuplicates,
  findPackDuplicate,
  sha1Hex,
  type ImportCandidate,
  mergeCandidateIntoMod,
} from "../../lib/jar/importing";
import { describeChanges } from "../../lib/modChanges";
import { parseJar, type JarLoader } from "../../lib/jar/metadata";
import { modrinth, ModrinthError } from "../../lib/modrinth/api";
import { loaderLabels, normalizeLoader } from "../../lib/modrinth/mapping";
import { matchFilesByHash } from "../../lib/modrinth/service";
import { modSchema, type Mod, type Modpack } from "../../lib/schema";
import {
  applyDependencyLinks,
  suggestDependencyLinks,
} from "../../lib/dependencyLinks";

const MAX_FILES = 500;

const formatLabels: Record<string, string> = {
  "fabric.mod.json": "fabric.mod.json",
  "quilt.mod.json": "quilt.mod.json",
  "neoforge.mods.toml": "neoforge.mods.toml",
  "mods.toml": "mods.toml",
  filename: "File name only",
};

const supportsFolders =
  typeof document !== "undefined" &&
  "webkitdirectory" in document.createElement("input");

type Row = ImportCandidate & { file: File };

export function JarImportDialog({
  mods,
  modpack,
  onImport,
  onCancel,
}: {
  mods: Mod[];
  modpack: Modpack;
  /** `updated` holds existing mods (same IDs) to replace with merged JAR metadata. */
  onImport: (created: Mod[], updated: Mod[]) => boolean;
  onCancel: () => void;
}) {
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  // Rows that update the mod they match instead of being added as new mods.
  const [updates, setUpdates] = useState<Set<string>>(new Set());
  const [progress, setProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  const [matching, setMatching] = useState<"hashing" | "matching" | null>(null);
  const [matchError, setMatchError] = useState("");
  const [skipped, setSkipped] = useState(0);
  const [overLimit, setOverLimit] = useState(0);
  const [dragging, setDragging] = useState(false);
  // Suggested dependency links the user unticked, as "<mod id>:<dependency id>".
  const [declined, setDeclined] = useState<Set<string>>(new Set());
  const packLoader = normalizeLoader(modpack.modloader);

  const duplicates = useMemo(() => {
    const batch = findBatchDuplicates(rows);
    return new Map(
      rows.map((row) => [
        row.key,
        findPackDuplicate(row, mods) ?? batch.get(row.key) ?? null,
      ]),
    );
  }, [rows, mods]);

  const readFiles = async (list: FileList | File[]) => {
    const all = Array.from(list);
    const allJars = all.filter((file) => /\.jar$/i.test(file.name));
    const jars = allJars.slice(0, MAX_FILES);
    setSkipped(all.length - allJars.length);
    setOverLimit(allJars.length - jars.length);
    if (!jars.length) return;
    setProgress({ done: 0, total: jars.length });
    const parsed: Row[] = [];
    for (const [index, file] of jars.entries()) {
      const path = file.webkitRelativePath || file.name;
      const metadata = await parseJar(
        file,
        path,
        packLoader as JarLoader | null,
      );
      parsed.push({ key: `${index}:${path}:${file.size}`, file, metadata });
      setProgress({ done: index + 1, total: jars.length });
    }
    const nextSelected = new Set<string>();
    const batch = findBatchDuplicates(parsed);
    for (const row of parsed)
      if (
        row.metadata.readable &&
        !findPackDuplicate(row, mods) &&
        !batch.has(row.key)
      )
        nextSelected.add(row.key);
    setRows(parsed);
    setSelected(nextSelected);
    setProgress(null);
    setMatchError("");
  };

  const matchOnModrinth = async () => {
    setMatchError("");
    setMatching("hashing");
    try {
      const hashed: Row[] = [];
      for (const row of rows)
        hashed.push(row.sha1 ? row : { ...row, sha1: await sha1Hex(row.file) });
      setRows(hashed);
      setMatching("matching");
      const matches = await matchFilesByHash(
        modrinth,
        hashed.flatMap((row) => (row.sha1 ? [row.sha1] : [])),
      );
      const matched = hashed.map((row) => ({
        ...row,
        match: (row.sha1 && matches.get(row.sha1)) || null,
      }));
      setRows(matched);
      // Newly found duplicates (same Modrinth project) are deselected; nothing else changes.
      const batch = findBatchDuplicates(matched);
      setSelected(
        (current) =>
          new Set(
            [...current].filter((key) => {
              const row = matched.find((item) => item.key === key);
              return row && !findPackDuplicate(row, mods) && !batch.has(key);
            }),
          ),
      );
    } catch (error) {
      setMatchError(
        error instanceof ModrinthError
          ? error.message
          : "Could not match files on Modrinth.",
      );
    } finally {
      setMatching(null);
    }
  };

  const toggle = (key: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    // Adding as new and updating an existing mod are exclusive.
    setUpdates((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  const updateTarget = (row: Row) => {
    const modId = duplicates.get(row.key)?.modId;
    return modId ? mods.find((mod) => mod.id === modId) : undefined;
  };
  const toggleUpdate = (key: string) => {
    setUpdates((current) => {
      const next = new Set(current);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
    setSelected((current) => {
      const next = new Set(current);
      next.delete(key);
      return next;
    });
  };

  // The mods this import would create or update, before any dependency links.
  const planImport = (syncedAt?: string) => {
    const created: Mod[] = [];
    const updated: Mod[] = [];
    for (const row of rows) {
      const target = updates.has(row.key) ? updateTarget(row) : undefined;
      if (target) {
        const parsed = modSchema.safeParse(
          mergeCandidateIntoMod(target, row, syncedAt),
        );
        if (parsed.success) updated.push(parsed.data);
        continue;
      }
      if (!selected.has(row.key)) continue;
      const mod = candidateToMod(row, [...mods, ...created], syncedAt);
      const parsed = modSchema.safeParse(mod);
      if (parsed.success) created.push(parsed.data);
    }
    return { created, updated };
  };
  /**
   * Dependencies whose IDs differ from the mod that provides them in the list (existing mods or
   * this import). Only exact single matches are offered; they are linked unless unticked.
   */
  const linkSuggestions = (plan: { created: Mod[]; updated: Mod[] }) => {
    const byId = new Map(plan.updated.map((mod) => [mod.id, mod]));
    const all = [
      ...mods.map((mod) => byId.get(mod.id) ?? mod),
      ...plan.created,
    ];
    return [...plan.created, ...plan.updated].flatMap((mod) =>
      suggestDependencyLinks(mod, all).map((suggestion) => ({
        ...suggestion,
        mod,
        key: `${mod.id}:${suggestion.dependency.id}`,
      })),
    );
  };
  const suggestions = rows.length ? linkSuggestions(planImport()) : [];

  const confirm = () => {
    const plan = planImport(new Date().toISOString());
    const accepted = linkSuggestions(plan).filter(
      (suggestion) => !declined.has(suggestion.key),
    );
    const withLinks = (mod: Mod) =>
      applyDependencyLinks(
        mod,
        accepted
          .filter((suggestion) => suggestion.mod.id === mod.id)
          .map((suggestion) => ({
            id: suggestion.dependency.id,
            modId: suggestion.provider.id,
          })),
      );
    const created = plan.created.map(withLinks);
    const updated = plan.updated.map(withLinks);
    if ((created.length || updated.length) && onImport(created, updated))
      onCancel();
  };

  if (progress)
    return (
      <div className="jar-progress" role="status">
        <LoaderCircle className="spin" size={22} aria-hidden="true" />
        <p>
          Reading {progress.done} of {progress.total} files…
        </p>
        <div className="jar-progress-bar" aria-hidden="true">
          <span
            style={{ width: `${(progress.done / progress.total) * 100}%` }}
          />
        </div>
      </div>
    );

  const pickers = (
    <>
      <input
        ref={fileInput}
        className="sr-only"
        type="file"
        accept=".jar,application/java-archive"
        multiple
        tabIndex={-1}
        onChange={(event) => {
          if (event.currentTarget.files)
            void readFiles(event.currentTarget.files);
          event.currentTarget.value = "";
        }}
      />
      {supportsFolders && (
        <input
          ref={folderInput}
          className="sr-only"
          type="file"
          multiple
          tabIndex={-1}
          {...({ webkitdirectory: "" } as Record<string, string>)}
          onChange={(event) => {
            if (event.currentTarget.files)
              void readFiles(event.currentTarget.files);
            event.currentTarget.value = "";
          }}
        />
      )}
    </>
  );

  if (!rows.length)
    return (
      <div className="jar-import">
        {pickers}
        <div
          className={dragging ? "jar-drop dragging" : "jar-drop"}
          onDragOver={(event) => {
            event.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setDragging(false);
            void readFiles(event.dataTransfer.files);
          }}
        >
          <div className="empty-icon">
            <FileArchive size={24} />
          </div>
          <h3>Drop .jar files here</h3>
          <p>or choose them from your computer.</p>
          <div className="jar-drop-actions">
            <Button onClick={() => fileInput.current?.click()}>
              <Upload size={16} /> Choose .jar files
            </Button>
            {supportsFolders && (
              <Button
                variant="secondary"
                onClick={() => folderInput.current?.click()}
              >
                <FolderOpen size={16} /> Choose a mods folder
              </Button>
            )}
          </div>
        </div>
        {skipped > 0 && (
          <p className="mr-hint">
            {skipped} {skipped === 1 ? "file was" : "files were"} skipped
            because
            {skipped === 1 ? " it is" : " they are"} not .jar files.
          </p>
        )}
        <div className="data-note">
          <ShieldCheck size={18} aria-hidden="true" />
          <p>
            Files are read only in this browser to find their metadata. They are
            never run, uploaded, or stored.
          </p>
        </div>
        <div className="dialog-actions">
          <Button variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    );

  const selectable = rows.filter((row) => !duplicates.get(row.key));
  const matchedCount = rows.filter((row) => row.match).length;
  const lookedUp = rows.some((row) => row.match !== undefined);

  return (
    <div className="jar-import">
      {pickers}
      <div className="jar-toolbar">
        <span className="mr-hint">
          {rows.length} {rows.length === 1 ? "file" : "files"} read ·{" "}
          {selected.size} selected
          {lookedUp ? ` · ${matchedCount} matched on Modrinth` : ""}
          {skipped > 0 ? ` · ${skipped} non-JAR skipped` : ""}
        </span>
        <div className="jar-toolbar-actions">
          <Button
            variant="ghost"
            size="small"
            onClick={() =>
              setSelected(new Set(selectable.map((row) => row.key)))
            }
          >
            Select all
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => setSelected(new Set())}
          >
            Select none
          </Button>
          <Button
            variant="ghost"
            size="small"
            onClick={() => {
              setRows([]);
              setSelected(new Set());
            }}
          >
            <RotateCcw size={14} /> Start over
          </Button>
        </div>
      </div>
      <div className="jar-match">
        <div>
          <strong>Match on Modrinth</strong>
          <p>
            Identifies files exactly and adds verified version data for
            compatibility and update checks. Only SHA-1 hashes are sent, never
            the files.
          </p>
        </div>
        <Button
          variant="secondary"
          size="small"
          disabled={matching !== null}
          onClick={() => void matchOnModrinth()}
        >
          {matching ? (
            <LoaderCircle className="spin" size={15} aria-hidden="true" />
          ) : (
            <ShieldCheck size={15} aria-hidden="true" />
          )}
          {matching === "hashing"
            ? "Hashing files…"
            : matching === "matching"
              ? "Matching…"
              : lookedUp
                ? "Match again"
                : "Match files"}
        </Button>
      </div>
      {overLimit > 0 && (
        <div className="inline-message error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>
            Only the first {MAX_FILES} JAR files were read; {overLimit} more
            were left out. Import the rest in another batch.
          </span>
        </div>
      )}
      {matchError && (
        <div className="inline-message error" role="alert">
          <CircleAlert size={16} aria-hidden="true" />
          <span>{matchError} Local metadata is still available.</span>
        </div>
      )}
      <ul className="jar-list" aria-label="Files to import">
        {rows.map((row) => {
          const { metadata, match } = row;
          const duplicate = duplicates.get(row.key);
          const loaderMismatch =
            packLoader &&
            metadata.loaders.length > 0 &&
            !metadata.loaders.includes(packLoader);
          const title =
            match?.project.title ??
            metadata.name ??
            metadata.modId ??
            metadata.fileName;
          return (
            <li
              key={row.key}
              className={selected.has(row.key) ? "jar-row selected" : "jar-row"}
            >
              <label className="jar-row-main">
                <input
                  type="checkbox"
                  checked={selected.has(row.key)}
                  onChange={() => toggle(row.key)}
                />
                <span className="jar-row-body">
                  <span className="jar-row-title">
                    <strong>{title}</strong>
                    {(match?.version.versionNumber ?? metadata.version) && (
                      <span className="jar-version">
                        {match?.version.versionNumber ?? metadata.version}
                      </span>
                    )}
                  </span>
                  <span className="jar-row-meta">
                    {metadata.fileName.replace(/^.*[\\/]/, "")}
                    {metadata.modId ? ` · ID ${metadata.modId}` : ""}
                    {metadata.loaders.length
                      ? ` · ${metadata.loaders
                          .map((loader) => loaderLabels[loader])
                          .join(", ")}`
                      : ""}
                  </span>
                  <span className="jar-chips">
                    <span
                      className={
                        metadata.format === "filename"
                          ? "mr-chip mr-chip-warn"
                          : "mr-chip mr-chip-muted"
                      }
                    >
                      {formatLabels[metadata.format]}
                    </span>
                    {match && (
                      <span className="mr-chip">Verified on Modrinth</span>
                    )}
                    {match === null && (
                      <span className="mr-chip mr-chip-muted">
                        No Modrinth match
                      </span>
                    )}
                    {metadata.dependencies.some(
                      (dependency) => dependency.kind === "required",
                    ) && (
                      <span className="mr-chip mr-chip-muted">
                        Requires{" "}
                        {metadata.dependencies
                          .filter(
                            (dependency) => dependency.kind === "required",
                          )
                          .map((dependency) => dependency.modId)
                          .slice(0, 3)
                          .join(", ")}
                      </span>
                    )}
                  </span>
                  {duplicate && (
                    <span className="jar-warning jar-duplicate">
                      <CircleAlert size={13} aria-hidden="true" />
                      {duplicate.reason} as “{duplicate.modName}”.
                    </span>
                  )}
                  {loaderMismatch && (
                    <span className="jar-warning">
                      <Info size={13} aria-hidden="true" />
                      Metadata lists{" "}
                      {metadata.loaders
                        .map((loader) => loaderLabels[loader])
                        .join(", ")}
                      ; the pack uses {loaderLabels[packLoader]}.
                    </span>
                  )}
                  {metadata.minecraftRange && (
                    <span className="jar-note">
                      Declares Minecraft {metadata.minecraftRange} (not
                      checked).
                    </span>
                  )}
                  {metadata.warnings.map((warning) => (
                    <span key={warning} className="jar-note">
                      {warning}
                    </span>
                  ))}
                </span>
              </label>
              {(() => {
                const target = updateTarget(row);
                if (!target) return null;
                const changes = describeChanges(
                  target,
                  mergeCandidateIntoMod(target, row),
                );
                return (
                  <div className="jar-update">
                    <label className="mr-check">
                      <input
                        type="checkbox"
                        checked={updates.has(row.key)}
                        onChange={() => toggleUpdate(row.key)}
                      />
                      Update “{target.name}” with this file instead (keeps its
                      ID, batches, notes, and status)
                    </label>
                    {updates.has(row.key) && (
                      <ul className="jar-update-changes">
                        {changes.length ? (
                          changes.map((change) => (
                            <li key={change.field}>
                              <strong>{change.label}</strong>:{" "}
                              {change.overwrites
                                ? `replaces “${change.from}” with “${change.to}”`
                                : `fills in “${change.to}”`}
                            </li>
                          ))
                        ) : (
                          <li>Nothing new to add.</li>
                        )}
                      </ul>
                    )}
                  </div>
                );
              })()}
            </li>
          );
        })}
      </ul>
      {suggestions.length > 0 && (
        <section className="jar-links" aria-labelledby="jar-links-title">
          <h4 id="jar-links-title">Dependencies already in your list</h4>
          <p className="mr-hint">
            Their IDs differ from the mod that provides them, so they are linked
            only while ticked. Untick any that are wrong.
          </p>
          <ul>
            {suggestions.map((suggestion) => (
              <li key={suggestion.key}>
                <label className="mr-check">
                  <input
                    type="checkbox"
                    checked={!declined.has(suggestion.key)}
                    onChange={() =>
                      setDeclined((current) => {
                        const next = new Set(current);
                        if (next.has(suggestion.key))
                          next.delete(suggestion.key);
                        else next.add(suggestion.key);
                        return next;
                      })
                    }
                  />
                  <span>
                    {suggestion.mod.name} needs{" "}
                    <code>{suggestion.dependency.id}</code> →{" "}
                    <strong>{suggestion.provider.name}</strong>
                    {suggestion.ignored && " (now marked not needed)"}
                  </span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="dialog-actions dialog-actions-sticky">
        <Button variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button
          disabled={(!selected.size && !updates.size) || matching !== null}
          onClick={confirm}
        >
          <Upload size={16} />
          {updates.size
            ? `Import ${selected.size}, update ${updates.size}`
            : `Import ${selected.size} ${selected.size === 1 ? "mod" : "mods"}`}
        </Button>
      </div>
    </div>
  );
}
