import { useEffect, useId, useState } from "react";
import { ArrowRight, CircleAlert, Info } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import {
  contentSourceLabels,
  contentStatusLabels,
  type ContentInput,
} from "../../lib/content";
import { contentSources, contentStatuses } from "../../lib/schema";
import { contentVerificationMatches } from "../../lib/contentVerification";
import { SupportedVersionsField } from "../manage/CompatibilityFields";
import { ManualVerificationSection } from "../manage/ManualVerification";

type Errors = Partial<Record<keyof ContentInput, string>>;

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <small id={id} className="field-error" role="alert">
      <CircleAlert size={12} aria-hidden="true" /> {message}
    </small>
  );
}

/**
 * Add/Edit form shared by resource packs, data packs, and shaders. Nothing is fetched from the
 * source URL, and nothing here is presented as verified.
 */
export function ContentEditor({
  initial,
  itemId,
  singular,
  versionSuggestions,
  onSubmit,
  onCancel,
  onDirtyChange,
  prefilled = false,
}: {
  initial: ContentInput;
  /** Values came from a CurseForge link or an attach action, so they are unsaved from the start. */
  prefilled?: boolean;
  /** Shown read-only when editing; IDs never change after creation. */
  itemId?: string;
  singular: string;
  versionSuggestions: string[];
  /** Returns field errors, or null when the entry was saved to the draft. */
  onSubmit: (input: ContentInput) => Errors | null;
  onCancel: () => void;
  onDirtyChange: (dirty: boolean) => void;
}) {
  const id = useId();
  const [values, setValues] = useState(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [errors, setErrors] = useState<Errors>({});
  const input: ContentInput = {
    ...values,
    tags: tagsText
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean),
  };
  const dirty = prefilled || JSON.stringify(input) !== JSON.stringify(initial);
  const snapshot = values.manualVerification;
  useEffect(() => {
    onDirtyChange(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange(false), [onDirtyChange]);
  const set = <K extends keyof ContentInput>(key: K, value: ContentInput[K]) =>
    setValues((current) => ({ ...current, [key]: value }));
  const text = (
    key: "name" | "version" | "sourceUrl" | "imageUrl" | "curseforgeUrl",
    label: string,
    props: React.InputHTMLAttributes<HTMLInputElement> = {},
  ) => (
    <label className={`form-field${errors[key] ? " has-error" : ""}`}>
      <span>
        {label}
        {key === "name" && (
          <span className="field-required" aria-hidden="true">
            *
          </span>
        )}
      </span>
      <input
        value={values[key]}
        aria-invalid={errors[key] ? true : undefined}
        aria-describedby={errors[key] ? `${id}-${key}` : undefined}
        onChange={(event) => set(key, event.target.value)}
        {...props}
      />
      <FieldError id={`${id}-${key}`} message={errors[key]} />
    </label>
  );

  return (
    <form
      className="editor-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        const result = onSubmit(input);
        if (result) setErrors(result);
      }}
    >
      <div className="data-note">
        <Info size={18} aria-hidden="true" />
        <p>
          Entered by hand. Links are stored as written and never fetched, and
          Minecraft versions are not verified.
        </p>
      </div>
      <div className="form-grid">
        {text("name", "Name", {
          autoFocus: true,
          required: true,
          placeholder: `Name of the ${singular}`,
        })}
        <div className="form-field">
          <span id={`${id}-status`}>
            Status
            <span className="field-required" aria-hidden="true">
              *
            </span>
          </span>
          <Select
            aria-labelledby={`${id}-status`}
            value={values.status}
            onValueChange={(value) =>
              set("status", value as ContentInput["status"])
            }
            options={contentStatuses.map((value) => ({
              value,
              label: contentStatusLabels[value],
            }))}
          />
        </div>
        {text("version", "Version", { placeholder: "Optional" })}
        <div className="form-field">
          <span id={`${id}-source`}>Source</span>
          <Select
            aria-labelledby={`${id}-source`}
            value={values.source}
            onValueChange={(value) =>
              set("source", value as ContentInput["source"])
            }
            options={contentSources.map((value) => ({
              value,
              label: contentSourceLabels[value],
            }))}
          />
        </div>
        {text("sourceUrl", "Source URL", {
          type: "url",
          placeholder: "https://modrinth.com/… or https://www.curseforge.com/…",
        })}
        {text("curseforgeUrl", "CurseForge URL", {
          type: "url",
          placeholder: "https://www.curseforge.com/minecraft/…",
          title:
            "The CurseForge page for this entry. Kept next to any Modrinth link; nothing is fetched.",
        })}
        {text("imageUrl", "Image URL", {
          type: "url",
          placeholder: "https://…",
        })}
        <div className="form-field">
          <span id={`${id}-mc`}>Supported Minecraft versions</span>
          <SupportedVersionsField
            value={values.minecraftVersions}
            onChange={(next) => set("minecraftVersions", next)}
            suggestions={versionSuggestions}
            labelledBy={`${id}-mc`}
          />
        </div>
        <label className="form-field">
          <span>Tags</span>
          <input
            value={tagsText}
            placeholder="Separate tags with commas"
            onChange={(event) => setTagsText(event.target.value)}
          />
        </label>
        <label className="form-field form-field-wide">
          <span>Description</span>
          <textarea
            rows={3}
            value={values.description}
            onChange={(event) => set("description", event.target.value)}
          />
        </label>
        <label className="form-field form-field-wide">
          <span>Notes</span>
          <textarea
            rows={3}
            value={values.notes}
            placeholder="Setup, load order, or testing notes"
            onChange={(event) => set("notes", event.target.value)}
          />
        </label>
        <ManualVerificationSection
          withLoaders={false}
          current={snapshot}
          matches={contentVerificationMatches(input, snapshot)}
          active={{
            version: values.version,
            gameVersions: values.minecraftVersions,
            loaders: [],
          }}
          suggestions={versionSuggestions}
          onConfirm={({ loaders: _loaders, ...confirmed }) => {
            void _loaders;
            setValues((current) => ({
              ...current,
              version: confirmed.version,
              minecraftVersions: confirmed.gameVersions,
              manualVerification: confirmed,
            }));
          }}
        />
        {itemId && (
          <p className="form-field-wide support-hint">
            ID: <code>{itemId}</code> (stays the same when you edit)
          </p>
        )}
      </div>
      <div className="dialog-actions dialog-actions-sticky">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="submit">
          {itemId ? "Save changes" : `Add ${singular}`} <ArrowRight size={16} />
        </Button>
      </div>
    </form>
  );
}
