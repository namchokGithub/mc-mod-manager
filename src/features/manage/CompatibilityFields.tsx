import { X } from "lucide-react";
import { Combobox } from "../../components/ui/combobox";
import { Select } from "../../components/ui/select";
import { LOADERS } from "../../lib/modrinth/mapping";
import {
  loaderLabel,
  sortMinecraftVersions,
} from "../../lib/modrinth/versionFilters";

// Letters, digits, dots, dashes, plus signs, and underscores; enough for releases and snapshots.
const VERSION_PATTERN = /^[0-9A-Za-z][0-9A-Za-z.+\-_]{0,31}$/;

function Chips({
  values,
  format = (value: string) => value,
  onRemove,
}: {
  values: string[];
  format?: (value: string) => string;
  onRemove: (value: string) => void;
}) {
  if (!values.length) return null;
  return (
    <ul className="value-chips">
      {values.map((value) => (
        <li key={value} className="value-chip">
          {format(value)}
          <button
            type="button"
            aria-label={`Remove ${format(value)}`}
            onClick={() => onRemove(value)}
          >
            <X size={12} aria-hidden="true" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** Multi-value Minecraft version picker: chips plus a searchable Combobox that accepts new versions. */
export function SupportedVersionsField({
  value,
  onChange,
  suggestions,
  labelledBy,
  describedBy,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  suggestions: string[];
  labelledBy: string;
  describedBy?: string;
}) {
  const remaining = sortMinecraftVersions(suggestions).filter(
    (version) => !value.includes(version),
  );
  return (
    <div className="value-field">
      <Chips
        values={value}
        onRemove={(version) =>
          onChange(value.filter((item) => item !== version))
        }
      />
      <Combobox
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        value=""
        placeholder="Add a Minecraft version…"
        searchPlaceholder="Search or type a version…"
        emptyText="Type a version such as 26.1.2 to add it."
        options={remaining.map((version) => ({
          value: version,
          label: version,
        }))}
        allowCustom={(text) => VERSION_PATTERN.test(text)}
        onValueChange={(version) =>
          version && onChange(sortMinecraftVersions([...value, version]))
        }
      />
    </div>
  );
}

/** Multi-value modloader picker using the shared Select for the remaining loaders. */
export function SupportedLoadersField({
  value,
  onChange,
  labelledBy,
  describedBy,
}: {
  value: string[];
  onChange: (value: string[]) => void;
  labelledBy: string;
  describedBy?: string;
}) {
  const remaining = LOADERS.filter((loader) => !value.includes(loader));
  return (
    <div className="value-field">
      <Chips
        values={value}
        format={loaderLabel}
        onRemove={(loader) => onChange(value.filter((item) => item !== loader))}
      />
      <Select
        // Remounting clears the choice so the trigger shows the placeholder again.
        key={value.join("|")}
        aria-labelledby={labelledBy}
        aria-describedby={describedBy}
        placeholder={
          remaining.length ? "Add a modloader…" : "All modloaders added"
        }
        disabled={!remaining.length}
        options={remaining.map((loader) => ({
          value: loader,
          label: loaderLabel(loader),
        }))}
        onValueChange={(loader) => loader && onChange([...value, loader])}
      />
    </div>
  );
}
