import {
  cloneElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import { AnimatePresence, motion } from "motion/react";
import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm, useWatch, type Control } from "react-hook-form";
import { z } from "zod";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Copy,
  HardDriveDownload,
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
import { Select, type SelectOption } from "../../components/ui/select";
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
  DEFAULT_PAGE_SIZE,
  PAGE_SIZES,
  pageSelectionState,
  paginate,
  pruneSelection,
  setPageSelected,
  toggleSelected,
  type PageSize,
} from "../../lib/pagination";
import {
  modSchema,
  modsSchema,
  modpackSchema,
  parseJsonFile,
  type Mod,
  type Modpack,
} from "../../lib/schema";
import { saveToLocalJson } from "../../lib/localSave";
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

const statusOptions: SelectOption[] = [
  "planned",
  "testing",
  "installed",
  "disabled",
  "removed",
].map((value) => ({
  value,
  label: value.charAt(0).toUpperCase() + value.slice(1),
}));
const sideOptions: SelectOption[] = [
  { value: "both", label: "Both" },
  { value: "client", label: "Client" },
  { value: "server", label: "Server" },
];
const sourceOptions: SelectOption[] = [
  "Modrinth",
  "CurseForge",
  "GitHub",
  "Other",
].map((value) => ({ value, label: value }));

/** Shared Select bound to the mod form; Field passes its aria attributes through. */
function FormSelect({
  control,
  name,
  options,
  ...aria
}: React.AriaAttributes & {
  control: Control<ModFields>;
  name: "status" | "side" | "source";
  options: SelectOption[];
}) {
  return (
    <Controller
      control={control}
      name={name}
      render={({ field }) => (
        <Select
          ref={field.ref}
          name={field.name}
          value={field.value}
          onValueChange={field.onChange}
          onBlur={field.onBlur}
          options={options}
          {...aria}
        />
      )}
    />
  );
}

function ModEditor({
  mod,
  initialValues,
  mods,
  onSave,
  onClose,
  onCancel,
  onDirtyChange,
}: {
  mod: Mod | null;
  initialValues?: Mod;
  mods: Mod[];
  onSave: (mod: Mod, originalId?: string) => boolean;
  onClose: () => void;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
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
  // Values prefilled from Modrinth or a JAR are unsaved too, even before any typing.
  const unsaved = isDirty || initialValues !== undefined;
  useEffect(() => {
    onDirtyChange(unsaved);
    return () => onDirtyChange(false);
  }, [unsaved, onDirtyChange]);
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
          <FormSelect control={control} name="status" options={statusOptions} />
        </Field>
        <Field label="Installation side" error={errors.side?.message}>
          <FormSelect control={control} name="side" options={sideOptions} />
        </Field>
        <Field label="Source" error={errors.source?.message}>
          <FormSelect control={control} name="source" options={sourceOptions} />
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
        <UnsavedHint show={unsaved} />
        <Button type="button" variant="ghost" onClick={onCancel}>
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
  onDirtyChange,
}: {
  modpack: Modpack;
  onSave: (modpack: Modpack) => void;
  onDirtyChange: (dirty: boolean) => void;
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
  useEffect(() => {
    onDirtyChange(isDirty);
    return () => onDirtyChange(false);
  }, [isDirty, onDirtyChange]);
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
  const [pendingImport, setPendingImport] = useState<
    | { kind: "modpack"; fileName: string; value: Modpack }
    | { kind: "mods"; fileName: string; value: Mod[] }
    | null
  >(null);
  const shownImport = useRetained(pendingImport);
  const modpackFileRef = useRef<HTMLInputElement>(null);
  const modsFileRef = useRef<HTMLInputElement>(null);
  const onImport = async (kind: "modpack" | "mods", file?: File) => {
    if (!file) return;
    setImporting(kind);
    try {
      const parsed = parseJsonFile(await file.text(), kind);
      setImportError("");
      // Valid files still replace current data, so they wait for confirmation.
      setPendingImport(
        kind === "modpack"
          ? { kind, fileName: file.name, value: parsed as Modpack }
          : { kind, fileName: file.name, value: parsed as Mod[] },
      );
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
  const applyImport = () => {
    if (!pendingImport) return;
    if (pendingImport.kind === "modpack") importModpack(pendingImport.value);
    else importMods(pendingImport.value);
    notify({
      title: `${pendingImport.fileName} imported`,
      description: "The data is now in your local draft.",
    });
    setPendingImport(null);
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
          Changes are saved only in this browser. Use “Save to local JSON” at
          the top of Manage to write public/data/*.json directly, or export both
          files here as a backup. Commit the files to update the published site.
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
        <div className="dialog-actions dialog-actions-flush">
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
      <Dialog
        open={pendingImport !== null}
        onOpenChange={(open) => !open && setPendingImport(null)}
        title={
          shownImport?.kind === "mods"
            ? "Replace the mod collection?"
            : "Replace the pack settings?"
        }
        description={
          shownImport?.kind === "mods"
            ? `${shownImport.fileName} has ${shownImport.value.length} ${shownImport.value.length === 1 ? "mod" : "mods"}. They will replace the ${data.mods.length} ${data.mods.length === 1 ? "mod" : "mods"} in your draft, including notes. Export first if you want to keep the current list.`
            : `${shownImport?.fileName ?? "This file"} will replace the name, description, versions, and hero image in your draft.`
        }
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setPendingImport(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={applyImport}>
            <ArrowUpFromLine size={16} /> Replace with file
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
    deleteMods,
    updateModpack,
    importMods,
    published,
    markSaved,
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
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);
  // Selection is keyed by mod ID and survives page and filter changes.
  const [selected, setSelected] = useState<Set<string>>(() => new Set());
  // IDs captured when the bulk confirm opens, so the dialog cannot change underneath it.
  const [bulkDelete, setBulkDelete] = useState<string[] | null>(null);
  const shownBulkDelete = useRetained(bulkDelete);
  // Writing public/data/*.json through the dev server. The ref blocks double submits
  // even before React re-renders the disabled button.
  const [localSave, setLocalSave] = useState<{
    conflict?: string;
    error?: string;
  } | null>(null);
  const shownLocalSave = useRetained(localSave);
  const [savingLocal, setSavingLocal] = useState(false);
  const savingLocalRef = useRef(false);
  const runLocalSave = async (force: boolean) => {
    if (savingLocalRef.current) return;
    savingLocalRef.current = true;
    setSavingLocal(true);
    try {
      const result = await saveToLocalJson(data, published, force);
      if (result.kind === "saved") {
        markSaved(result.collection);
        setLocalSave(null);
        notify({
          title: "Saved to public/data",
          description:
            "modpack.json and mods.json were updated. Commit them to publish.",
        });
      } else if (result.kind === "conflict")
        setLocalSave({ conflict: result.message });
      else {
        setLocalSave((current) => ({ ...current, error: result.message }));
        notify({
          kind: "error",
          title: "Not saved",
          description: result.message,
        });
      }
    } finally {
      savingLocalRef.current = false;
      setSavingLocal(false);
    }
  };
  const shownPicking = useRetained(picking);
  const [editorDirty, setEditorDirty] = useState(false);
  const [settingsDirty, setSettingsDirty] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState<
    { kind: "editor" } | { kind: "tab"; next: Tab } | null
  >(null);
  const shownDiscard = useRetained(confirmDiscard);
  const closeEditor = () =>
    editorDirty ? setConfirmDiscard({ kind: "editor" }) : setEditing(null);
  const changeTab = (next: Tab) =>
    tab === "settings" && next !== "settings" && settingsDirty
      ? setConfirmDiscard({ kind: "tab", next })
      : setTab(next);
  const discard = () => {
    if (confirmDiscard?.kind === "editor") setEditing(null);
    if (confirmDiscard?.kind === "tab") setTab(confirmDiscard.next);
    setConfirmDiscard(null);
  };
  // Closing or reloading the browser tab would also drop unsaved form edits.
  useEffect(() => {
    if (!editorDirty && !settingsDirty) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [editorDirty, settingsDirty]);
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
  // IDs of deleted or replaced mods drop out of the selection automatically.
  const selection = useMemo(
    () =>
      pruneSelection(
        selected,
        data.mods.map((mod) => mod.id),
      ),
    [selected, data.mods],
  );
  const paged = paginate(filtered, page, pageSize);
  const pageIds = paged.items.map((mod) => mod.id);
  const pageState = pageSelectionState(selection, pageIds);
  const filteredIds = new Set(filtered.map((mod) => mod.id));
  const hiddenSelected = [...selection].filter(
    (id) => !filteredIds.has(id),
  ).length;
  const changeFilters = (next: Filters) => {
    setFilters(next);
    setPage(1);
  };
  const confirmBulkDelete = () => {
    if (!bulkDelete) return;
    const names = data.mods
      .filter((mod) => bulkDelete.includes(mod.id))
      .map((mod) => mod.name);
    try {
      deleteMods(bulkDelete);
    } catch {
      notify({
        kind: "error",
        title: "Mods not deleted",
        description: "Your draft was not changed.",
      });
      setBulkDelete(null);
      return;
    }
    setSelected((current) => {
      const next = new Set(current);
      for (const id of bulkDelete) next.delete(id);
      return next;
    });
    notify({
      kind: "info",
      title: `Deleted ${names.length} ${names.length === 1 ? "mod" : "mods"}`,
      description: "Removed from your local draft.",
    });
    setBulkDelete(null);
  };
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
          <Button
            disabled={!dirty || savingLocal}
            title={
              dirty
                ? "Write the draft to public/data/*.json"
                : "No changes to save"
            }
            onClick={() => setLocalSave({})}
          >
            {savingLocal ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : (
              <HardDriveDownload size={16} aria-hidden="true" />
            )}
            {savingLocal ? "Saving…" : "Save to local JSON"}
          </Button>
        </div>
      </div>
      <div className="manage-layout">
        <aside className="manage-sidebar" aria-label="Manage sections">
          <div className="sidebar-heading">WORKSPACE</div>
          <button
            type="button"
            className={tab === "mods" ? "sidebar-item active" : "sidebar-item"}
            aria-current={tab === "mods" ? "page" : undefined}
            onClick={() => changeTab("mods")}
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
            onClick={() => changeTab("settings")}
          >
            <Settings2 size={18} /> Pack settings
          </button>
          <button
            type="button"
            className={tab === "data" ? "sidebar-item active" : "sidebar-item"}
            aria-current={tab === "data" ? "page" : undefined}
            onClick={() => changeTab("data")}
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
                    onChange={changeFilters}
                    categories={categories}
                    count={filtered.length}
                    total={data.mods.length}
                    showView={false}
                  />
                  {selection.size > 0 && (
                    <div
                      className="bulk-bar"
                      role="region"
                      aria-label="Bulk actions"
                    >
                      <span role="status">
                        <strong>{selection.size}</strong> selected
                        {hiddenSelected > 0 &&
                          ` (${hiddenSelected} hidden by filters)`}
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
                          onClick={() => setBulkDelete([...selection])}
                        >
                          <Trash2 size={15} /> Delete selected
                        </Button>
                      </div>
                    </div>
                  )}
                  {filtered.length ? (
                    <div className="manage-list">
                      <label className="manage-list-head">
                        <input
                          type="checkbox"
                          className="row-check"
                          ref={(element) => {
                            if (element)
                              element.indeterminate = pageState === "some";
                          }}
                          checked={pageState === "all"}
                          onChange={(event) =>
                            setSelected((current) =>
                              setPageSelected(
                                current,
                                pageIds,
                                event.target.checked,
                              ),
                            )
                          }
                        />
                        <span>
                          {pageState === "all"
                            ? `All ${pageIds.length} on this page selected`
                            : `Select all ${pageIds.length} on this page`}
                        </span>
                      </label>
                      <AnimatePresence mode="popLayout" initial={false}>
                        {paged.items.map((mod) => (
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
                            <input
                              type="checkbox"
                              className="row-check"
                              checked={selection.has(mod.id)}
                              onChange={() =>
                                setSelected((current) =>
                                  toggleSelected(current, mod.id),
                                )
                              }
                              aria-label={`Select ${mod.name}`}
                            />
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
                            onClick={() => changeFilters(initialFilters)}
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
                  {filtered.length > 0 && (
                    <nav className="pagination" aria-label="Mod list pages">
                      <span className="pagination-summary" role="status">
                        Showing {paged.from}–{paged.to} of {paged.total}{" "}
                        {paged.total === 1 ? "mod" : "mods"}
                      </span>
                      <div className="pagination-controls">
                        <Select
                          aria-label="Mods per page"
                          size="sm"
                          variant="compact"
                          className="pagination-size"
                          value={String(pageSize)}
                          onValueChange={(value) => {
                            setPageSize(Number(value) as PageSize);
                            setPage(1);
                          }}
                          options={PAGE_SIZES.map((size) => ({
                            value: String(size),
                            label: `${size} per page`,
                          }))}
                        />
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={paged.page <= 1}
                          onClick={() => setPage(paged.page - 1)}
                          aria-label="Previous page"
                        >
                          <ChevronLeft size={15} />
                          <span className="pagination-label">Previous</span>
                        </Button>
                        <span className="pagination-page">
                          Page {paged.page} of {paged.pageCount}
                        </span>
                        <Button
                          variant="ghost"
                          size="small"
                          disabled={paged.page >= paged.pageCount}
                          onClick={() => setPage(paged.page + 1)}
                          aria-label="Next page"
                        >
                          <span className="pagination-label">Next</span>
                          <ChevronRight size={15} />
                        </Button>
                      </div>
                    </nav>
                  )}
                </>
              )}
              {tab === "settings" && (
                <SettingsForm
                  key={JSON.stringify(data.modpack)}
                  modpack={data.modpack}
                  onDirtyChange={setSettingsDirty}
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
        onOpenChange={(open) => !open && closeEditor()}
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
            onCancel={closeEditor}
            onDirtyChange={setEditorDirty}
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
        <div className="dialog-actions dialog-actions-flush">
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
        open={localSave !== null}
        onOpenChange={(open) => !open && !savingLocal && setLocalSave(null)}
        title={
          shownLocalSave?.conflict
            ? "Files changed on disk"
            : "Save to local JSON files?"
        }
        description={
          shownLocalSave?.conflict
            ? `${shownLocalSave.conflict} Overwriting replaces those changes with your draft.`
            : `This overwrites public/data/modpack.json and public/data/mods.json with your draft (${data.mods.length} ${data.mods.length === 1 ? "mod" : "mods"}).${settingsDirty || editorDirty ? " Unsaved form edits are not included." : ""}`
        }
      >
        {shownLocalSave?.error && (
          <div className="inline-message error" role="alert">
            <CircleAlert size={16} aria-hidden="true" />
            <span>{shownLocalSave.error}</span>
          </div>
        )}
        <div
          className={
            shownLocalSave?.error
              ? "dialog-actions"
              : "dialog-actions dialog-actions-flush"
          }
        >
          <Button
            variant="ghost"
            disabled={savingLocal}
            onClick={() => setLocalSave(null)}
          >
            Cancel
          </Button>
          <Button
            variant={shownLocalSave?.conflict ? "danger" : "default"}
            disabled={savingLocal}
            onClick={() => void runLocalSave(Boolean(shownLocalSave?.conflict))}
          >
            {savingLocal ? (
              <LoaderCircle className="spin" size={16} aria-hidden="true" />
            ) : (
              <HardDriveDownload size={16} aria-hidden="true" />
            )}
            {savingLocal
              ? "Saving…"
              : shownLocalSave?.conflict
                ? "Overwrite files"
                : "Save files"}
          </Button>
        </div>
      </Dialog>
      <Dialog
        open={bulkDelete !== null}
        onOpenChange={(open) => !open && setBulkDelete(null)}
        title={`Delete ${shownBulkDelete?.length ?? 0} ${shownBulkDelete?.length === 1 ? "mod" : "mods"}?`}
        description={(() => {
          const ids = shownBulkDelete ?? [];
          const names = data.mods
            .filter((mod) => ids.includes(mod.id))
            .map((mod) => mod.name);
          const listed = names.slice(0, 5).join(", ");
          const more = names.length > 5 ? ` and ${names.length - 5} more` : "";
          return `This removes ${listed}${more} from your local draft. You can reset to published data before exporting if needed.`;
        })()}
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setBulkDelete(null)}>
            Cancel
          </Button>
          <Button variant="danger" onClick={confirmBulkDelete}>
            <Trash2 size={16} /> Delete {shownBulkDelete?.length ?? 0}{" "}
            {shownBulkDelete?.length === 1 ? "mod" : "mods"}
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
      <Dialog
        open={confirmDiscard !== null}
        onOpenChange={(open) => !open && setConfirmDiscard(null)}
        title={
          shownDiscard?.kind === "tab"
            ? "Discard unsaved settings?"
            : "Discard unsaved changes?"
        }
        description={
          shownDiscard?.kind === "tab"
            ? "Your edits to the pack settings have not been saved. Leaving this section will lose them."
            : "This mod has changes that have not been saved. Closing the editor will lose them."
        }
      >
        <div className="dialog-actions dialog-actions-flush">
          <Button variant="ghost" onClick={() => setConfirmDiscard(null)}>
            Keep editing
          </Button>
          <Button variant="danger" onClick={discard}>
            Discard changes
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
