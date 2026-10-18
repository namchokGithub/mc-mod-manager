import { Link2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { Combobox } from "../../components/ui/combobox";
import {
  listedDependencies,
  possibleProviders,
  resolvedExactly,
} from "../../lib/dependencyLinks";
import type { DependencyLink, IgnoredDependency, Mod } from "../../lib/schema";

/**
 * Per dependency the provider lists: link it to the mod in the list that provides it (when the
 * IDs differ), or mark it not needed for this pack (another loader's build). A dependency is
 * either linked or ignored, never both. Ignored ones are shown as a note in results; linked ones
 * are checked like any other dependency and warn again if the linked mod is removed.
 */
export function IgnoredDependenciesField({
  mod,
  mods,
  value,
  onChange,
  links,
  onLinksChange,
  defaultReason,
  errors,
}: {
  mod: Pick<Mod, "id" | "modrinth" | "file">;
  /** Every mod in the collection, to link to and to look for matches. */
  mods: Mod[];
  value: IgnoredDependency[];
  onChange: (value: IgnoredDependency[]) => void;
  links: DependencyLink[];
  onLinksChange: (links: DependencyLink[]) => void;
  defaultReason: string;
  /** Validation messages by position in `value`. */
  errors?: (string | undefined)[];
}) {
  const listed = listedDependencies(mod);
  if (!listed.length) return null;
  const others = mods
    .filter((other) => other.id !== mod.id)
    .sort((a, b) => a.name.localeCompare(b.name));
  const link = (id: string, modId: string) => {
    onLinksChange([
      ...links.filter((item) => item.id !== id),
      ...(modId ? [{ id, modId }] : []),
    ]);
    if (modId) onChange(value.filter((item) => item.id !== id));
  };
  const ignore = (id: string, on: boolean) => {
    onChange(
      on
        ? [...value, { id, reason: defaultReason }]
        : value.filter((item) => item.id !== id),
    );
    if (on) onLinksChange(links.filter((item) => item.id !== id));
  };

  return (
    <fieldset className="form-field-wide ignored-deps">
      <legend>Listed dependencies</legend>
      <p className="mr-hint">
        Link a dependency to the mod in your list that provides it when their
        IDs differ. Mark it not needed only when it belongs to another loader’s
        build.
      </p>
      <ul>
        {listed.map((dependency) => {
          const index = value.findIndex((entry) => entry.id === dependency.id);
          const entry = index >= 0 ? value[index] : undefined;
          const error = index >= 0 ? errors?.[index] : undefined;
          const linkedId = links.find(
            (item) => item.id === dependency.id,
          )?.modId;
          const exact = resolvedExactly(dependency, mod, mods);
          const providers = possibleProviders(dependency, mod, mods);
          const suggestion =
            !exact && !linkedId && providers.length === 1
              ? providers[0]
              : undefined;
          return (
            <li key={dependency.id}>
              <span className="ignored-deps-name">
                <strong>{dependency.name}</strong>
                <span className="mr-chip mr-chip-muted">{dependency.kind}</span>
                {exact && !entry && (
                  <span className="mr-chip">Found in the list</span>
                )}
              </span>
              {!exact && (
                <Combobox
                  aria-label={`Mod that provides ${dependency.name}`}
                  size="sm"
                  value={linkedId ?? ""}
                  placeholder="Provided by a mod in the list…"
                  searchPlaceholder="Search mods…"
                  emptyText="No mods match."
                  options={[
                    { value: "", label: "Not linked" },
                    ...others.map((other) => ({
                      value: other.id,
                      label: other.name,
                    })),
                  ]}
                  onValueChange={(modId) => link(dependency.id, modId)}
                />
              )}
              {linkedId && !mods.some((other) => other.id === linkedId) && (
                <small className="field-error" role="alert">
                  Linked to “{linkedId}”, which is no longer in the list.
                </small>
              )}
              {suggestion && (
                <span className="jar-note">
                  {entry
                    ? `Marked not needed, but “${suggestion.name}” in the list looks like this dependency.`
                    : `“${suggestion.name}” in the list looks like this dependency.`}
                  <Button
                    type="button"
                    variant="secondary"
                    size="small"
                    onClick={() => link(dependency.id, suggestion.id)}
                  >
                    <Link2 size={14} /> Link to {suggestion.name}
                  </Button>
                </span>
              )}
              <label className="mr-check">
                <input
                  type="checkbox"
                  checked={Boolean(entry)}
                  onChange={(event) =>
                    ignore(dependency.id, event.target.checked)
                  }
                />
                Not needed for this pack
              </label>
              {entry && (
                <label className={`form-field${error ? " has-error" : ""}`}>
                  <span className="sr-only">
                    Reason for ignoring {dependency.name}
                  </span>
                  <input
                    value={entry.reason}
                    placeholder="Why this pack does not need it"
                    aria-invalid={error ? true : undefined}
                    onChange={(event) =>
                      onChange(
                        value.map((item) =>
                          item.id === dependency.id
                            ? { ...item, reason: event.target.value }
                            : item,
                        ),
                      )
                    }
                  />
                  {error && (
                    <small className="field-error" role="alert">
                      {error}
                    </small>
                  )}
                </label>
              )}
            </li>
          );
        })}
      </ul>
    </fieldset>
  );
}
