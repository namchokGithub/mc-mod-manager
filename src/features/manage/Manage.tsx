import { cloneElement, useId, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  CircleAlert,
  Copy,
  FileJson2,
  Info,
  LoaderCircle,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Trash2,
  Upload,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { useToast } from "../../app/ToastContext";
import { CompatBadge } from "../../components/CompatBadge";
import { ModArtwork } from "../../components/ModArtwork";
import { ModFilters } from "../../components/ModFilters";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import {
  checkCompatibility,
  findByProject,
  type LiveFacts,
} from "../../lib/compatibility";
import { modrinth, ModrinthError } from "../../lib/modrinth/api";
import {
  checkUpdates,
  fetchLiveVersionFacts,
} from "../../lib/modrinth/service";
import { normalizeLoader } from "../../lib/modrinth/mapping";
import { type UpdateResult } from "../../lib/updates";
import { JarImportDialog } from "../import/JarImportDialog";
import { filterMods, uniqueId, type Filters } from "../../lib/mods";
import {
  modSchema,
  modsSchema,
  modpackSchema,
  parseJsonFile,
  type Mod,
  type Modpack,
} from "../../lib/schema";
import { downloadJson } from "../../lib/storage";
import { useRetained } from "../../lib/useRetained";
import { ModrinthPicker, type PickerTarget } from "../modrinth/ModrinthPicker";
import { CompatibilityPanel } from "./CompatibilityPanel";
import { UpdateBadge } from "./UpdateBadge";

type Tab = "mods" | "settings" | "data";
const initialFilters: Filters = {
  query: "",
  category: "",
  status: "",
  side: "",
  sort: "az",
};

const formSchema = modSchema
  .omit({ tags: true, dependencies: true, id: true })
  .extend({
    id: z.string(),
    tagsText: z.string(),
    dependenciesText: z.string(),
  });
type ModFields = z.infer<typeof formSchema>;

function Field({
  label,
  error,
  children,
  hint,
  required = false,
  wide = false,
}: {
  label: string;
  error?: string;
  children: React.ReactElement<React.AriaAttributes>;
  hint?: string;
  required?: boolean;
  wide?: boolean;
}) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  return (
    <label
      className={`form-field${wide ? " form-field-wide" : ""}${error ? " has-error" : ""}`}
    >
      <span>
        {label}
        {required && (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        )}
      </span>
      {cloneElement(children, {
        "aria-invalid": error ? true : undefined,
        "aria-required": required || undefined,
        "aria-describedby":
          [hintId, errorId].filter(Boolean).join(" ") || undefined,
      })}
      {hint && <small id={hintId}>{hint}</small>}
      {error && (
        <small id={errorId} className="field-error" role="alert">
          <CircleAlert size={12} aria-hidden="true" /> {error}
        </small>
      )}
    </label>
  );
}

function ModEditor({
  mod,
  initialValues,
  mods,
  onSave,
  onClose,
}: {
  mod: Mod | null;
  initialValues?: Mod;
  mods: Mod[];
  onSave: (mod: Mod, originalId?: string) => boolean;
  onClose: () => void;
}) {
  const start = initialValues ?? mod;
  const initial: ModFields = start
    ? {
        ...start,
        tagsText: start.tags.join(", "),
        dependenciesText: start.dependencies.join(", "),
      }
    : {
        id: "",
        name: "",
        version: "",
        category: "",
        tagsText: "",
        status: "planned",
        side: "both",
        source: "Modrinth",
        sourceUrl: "",
        description: "",
        dependenciesText: "",
        notes: "",
        imageUrl: "",
      };
  const {
    register,
    handleSubmit,
    control,
    setError,
    formState: { errors, isDirty },
  } = useForm<ModFields>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });
  const notify = useToast();
  const name = useWatch({ control, name: "name" });
  const id = useWatch({ control, name: "id" });
  const linked = useWatch({ control, name: "modrinth" });
  const submit = (values: ModFields) => {
    const candidate: Mod = {
      ...values,
      id:
        values.id.trim() ||
        uniqueId(
          values.name,
          mods.filter((item) => item.id !== mod?.id),
        ),
      tags: values.tagsText
        .split(",")
        .map((tag) => tag.trim())
        .filter(Boolean),
      dependencies: values.dependenciesText
        .split(",")
        .map((dep) => dep.trim())
        .filter(Boolean),
    };
    const validation = modSchema.safeParse(candidate);
    if (!validation.success) {
      notify({
        kind: "error",
        title: "Mod not saved",
        description:
          validation.error.issues[0]?.message ??
          "Check the highlighted fields.",
      });
      return;
    }
    if (mods.some((item) => item.id === candidate.id && item.id !== mod?.id)) {
      setError("id", { message: "This ID is already used by another mod." });
      return;
    }
    const sameProject = candidate.modrinth
      ? findByProject(mods, candidate.modrinth.projectId, mod?.id)
      : undefined;
    if (sameProject) {
      notify({
        kind: "error",
        title: "Mod not saved",
        description: `This Modrinth project is already in the pack as “${sameProject.name}”.`,
      });
      return;
    }
    if (onSave(validation.data, mod?.id)) onClose();
  };
  return (
    <form className="editor-form" noValidate onSubmit={handleSubmit(submit)}>
      {linked && (
        <div className="data-note mr-linked">
          <Info size={18} aria-hidden="true" />
          <p>
            Linked to Modrinth
            {linked.slug ? ` (${linked.slug})` : ""}
            {linked.versionNumber
              ? `, version ${linked.versionNumber}.`
              : ", but no version is selected."}{" "}
            Compatibility uses that version’s metadata. Use “Update from
            Modrinth” in the mod list to change it.
          </p>
        </div>
      )}
      <div className="form-grid">
        <Field label="Mod name" required error={errors.name?.message}>
          <input autoFocus placeholder="e.g. Sodium" {...register("name")} />
        </Field>
        <Field
          label="ID"
          error={errors.id?.message}
          hint={
            !id && name
              ? `Will use ${uniqueId(
                  name,
                  mods.filter((item) => item.id !== mod?.id),
                )}`
              : "Stable unique identifier"
          }
        >
          <input placeholder="Auto-generated if empty" {...register("id")} />
        </Field>
        <Field label="Version" error={errors.version?.message}>
          <input placeholder="Optional" {...register("version")} />
        </Field>
        <Field label="Category" required error={errors.category?.message}>
          <input placeholder="e.g. Performance" {...register("category")} />
        </Field>
        <Field label="Status" error={errors.status?.message}>
          <select {...register("status")}>
            {["planned", "testing", "installed", "disabled", "removed"].map(
              (value) => (
                <option key={value} value={value}>
                  {value.charAt(0).toUpperCase() + value.slice(1)}
                </option>
              ),
            )}
          </select>
        </Field>
        <Field label="Installation side" error={errors.side?.message}>
          <select {...register("side")}>
            <option value="both">Both</option>
            <option value="client">Client</option>
            <option value="server">Server</option>
          </select>
        </Field>
        <Field label="Source" error={errors.source?.message}>
          <select {...register("source")}>
            {["Modrinth", "CurseForge", "GitHub", "Other"].map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Source URL" error={errors.sourceUrl?.message}>
          <input
            type="url"
            placeholder="https://…"
            {...register("sourceUrl")}
          />
        </Field>
        <Field
          label="Tags"
          error={errors.tagsText?.message}
          hint="Separate tags with commas"
        >
          <input placeholder="Rendering, Client" {...register("tagsText")} />
        </Field>
        <Field label="Image URL" error={errors.imageUrl?.message}>
          <input type="url" placeholder="https://…" {...register("imageUrl")} />
        </Field>
        <Field label="Description" wide error={errors.description?.message}>
          <textarea
            rows={3}
            placeholder="What does this mod add?"
            {...register("description")}
          />
        </Field>
        <Field
          label="Dependencies"
          error={errors.dependenciesText?.message}
          hint="Comma-separated mod IDs or names"
        >
          <input
            placeholder="fabric-api, lithium"
            {...register("dependenciesText")}
          />
        </Field>
        <Field label="Notes" wide error={errors.notes?.message}>
          <textarea
            rows={3}
            placeholder="Compatibility, setup, or testing notes"
            {...register("notes")}
          />
        </Field>
      </div>
      <div className="dialog-actions dialog-actions-sticky">
        <UnsavedHint show={isDirty} />
        <Button type="button" variant="ghost" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit">
          {mod ? "Save changes" : "Add mod"} <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}

function UnsavedHint({ show }: { show: boolean }) {
  return (
    <AnimatePresence>
      {show && (
        <motion.span
          className="unsaved-hint"
          initial={{ opacity: 0, x: 6 }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.16 }}
        >
          <span className="draft-dot" aria-hidden="true" /> Unsaved changes
        </motion.span>
      )}
    </AnimatePresence>
  );
}

function SettingsForm({
  modpack,
  onSave,
}: {
  modpack: Modpack;
  onSave: (modpack: Modpack) => void;
}) {
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<Modpack>({
    resolver: zodResolver(modpackSchema),
    defaultValues: modpack,
  });
  return (
    <form className="settings-form" noValidate onSubmit={handleSubmit(onSave)}>
      <div className="settings-intro">
        <h2>Modpack settings</h2>
        <p>The details that introduce your collection on the Preview page.</p>
      </div>
      <div className="form-grid">
        <Field label="Modpack name" required error={errors.name?.message}>
          <input {...register("name")} />
        </Field>
        <Field label="Pack version" error={errors.version?.message}>
          <input {...register("version")} />
        </Field>
        <Field
          label="Minecraft version"
          error={errors.minecraftVersion?.message}
        >
          <input {...register("minecraftVersion")} />
        </Field>
        <Field label="Modloader" error={errors.modloader?.message}>
          <input
            placeholder="Fabric, Forge, NeoForge…"
            {...register("modloader")}
          />
        </Field>
        <Field
          label="Modloader version"
          error={errors.modloaderVersion?.message}
        >
          <input placeholder="Optional" {...register("modloaderVersion")} />
        </Field>
        <Field label="Author" error={errors.author?.message}>
          <input {...register("author")} />
        </Field>
        <Field
          label="Hero image URL or path"
          error={errors.heroImageUrl?.message}
          hint="Use https://… or public/assets/…; leave empty for the built-in hero"
        >
          <input
            type="text"
            placeholder="https://… or public/assets/theme/image.png"
            {...register("heroImageUrl")}
          />
        </Field>
        <Field label="Last updated" error={errors.updatedAt?.message}>
          <input type="date" {...register("updatedAt")} />
        </Field>
        <Field label="Description" wide error={errors.description?.message}>
          <textarea rows={5} {...register("description")} />
        </Field>
      </div>
      <div className="settings-actions">
        <UnsavedHint show={isDirty} />
        <Button
          type="button"
          variant="ghost"
          disabled={!isDirty}
          onClick={() => reset()}
        >
          Discard
        </Button>
        <Button type="submit" disabled={!isDirty}>
          Save settings <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}

function DataTools() {
  const { data, dirty, importModpack, importMods, reset } = useCollection();
  const notify = useToast();
  const [importError, setImportError] = useState("");
  const [importing, setImporting] = useState<"modpack" | "mods" | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const modpackFileRef = useRef<HTMLInputElement>(null);
  const modsFileRef = useRef<HTMLInputElement>(null);
  const onImport = async (kind: "modpack" | "mods", file?: File) => {
    if (!file) return;
    setImporting(kind);
    try {
      const parsed = parseJsonFile(await file.text(), kind);
      if (kind === "modpack") importModpack(parsed as Modpack);
      else importMods(parsed as Mod[]);
      setImportError("");
      notify({
        title: `${file.name} imported`,
        description: "The data is now in your local draft.",
      });
    } catch (error) {
      setImportError(
        `${file.name}: ${error instanceof Error ? error.message : "Import failed."}`,
      );
      notify({
        kind: "error",
        title: "Import failed",
        description: "Your current data was not changed.",
      });
    } finally {
      setImporting(null);
    }
  };
  const onExport = (filename: string, value: unknown) => {
    downloadJson(filename, value);
    notify({
      kind: "info",
      title: `${filename} exported`,
      description: "Replace the file in public/data/ and commit it to publish.",
    });
  };
  return (
    <div className="data-tools">
      <div className="settings-intro">
        <h2>Data & export</h2>
        <p>Manage your local draft and prepare files for publishing.</p>
      </div>
      <div className="data-note">
        <Info size={18} />
        <p>
          Changes are saved only in this browser. Export both JSON files and
          commit them to the repository to update the published site.
        </p>
      </div>
      <AnimatePresence initial={false}>
        {importError && (
          <motion.div
            className="inline-message error"
            role="alert"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
          >
            <CircleAlert size={16} aria-hidden="true" />
            <span>
              <strong>Import failed.</strong> {importError}
            </span>
          </motion.div>
        )}
      </AnimatePresence>
      <div className="data-card-grid">
        <div className="data-card">
          <div className="data-card-icon">
            <FileJson2 size={22} />
          </div>
          <h3>Modpack settings</h3>
          <p>Name, description, versions, author, and hero image.</p>
          <div className="data-card-actions">
            <Button
              variant="secondary"
              size="small"
              disabled={importing !== null}
              onClick={() => modpackFileRef.current?.click()}
            >
              {importing === "modpack" ? (
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
              ) : (
                <ArrowUpFromLine size={15} />
              )}
              {importing === "modpack" ? "Importing…" : "Import"}
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => onExport("modpack.json", data.modpack)}
            >
              <ArrowDownToLine size={15} /> Export
            </Button>
          </div>
          <input
            ref={modpackFileRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void onImport("modpack", event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
        <div className="data-card">
          <div className="data-card-icon">
            <FileJson2 size={22} />
          </div>
          <h3>Mod collection</h3>
          <p>All mod entries, notes, statuses, and dependencies.</p>
          <div className="data-card-actions">
            <Button
              variant="secondary"
              size="small"
              disabled={importing !== null}
              onClick={() => modsFileRef.current?.click()}
            >
              {importing === "mods" ? (
                <LoaderCircle className="spin" size={15} aria-hidden="true" />
              ) : (
                <ArrowUpFromLine size={15} />
              )}
              {importing === "mods" ? "Importing…" : "Import"}
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => onExport("mods.json", data.mods)}
            >
              <ArrowDownToLine size={15} /> Export
            </Button>
          </div>
          <input
            ref={modsFileRef}
            className="sr-only"
            type="file"
            accept=".json,application/json"
            onChange={(event) => {
              void onImport("mods", event.currentTarget.files?.[0]);
              event.currentTarget.value = "";
            }}
          />
        </div>
      </div>
      <div className="danger-zone">
        <div>
          <h3>Reset to published data</h3>
          <p>
            Discard this browser’s draft and reload the currently published JSON
            files.
          </p>
        </div>
        <Button
          variant="danger"
          disabled={!dirty}
          title={dirty ? undefined : "No local draft to discard"}
          onClick={() => setConfirmReset(true)}
        >
          <RotateCcw size={16} /> Reset draft
        </Button>
      </div>
      <Dialog
        open={confirmReset}
        onOpenChange={setConfirmReset}
        title="Discard your local draft?"
        description="This will replace your edits with the currently published data. Export first if you want to keep them."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setConfirmReset(false)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              reset();
              setConfirmReset(false);
              setImportError("");
              notify({
                title: "Draft discarded",
                description: "You are viewing the published data again.",
              });
            }}
          >
            Discard draft
          </Button>
        </div>
      </Dialog>
    </div>
  );
}

export function Manage() {
  const {
    data,
    dirty,
    saveState,
    saveMod,
    deleteMod,
    updateModpack,
    importMods,
  } = useCollection();
  const notify = useToast();
  const [importingJars, setImportingJars] = useState(false);
  const [updates, setUpdates] = useState<{
    results: Map<string, UpdateResult>;
    at: Date;
  } | null>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("mods");
  const [filters, setFilters] = useState(initialFilters);
  const [editing, setEditing] = useState<{
    mod: Mod | null;
    initial?: Mod;
  } | null>(null);
  const [deleting, setDeleting] = useState<Mod | null>(null);
  const [picking, setPicking] = useState<PickerTarget | null>(null);
  const [live, setLive] = useState<{ facts: LiveFacts; at: Date } | null>(null);
  const [checking, setChecking] = useState(false);
  const shownEditing = useRetained(editing);
  const shownDeleting = useRetained(deleting);
  const shownPicking = useRetained(picking);
  const compat = useMemo(
    () => checkCompatibility(data.mods, data.modpack, live?.facts),
    [data.mods, data.modpack, live],
  );
  const runCheck = async () => {
    setChecking(true);
    try {
      const facts = await fetchLiveVersionFacts(modrinth, data.mods);
      setLive({ facts, at: new Date() });
      notify({
        kind: "info",
        title: "Compatibility checked",
        description: facts.size
          ? `Fetched current metadata for ${facts.size} linked ${facts.size === 1 ? "version" : "versions"}.`
          : "No mods are linked to a Modrinth version yet.",
      });
    } catch (error) {
      notify({
        kind: "error",
        title: "Compatibility check failed",
        description:
          error instanceof ModrinthError
            ? error.message
            : "Could not reach Modrinth. Saved metadata is still shown.",
      });
    } finally {
      setChecking(false);
    }
  };
  const runUpdateCheck = async () => {
    setCheckingUpdates(true);
    try {
      const { results, error } = await checkUpdates(modrinth, data.mods, {
        gameVersion: data.modpack.minecraftVersion.trim() || undefined,
        loader: normalizeLoader(data.modpack.modloader) ?? undefined,
      });
      setUpdates({ results, at: new Date() });
      const available = [...results.values()].filter(
        (result) => result.status === "update-available",
      ).length;
      if (error)
        notify({
          kind: "error",
          title: "Update check incomplete",
          description: `${error.message} Mods that were not checked show as Unknown.`,
        });
      else
        notify({
          kind: "info",
          title: "Updates checked",
          description: available
            ? `${available} ${available === 1 ? "mod has" : "mods have"} a newer compatible version. Nothing was changed.`
            : "No newer compatible versions were found.",
        });
    } finally {
      setCheckingUpdates(false);
    }
  };
  const importJars = (created: Mod[]) => {
    try {
      importMods(modsSchema.parse([...data.mods, ...created]));
    } catch {
      notify({
        kind: "error",
        title: "Import failed",
        description: "The imported entries did not pass validation.",
      });
      return false;
    }
    notify({
      title: `Imported ${created.length} ${created.length === 1 ? "mod" : "mods"}`,
      description: "Added to your local draft as installed.",
    });
    return true;
  };
  const categories = useMemo(
    () => [...new Set(data.mods.map((mod) => mod.category))].sort(),
    [data.mods],
  );
  const filtered = useMemo(
    () => filterMods(data.mods, filters),
    [data.mods, filters],
  );
  // Layout animation gets costly for big collections, so it turns off there.
  const animateLayout = filtered.length <= 60;
  const persistMod = (mod: Mod, originalId?: string, title?: string) => {
    try {
      saveMod(mod, originalId);
    } catch {
      notify({
        kind: "error",
        title: `Could not save ${mod.name}`,
        description: "The mod data did not pass validation.",
      });
      return false;
    }
    setHighlightId(mod.id);
    notify({
      title: title ?? (originalId ? `Saved ${mod.name}` : `Added ${mod.name}`),
      description: "Stored in this browser’s draft.",
    });
    return true;
  };
  const duplicate = (mod: Mod) =>
    persistMod(
      {
        ...mod,
        id: uniqueId(mod.name, data.mods),
        name: `${mod.name} (copy)`,
        status: "planned",
      },
      undefined,
      `Duplicated ${mod.name}`,
    );
  const saveCaption = !dirty
    ? "Viewing published data"
    : saveState === "saving"
      ? "Saving draft…"
      : saveState === "error"
        ? "Unable to save draft"
        : "All changes saved locally";
  return (
    <div className="container manage-page">
      <div className="manage-title">
        <div>
          <div className="section-kicker">YOUR WORKSPACE</div>
          <h1>
            Manage collection<span className="heading-period">.</span>
          </h1>
          <p>Shape the pack. Keep every detail in one place.</p>
        </div>
        <div className="manage-title-actions">
          <span
            className={`save-caption save-${dirty ? saveState : "published"}`}
            role="status"
          >
            <span className="draft-dot" aria-hidden="true" />
            {saveCaption}
          </span>
          <a className="button button-secondary" href="#/">
            View preview <ArrowRight size={16} />
          </a>
        </div>
      </div>
      <div className="manage-layout">
        <aside className="manage-sidebar" aria-label="Manage sections">
          <div className="sidebar-heading">WORKSPACE</div>
          <button
            type="button"
            className={tab === "mods" ? "sidebar-item active" : "sidebar-item"}
            aria-current={tab === "mods" ? "page" : undefined}
            onClick={() => setTab("mods")}
          >
            <FileJson2 size={18} /> Mod collection{" "}
            <span>{data.mods.length}</span>
          </button>
          <button
            type="button"
            className={
              tab === "settings" ? "sidebar-item active" : "sidebar-item"
            }
            aria-current={tab === "settings" ? "page" : undefined}
            onClick={() => setTab("settings")}
          >
            <Settings2 size={18} /> Pack settings
          </button>
          <button
            type="button"
            className={tab === "data" ? "sidebar-item active" : "sidebar-item"}
            aria-current={tab === "data" ? "page" : undefined}
            onClick={() => setTab("data")}
          >
            <ArrowDownToLine size={18} /> Data & export
            {dirty && (
              <span className="sidebar-dot" title="Draft has changes to export">
                <span className="sr-only">(changes to export)</span>
              </span>
            )}
          </button>
          <div className="sidebar-tip">
            <span className="eyebrow-dot" />
            <strong>LOCAL WORKSPACE</strong>
            <p>
              Your edits stay in this browser until you export and publish them.
            </p>
          </div>
        </aside>
        <div className="manage-content">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={tab}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -4 }}
              transition={{ duration: 0.16, ease: "easeOut" }}
            >
              {tab === "mods" && (
                <>
                  <div className="manage-section-head">
                    <div>
                      <h2>Mod collection</h2>
                      <p>Add, edit, and organize the mods in your pack.</p>
                    </div>
                    <div className="section-head-actions">
                      <Button
                        variant="secondary"
                        onClick={() => setImportingJars(true)}
                      >
                        <Upload size={16} /> Import mods
                      </Button>
                      <Button
                        variant="secondary"
                        onClick={() => setPicking({ kind: "add" })}
                      >
                        <Search size={16} /> Search Modrinth
                      </Button>
                      <Button onClick={() => setEditing({ mod: null })}>
                        <Plus size={17} /> Add manually
                      </Button>
                    </div>
                  </div>
                  <CompatibilityPanel
                    mods={data.mods}
                    results={compat}
                    checking={checking}
                    checkedAt={live?.at ?? null}
                    onCheck={() => void runCheck()}
                    updates={updates?.results ?? null}
                    updatesCheckedAt={updates?.at ?? null}
                    checkingUpdates={checkingUpdates}
                    onCheckUpdates={() => void runUpdateCheck()}
                  />
                  <ModFilters
                    filters={filters}
                    onChange={setFilters}
                    categories={categories}
                    count={filtered.length}
                    total={data.mods.length}
                    showView={false}
                  />
                  {filtered.length ? (
                    <div className="manage-list">
                      <AnimatePresence mode="popLayout" initial={false}>
                        {filtered.map((mod) => (
                          <motion.div
                            layout={animateLayout ? "position" : false}
                            className={
                              mod.id === highlightId
                                ? "manage-row row-highlight"
                                : "manage-row"
                            }
                            key={mod.id}
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            exit={{
                              opacity: 0,
                              x: 16,
                              transition: { duration: 0.16 },
                            }}
                            transition={{ duration: 0.22, ease: "easeOut" }}
                            onAnimationEnd={() =>
                              mod.id === highlightId && setHighlightId(null)
                            }
                          >
                            <ModArtwork
                              name={mod.name}
                              imageUrl={mod.imageUrl}
                            />
                            <div className="manage-row-main">
                              <div>
                                <h3 title={mod.name}>{mod.name}</h3>
                                <span className={`status status-${mod.status}`}>
                                  {mod.status}
                                </span>
                                {compat.get(mod.id) && (
                                  <CompatBadge
                                    status={compat.get(mod.id)!.status}
                                    compact
                                  />
                                )}
                                <UpdateBadge
                                  mod={mod}
                                  result={updates?.results.get(mod.id)}
                                  onUpdate={(versionId) =>
                                    setPicking({
                                      kind: "refresh",
                                      mod,
                                      preselectVersionId: versionId,
                                    })
                                  }
                                />
                              </div>
                              <p>
                                {mod.category} <span>·</span> {mod.side} side{" "}
                                {mod.version && (
                                  <>
                                    {" "}
                                    <span>·</span> v{mod.version}
                                  </>
                                )}
                              </p>
                            </div>
                            <div className="row-actions">
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Edit ${mod.name}`}
                                title="Edit"
                                onClick={() => setEditing({ mod })}
                              >
                                <Pencil size={17} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={
                                  mod.modrinth
                                    ? `Update ${mod.name} from Modrinth`
                                    : `Link ${mod.name} to Modrinth`
                                }
                                title={
                                  mod.modrinth
                                    ? "Update from Modrinth"
                                    : "Link to Modrinth"
                                }
                                onClick={() =>
                                  setPicking({ kind: "refresh", mod })
                                }
                              >
                                <RefreshCw size={16} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                aria-label={`Duplicate ${mod.name}`}
                                title="Duplicate"
                                onClick={() => duplicate(mod)}
                              >
                                <Copy size={17} />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                className="row-delete"
                                aria-label={`Delete ${mod.name}`}
                                title="Delete"
                                onClick={() => setDeleting(mod)}
                              >
                                <Trash2 size={17} />
                              </Button>
                            </div>
                          </motion.div>
                        ))}
                      </AnimatePresence>
                    </div>
                  ) : (
                    <motion.div
                      className="empty-state"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      transition={{ duration: 0.2 }}
                    >
                      <div className="empty-icon">
                        <FileJson2 size={24} />
                      </div>
                      {data.mods.length ? (
                        <>
                          <h3>No mods match your filters</h3>
                          <p>Try adjusting your search or filters.</p>
                          <Button
                            variant="secondary"
                            onClick={() => setFilters(initialFilters)}
                          >
                            Clear filters
                          </Button>
                        </>
                      ) : (
                        <>
                          <h3>No mods yet</h3>
                          <p>Add your first mod or import a mods.json file.</p>
                          <Button onClick={() => setPicking({ kind: "add" })}>
                            <Search size={16} /> Search Modrinth
                          </Button>
                        </>
                      )}
                    </motion.div>
                  )}
                </>
              )}
              {tab === "settings" && (
                <SettingsForm
                  key={JSON.stringify(data.modpack)}
                  modpack={data.modpack}
                  onSave={(modpack) => {
                    updateModpack(modpack);
                    notify({
                      title: "Pack settings saved",
                      description: "Stored in this browser’s draft.",
                    });
                  }}
                />
              )}
              {tab === "data" && <DataTools />}
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={
          shownEditing?.mod
            ? `Edit ${shownEditing.mod.name}`
            : shownEditing?.initial
              ? `Add ${shownEditing.initial.name}`
              : "Add a mod"
        }
        description="Fields marked * are required. Changes stay in this browser until you export."
        size="wide"
      >
        {shownEditing && (
          <ModEditor
            key={`${shownEditing.mod?.id ?? "new"}:${shownEditing.initial?.modrinth?.versionId ?? ""}`}
            mod={shownEditing.mod}
            initialValues={shownEditing.initial}
            mods={data.mods}
            onSave={persistMod}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={picking !== null}
        onOpenChange={(open) => !open && setPicking(null)}
        title={
          shownPicking?.kind === "refresh"
            ? shownPicking.mod.modrinth
              ? `Update ${shownPicking.mod.name} from Modrinth`
              : `Link ${shownPicking.mod.name} to Modrinth`
            : "Search Modrinth"
        }
        description={
          shownPicking?.kind === "refresh"
            ? "Pick a version. Your notes, status, and edited fields are kept."
            : "Find a mod, pick a version, then review the details before adding."
        }
        size="wide"
      >
        {shownPicking && (
          <ModrinthPicker
            key={shownPicking.kind === "refresh" ? shownPicking.mod.id : "add"}
            target={shownPicking}
            mods={data.mods}
            modpack={data.modpack}
            onCancel={() => setPicking(null)}
            onManual={() => {
              setPicking(null);
              setEditing({ mod: null });
            }}
            onPick={(picked) => {
              setPicking(null);
              setEditing({
                mod: shownPicking.kind === "refresh" ? shownPicking.mod : null,
                initial: picked,
              });
            }}
          />
        )}
      </Dialog>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${shownDeleting?.name ?? "mod"}?`}
        description="This removes the mod from your local draft. You can reset to published data before exporting if needed."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) {
                deleteMod(deleting.id);
                notify({
                  kind: "info",
                  title: `Deleted ${deleting.name}`,
                  description: "Removed from your local draft.",
                });
              }
              setDeleting(null);
            }}
          >
            <Trash2 size={16} /> Delete mod
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={importingJars}
        onOpenChange={setImportingJars}
        title="Import mods from files"
        description="Select .jar files or a mods folder, review what was found, then choose what to add."
        size="wide"
      >
        <JarImportDialog
          mods={data.mods}
          modpack={data.modpack}
          onImport={importJars}
          onCancel={() => setImportingJars(false)}
        />
      </Dialog>
    </div>
  );
}
