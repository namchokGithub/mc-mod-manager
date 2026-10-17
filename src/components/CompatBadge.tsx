import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import {
  compatLabels,
  type CompatReason,
  type CompatResult,
  type CompatStatus,
} from "../lib/compatibility";

const icons = {
  compatible: CircleCheck,
  warning: TriangleAlert,
  incompatible: CircleX,
  unknown: CircleHelp,
};

export function CompatBadge({
  status,
  compact = false,
}: {
  status: CompatStatus;
  compact?: boolean;
}) {
  const Icon = icons[status];
  return (
    <span
      className={`compat-badge compat-${status}${compact ? " compat-compact" : ""}`}
      title={compact ? compatLabels[status] : undefined}
    >
      <Icon size={13} aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>
        {compatLabels[status]}
      </span>
    </span>
  );
}

const reasonIcons: Record<CompatReason["level"], typeof CircleCheck> = {
  error: CircleX,
  warning: TriangleAlert,
  unknown: CircleHelp,
  info: CircleHelp,
};

export function CompatReasons({ result }: { result: CompatResult }) {
  if (!result.reasons.length)
    return (
      <p className="compat-ok">
        Matches the pack's Minecraft version and modloader, and every required
        dependency is in the pack.
      </p>
    );
  return (
    <ul className="compat-reasons">
      {result.reasons.map((reason) => {
        const Icon = reasonIcons[reason.level];
        return (
          <li key={reason.message} className={`reason-${reason.level}`}>
            <Icon size={14} aria-hidden="true" />
            <span>{reason.message}</span>
          </li>
        );
      })}
    </ul>
  );
}
