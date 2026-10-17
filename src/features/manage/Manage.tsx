import { useMemo, useRef, useState } from "react";
import { zodResolver } from "@hookform/resolvers/zod";
import { useForm, useWatch } from "react-hook-form";
import { z } from "zod";
import {
  ArrowDownToLine,
  ArrowRight,
  ArrowUpFromLine,
  Copy,
  FileJson2,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Settings2,
  Trash2,
} from "lucide-react";
import { useCollection } from "../../app/DataContext";
import { ModArtwork } from "../../components/ModArtwork";
import { ModFilters } from "../../components/ModFilters";
import { Button } from "../../components/ui/button";
import { Dialog } from "../../components/ui/dialog";
import { filterMods, uniqueId, type Filters } from "../../lib/mods";
import {
  modSchema,
  modpackSchema,
  parseJsonFile,
  type Mod,
  type Modpack,
} from "../../lib/schema";
import { downloadJson } from "../../lib/storage";

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
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="form-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
      {error && (
        <small className="field-error" role="alert">
          {error}
        </small>
      )}
    </label>
  );
}

function ModEditor({
  mod,
  mods,
  onSave,
  onClose,
}: {
  mod: Mod | null;
  mods: Mod[];
  onSave: (mod: Mod, originalId?: string) => void;
  onClose: () => void;
}) {
  const initial: ModFields = mod
    ? {
        ...mod,
        tagsText: mod.tags.join(", "),
        dependenciesText: mod.dependencies.join(", "),
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
    formState: { errors },
  } = useForm<ModFields>({
    resolver: zodResolver(formSchema),
    defaultValues: initial,
  });
  const name = useWatch({ control, name: "name" });
  const id = useWatch({ control, name: "id" });
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
    if (!validation.success) return;
    if (mods.some((item) => item.id === candidate.id && item.id !== mod?.id)) {
      setError("id", { message: "This ID is already used by another mod." });
      return;
    }
    onSave(validation.data, mod?.id);
    onClose();
  };
  return (
    <form className="editor-form" onSubmit={handleSubmit(submit)}>
      <div className="form-grid">
        <Field label="Mod name *" error={errors.name?.message}>
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
        <Field label="Category *" error={errors.category?.message}>
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
        <Field label="Description" error={errors.description?.message}>
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
        <Field label="Notes" error={errors.notes?.message}>
          <textarea
            rows={3}
            placeholder="Compatibility, setup, or testing notes"
            {...register("notes")}
          />
        </Field>
      </div>
      <div className="dialog-actions">
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
    formState: { errors, isDirty },
  } = useForm<Modpack>({
    resolver: zodResolver(modpackSchema),
    defaultValues: modpack,
  });
  return (
    <form className="settings-form" onSubmit={handleSubmit(onSave)}>
      <div className="settings-intro">
        <h2>Modpack settings</h2>
        <p>The details that introduce your collection on the Preview page.</p>
      </div>
      <div className="form-grid">
        <Field label="Modpack name *" error={errors.name?.message}>
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
          label="Hero image URL"
          error={errors.heroImageUrl?.message}
          hint="Leave empty to use the built-in illustrated hero"
        >
          <input
            type="url"
            placeholder="https://…"
            {...register("heroImageUrl")}
          />
        </Field>
        <Field label="Last updated" error={errors.updatedAt?.message}>
          <input type="date" {...register("updatedAt")} />
        </Field>
        <Field label="Description" error={errors.description?.message}>
          <textarea rows={5} {...register("description")} />
        </Field>
      </div>
      <div className="settings-actions">
        <Button type="submit" disabled={!isDirty}>
          Save settings <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}

function DataTools() {
  const { data, importModpack, importMods, reset } = useCollection();
  const [message, setMessage] = useState<{
    kind: "success" | "error";
    text: string;
  } | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);
  const modpackFileRef = useRef<HTMLInputElement>(null);
  const modsFileRef = useRef<HTMLInputElement>(null);
  const onImport = async (kind: "modpack" | "mods", file?: File) => {
    if (!file) return;
    try {
      const parsed = parseJsonFile(await file.text(), kind);
      if (kind === "modpack") importModpack(parsed as Modpack);
      else importMods(parsed as Mod[]);
      setMessage({
        kind: "success",
        text: `${file.name} imported into your local draft.`,
      });
    } catch (error) {
      setMessage({
        kind: "error",
        text: error instanceof Error ? error.message : "Import failed.",
      });
    }
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
      {message && (
        <div className={`inline-message ${message.kind}`} role="status">
          {message.text}
        </div>
      )}
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
              onClick={() => modpackFileRef.current?.click()}
            >
              <ArrowUpFromLine size={15} /> Import
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => downloadJson("modpack.json", data.modpack)}
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
              onClick={() => modsFileRef.current?.click()}
            >
              <ArrowUpFromLine size={15} /> Import
            </Button>
            <Button
              variant="secondary"
              size="small"
              onClick={() => downloadJson("mods.json", data.mods)}
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
        <Button variant="danger" onClick={() => setConfirmReset(true)}>
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
              setMessage({
                kind: "success",
                text: "Local draft reset to published data.",
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
  const { data, dirty, saveState, saveMod, deleteMod, updateModpack } =
    useCollection();
  const [tab, setTab] = useState<Tab>("mods");
  const [filters, setFilters] = useState(initialFilters);
  const [editing, setEditing] = useState<Mod | "new" | null>(null);
  const [deleting, setDeleting] = useState<Mod | null>(null);
  const categories = useMemo(
    () => [...new Set(data.mods.map((mod) => mod.category))].sort(),
    [data.mods],
  );
  const filtered = useMemo(
    () => filterMods(data.mods, filters),
    [data.mods, filters],
  );
  const duplicate = (mod: Mod) =>
    saveMod({
      ...mod,
      id: uniqueId(mod.name, data.mods),
      name: `${mod.name} (copy)`,
      status: "planned",
    });
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
          <span className="save-caption">
            {!dirty
              ? "Viewing published data"
              : saveState === "saving"
                ? "Saving draft…"
                : saveState === "error"
                  ? "Unable to save draft"
                  : "All changes saved locally"}
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
            className={tab === "mods" ? "sidebar-item active" : "sidebar-item"}
            onClick={() => setTab("mods")}
          >
            <FileJson2 size={18} /> Mod collection{" "}
            <span>{data.mods.length}</span>
          </button>
          <button
            className={
              tab === "settings" ? "sidebar-item active" : "sidebar-item"
            }
            onClick={() => setTab("settings")}
          >
            <Settings2 size={18} /> Pack settings
          </button>
          <button
            className={tab === "data" ? "sidebar-item active" : "sidebar-item"}
            onClick={() => setTab("data")}
          >
            <ArrowDownToLine size={18} /> Data & export
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
          {tab === "mods" && (
            <>
              <div className="manage-section-head">
                <div>
                  <h2>Mod collection</h2>
                  <p>Add, edit, and organize the mods in your pack.</p>
                </div>
                <Button onClick={() => setEditing("new")}>
                  <Plus size={17} /> Add mod
                </Button>
              </div>
              <ModFilters
                filters={filters}
                onChange={setFilters}
                categories={categories}
                count={filtered.length}
                showView={false}
              />
              <div className="manage-list">
                {filtered.length ? (
                  filtered.map((mod) => (
                    <div className="manage-row" key={mod.id}>
                      <ModArtwork name={mod.name} imageUrl={mod.imageUrl} />
                      <div className="manage-row-main">
                        <div>
                          <h3>{mod.name}</h3>
                          <span className={`status status-${mod.status}`}>
                            {mod.status}
                          </span>
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
                          onClick={() => setEditing(mod)}
                        >
                          <Pencil size={17} />
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
                          aria-label={`Delete ${mod.name}`}
                          title="Delete"
                          onClick={() => setDeleting(mod)}
                        >
                          <Trash2 size={17} />
                        </Button>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-state">
                    <MoreHorizontal size={30} />
                    <h3>No mods found</h3>
                    <p>Try adjusting your search or filters.</p>
                    <Button
                      variant="secondary"
                      onClick={() => setFilters(initialFilters)}
                    >
                      Clear filters
                    </Button>
                  </div>
                )}
              </div>
            </>
          )}
          {tab === "settings" && (
            <SettingsForm
              key={JSON.stringify(data.modpack)}
              modpack={data.modpack}
              onSave={updateModpack}
            />
          )}
          {tab === "data" && <DataTools />}
        </div>
      </div>
      <Dialog
        open={editing !== null}
        onOpenChange={(open) => !open && setEditing(null)}
        title={
          editing === "new" ? "Add a mod" : `Edit ${editing?.name ?? "mod"}`
        }
        description="Keep mod information clear and easy to maintain."
      >
        {editing && (
          <ModEditor
            key={editing === "new" ? "new" : editing.id}
            mod={editing === "new" ? null : editing}
            mods={data.mods}
            onSave={saveMod}
            onClose={() => setEditing(null)}
          />
        )}
      </Dialog>
      <Dialog
        open={deleting !== null}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={`Delete ${deleting?.name ?? "mod"}?`}
        description="This removes the mod from your local draft. You can reset to published data before exporting if needed."
      >
        <div className="dialog-actions">
          <Button variant="ghost" onClick={() => setDeleting(null)}>
            Cancel
          </Button>
          <Button
            variant="danger"
            onClick={() => {
              if (deleting) deleteMod(deleting.id);
              setDeleting(null);
            }}
          >
            Delete mod
          </Button>
        </div>
      </Dialog>
    </div>
  );
}
