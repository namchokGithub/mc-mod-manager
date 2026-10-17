import type { IgnoredDependency, Mod } from "../../lib/schema";

type Listed = { id: string; name: string; kind: "required" | "optional" };

/** Required and optional dependencies from the provider data the checker reads. */
function listedDependencies(mod: Pick<Mod, "modrinth" | "file">): Listed[] {
  const meta = mod.modrinth;
  if (meta?.versionId && meta.dependencies)
    return meta.dependencies.flatMap((dependency) =>
      dependency.projectId &&
      (dependency.type === "required" || dependency.type === "optional")
        ? [
            {
              id: dependency.projectId,
              name: dependency.name ?? dependency.projectId,
              kind: dependency.type,
            },
          ]
        : [],
    );
  const file = mod.file;
  if (file?.format && file.format !== "filename")
    return (file.dependencies ?? []).flatMap((dependency) =>
      dependency.kind === "required" || dependency.kind === "optional"
        ? [
            {
              id: dependency.modId,
              name: dependency.modId,
              kind: dependency.kind,
            },
          ]
        : [],
    );
  return [];
}

/**
 * Lets the user set aside a dependency that the provider lists but this pack does not need,
 * such as Fabric API on a Modrinth version shared by Fabric and NeoForge builds. Each one needs
 * a reason and is shown as a note in compatibility results.
 */
export function IgnoredDependenciesField({
  mod,
  value,
  onChange,
  defaultReason,
  errors,
}: {
  mod: Pick<Mod, "modrinth" | "file">;
  value: IgnoredDependency[];
  onChange: (value: IgnoredDependency[]) => void;
  defaultReason: string;
  /** Validation messages by position in `value`. */
  errors?: (string | undefined)[];
}) {
  const listed = listedDependencies(mod);
  if (!listed.length) return null;
  const indexOf = (id: string) => value.findIndex((entry) => entry.id === id);
  return (
    <fieldset className="form-field-wide ignored-deps">
      <legend>Dependencies not needed for this pack</legend>
      <p className="mr-hint">
        Use this only when the listed dependency belongs to another loader’s
        build. Ignored dependencies are not checked and are shown as a note.
      </p>
      <ul>
        {listed.map((dependency) => {
          const index = indexOf(dependency.id);
          const entry = index >= 0 ? value[index] : undefined;
          const error = index >= 0 ? errors?.[index] : undefined;
          return (
            <li key={dependency.id}>
              <label className="mr-check">
                <input
                  type="checkbox"
                  checked={Boolean(entry)}
                  onChange={(event) =>
                    onChange(
                      event.target.checked
                        ? [
                            ...value,
                            { id: dependency.id, reason: defaultReason },
                          ]
                        : value.filter((item) => item.id !== dependency.id),
                    )
                  }
                />
                {dependency.name}
                <span className="mr-chip mr-chip-muted">{dependency.kind}</span>
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
