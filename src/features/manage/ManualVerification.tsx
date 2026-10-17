import { useId, useState } from "react";
import { BadgeCheck, CircleAlert, ShieldQuestion } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Select } from "../../components/ui/select";
import { verificationSourceLabels } from "../../lib/compatibility";
import {
  buildManualVerification,
  type ManualVerificationErrors,
  type ManualVerificationInput,
} from "../../lib/manualVerification";
import {
  verificationSources,
  type ManualVerification as Snapshot,
} from "../../lib/schema";
import {
  SupportedLoadersField,
  SupportedVersionsField,
} from "./CompatibilityFields";

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });
const sourceOptions = verificationSources.map((value) => ({
  value,
  label:
    value === "official"
      ? "Official Website / GitHub"
      : verificationSourceLabels[value],
}));

function FieldError({ id, message }: { id: string; message?: string }) {
  if (!message) return null;
  return (
    <small id={id} className="field-error" role="alert">
      <CircleAlert size={12} aria-hidden="true" /> {message}
    </small>
  );
}

/**
 * Manual verification in the mod editor (and, without modloaders, the content editor). Shows
 * whether the snapshot on record still matches the form's version and support values, and lets
 * the user confirm new values. Confirming only changes the editor; the entry is saved with the
 * editor's own Save button.
 */
export function ManualVerificationSection({
  current,
  matches,
  active,
  suggestions,
  onConfirm,
  withLoaders = true,
}: {
  /** Snapshots without modloaders (content entries) have no `loaders`. */
  current?: Omit<Snapshot, "loaders"> & { loaders?: string[] };
  /** The snapshot covers the form's version, Minecraft versions, and modloaders. */
  matches: boolean;
  active: { version: string; gameVersions: string[]; loaders: string[] };
  suggestions: string[];
  onConfirm: (snapshot: Snapshot) => void;
  /** False for resource packs, data packs, and shaders, which have no modloader. */
  withLoaders?: boolean;
}) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState<ManualVerificationInput | null>(null);
  const [errors, setErrors] = useState<ManualVerificationErrors>({});
  const start = () => {
    setInput({
      source: current?.source ?? "curseforge",
      version: active.version,
      gameVersions: active.gameVersions,
      loaders: active.loaders,
      evidenceUrl: current?.evidenceUrl ?? "",
      confirmed: false,
    });
    setErrors({});
    setOpen(true);
  };
  const update = (next: Partial<ManualVerificationInput>) =>
    setInput((value) => (value ? { ...value, ...next } : value));
  const confirm = () => {
    if (!input) return;
    const result = buildManualVerification(input, new Date(), withLoaders);
    if (result.errors) {
      setErrors(result.errors);
      return;
    }
    onConfirm(result.value);
    setOpen(false);
  };

  return (
    <div className="form-field-wide manual-verify">
      <div className="manual-verify-head">
        {current ? (
          matches ? (
            <p className="manual-verify-status">
              <BadgeCheck size={15} aria-hidden="true" />
              <span>
                Manually Verified via {verificationSourceLabels[current.source]}{" "}
                for {current.version}, confirmed by you on{" "}
                {dateFormat.format(Date.parse(current.verifiedAt))}.{" "}
                <a href={current.evidenceUrl} target="_blank" rel="noreferrer">
                  Evidence
                </a>
              </span>
            </p>
          ) : (
            <p className="manual-verify-status stale">
              <ShieldQuestion size={15} aria-hidden="true" />
              <span>
                Needs Reverification. The earlier check covered version{" "}
                {current.version}; the version
                {withLoaders
                  ? ", Minecraft versions, or modloaders have"
                  : " or Minecraft versions have"}{" "}
                changed. It is kept as evidence.
              </span>
            </p>
          )
        ) : (
          <p className="mr-hint">
            Not manually verified. Use this when you checked a release yourself,
            for example on CurseForge.
          </p>
        )}
        {!open && (
          <Button
            type="button"
            variant="secondary"
            size="small"
            onClick={start}
          >
            <BadgeCheck size={15} />{" "}
            {current ? "Verify again" : "Verify manually"}
          </Button>
        )}
      </div>

      {open && input && (
        <div
          className="manual-verify-form"
          role="group"
          aria-labelledby={`${id}-title`}
          // Inside the mod editor's form: Enter must not save the whole mod.
          onKeyDown={(event) => {
            if (
              event.key === "Enter" &&
              event.target instanceof HTMLInputElement
            )
              event.preventDefault();
          }}
        >
          <h4 id={`${id}-title`}>Verify manually</h4>
          <p className="mr-hint">
            You confirm these values yourself. The link is stored as evidence
            and is never opened or checked by the app. Dependencies are not
            covered.
          </p>
          <div className="form-grid">
            <div className="form-field">
              <span id={`${id}-source`}>Verification source</span>
              <Select
                aria-labelledby={`${id}-source`}
                value={input.source}
                onValueChange={(value) =>
                  update({ source: value as Snapshot["source"] })
                }
                options={sourceOptions}
              />
            </div>
            <label
              className={`form-field${errors.version ? " has-error" : ""}`}
            >
              <span>Verified {withLoaders ? "mod " : ""}version</span>
              <input
                value={input.version}
                placeholder="e.g. 2.1.71"
                aria-invalid={errors.version ? true : undefined}
                aria-describedby={errors.version ? `${id}-version` : undefined}
                onChange={(event) => update({ version: event.target.value })}
              />
              <FieldError id={`${id}-version`} message={errors.version} />
            </label>
            <div
              className={`form-field${errors.gameVersions ? " has-error" : ""}`}
            >
              <span id={`${id}-mc`}>Supported Minecraft versions</span>
              <SupportedVersionsField
                value={input.gameVersions}
                onChange={(gameVersions) => update({ gameVersions })}
                suggestions={suggestions}
                labelledBy={`${id}-mc`}
                describedBy={errors.gameVersions ? `${id}-mc-error` : undefined}
              />
              <FieldError id={`${id}-mc-error`} message={errors.gameVersions} />
            </div>
            {withLoaders && (
              <div
                className={`form-field${errors.loaders ? " has-error" : ""}`}
              >
                <span id={`${id}-loaders`}>Supported modloaders</span>
                <SupportedLoadersField
                  value={input.loaders}
                  onChange={(loaders) => update({ loaders })}
                  labelledBy={`${id}-loaders`}
                  describedBy={
                    errors.loaders ? `${id}-loaders-error` : undefined
                  }
                />
                <FieldError
                  id={`${id}-loaders-error`}
                  message={errors.loaders}
                />
              </div>
            )}
            <label
              className={`form-field form-field-wide${errors.evidenceUrl ? " has-error" : ""}`}
            >
              <span>Evidence URL</span>
              <input
                type="url"
                value={input.evidenceUrl}
                placeholder="https://www.curseforge.com/minecraft/…"
                aria-invalid={errors.evidenceUrl ? true : undefined}
                aria-describedby={errors.evidenceUrl ? `${id}-url` : undefined}
                onChange={(event) =>
                  update({ evidenceUrl: event.target.value })
                }
              />
              <FieldError id={`${id}-url`} message={errors.evidenceUrl} />
            </label>
          </div>
          <label className="mr-check">
            <input
              type="checkbox"
              checked={input.confirmed}
              aria-describedby={
                errors.confirmed ? `${id}-confirmed` : undefined
              }
              onChange={(event) => update({ confirmed: event.target.checked })}
            />
            I checked this release myself and these values are correct.
          </label>
          <FieldError id={`${id}-confirmed`} message={errors.confirmed} />
          <div className="manual-verify-actions">
            <Button
              type="button"
              variant="ghost"
              size="small"
              onClick={() => setOpen(false)}
            >
              Cancel
            </Button>
            <Button type="button" size="small" onClick={confirm}>
              <BadgeCheck size={15} /> Confirm verification
            </Button>
          </div>
          <p className="mr-hint">
            Confirming updates this form's version and supported values. Save
            the form to keep it.
          </p>
        </div>
      )}
    </div>
  );
}
