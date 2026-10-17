import { useState, type AriaAttributes } from "react";
import * as PopoverPrimitive from "@radix-ui/react-popover";
import { Command } from "cmdk";
import { Check, ChevronDown, Search } from "lucide-react";
import { cn } from "../../lib/utils";
import { labelFor, toItemValue } from "./select-value";
import type { ControlSize, ControlVariant, SelectOption } from "./select";

type ComboboxProps = AriaAttributes & {
  options: SelectOption[];
  value: string;
  onValueChange: (value: string) => void;
  placeholder?: string;
  searchPlaceholder?: string;
  emptyText?: string;
  /** Validates typed text that is not an option; when it returns true, offers to add it. */
  allowCustom?: (text: string) => boolean;
  disabled?: boolean;
  invalid?: boolean;
  active?: boolean;
  size?: ControlSize;
  variant?: ControlVariant;
  id?: string;
  className?: string;
};

/**
 * Searchable dropdown for long option lists (Popover + cmdk). cmdk handles filtering and
 * keyboard navigation; the search text resets each time it opens, the selection does not.
 */
export function Combobox({
  options,
  value,
  onValueChange,
  placeholder = "Select…",
  searchPlaceholder = "Search…",
  emptyText = "No matches.",
  allowCustom,
  disabled,
  invalid,
  active,
  size = "md",
  variant = "default",
  id,
  className,
  "aria-invalid": ariaInvalid,
  ...aria
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const custom = search.trim();
  const showCustom =
    Boolean(allowCustom && custom && allowCustom(custom)) &&
    !options.some((option) => option.value === custom);
  const selectedLabel = labelFor(options, value);
  return (
    // Modal so the popover keeps focus correctly when it opens inside a dialog.
    <PopoverPrimitive.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setSearch("");
      }}
      modal
    >
      <PopoverPrimitive.Trigger asChild disabled={disabled}>
        <button
          type="button"
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-haspopup="listbox"
          className={cn(
            "control-trigger",
            `control-${size}`,
            `control-${variant}`,
            active && "control-active",
            className,
          )}
          {...aria}
          aria-invalid={invalid || ariaInvalid ? true : undefined}
        >
          <span
            className="control-value"
            data-placeholder={selectedLabel === undefined ? "" : undefined}
          >
            {selectedLabel ?? placeholder}
          </span>
          <ChevronDown
            className="control-chevron"
            size={15}
            aria-hidden="true"
          />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          className="control-content control-popover"
          sideOffset={4}
          collisionPadding={8}
          align="start"
        >
          <Command
            className="control-command"
            defaultValue={toItemValue(value)}
            // Match on the visible label; values may be sentinels.
            filter={(itemValue, search, keywords) =>
              [itemValue, ...(keywords ?? [])]
                .join(" ")
                .toLowerCase()
                .includes(search.trim().toLowerCase())
                ? 1
                : 0
            }
          >
            <div className="control-search">
              <Search size={14} aria-hidden="true" />
              <Command.Input
                className="control-search-input"
                placeholder={searchPlaceholder}
                value={search}
                onValueChange={setSearch}
              />
            </div>
            <Command.List className="control-viewport">
              <Command.Empty className="control-empty">
                {emptyText}
              </Command.Empty>
              {options.map((option) => (
                <Command.Item
                  key={option.value}
                  value={toItemValue(option.value)}
                  keywords={[option.label]}
                  disabled={option.disabled}
                  className="control-item"
                  onSelect={() => {
                    onValueChange(option.value);
                    setOpen(false);
                  }}
                >
                  <span className="control-item-text">{option.label}</span>
                  {option.value === value && (
                    <Check
                      className="control-indicator"
                      size={14}
                      aria-hidden="true"
                    />
                  )}
                </Command.Item>
              ))}
              {showCustom && (
                <Command.Item
                  value={`__custom__${custom}`}
                  keywords={[custom]}
                  className="control-item"
                  onSelect={() => {
                    onValueChange(custom);
                    setOpen(false);
                    setSearch("");
                  }}
                >
                  <span className="control-item-text">Add “{custom}”</span>
                </Command.Item>
              )}
            </Command.List>
          </Command>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}
