import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import {
  compatLabels,
  verificationLabels,
  type CheckState,
  type CompatChecks,
  type CompatReason,
  type CompatResult,
  type CompatStatus,
} from "../lib/compatibility";

const checkNames: Record<keyof CompatChecks, string> = {
  minecraft: "Minecraft version",
  loader: "Modloader",
  dependencies: "Dependencies",
};
// Check states reuse the compatibility badge colours.
const checkStatus: Record<CheckState, CompatStatus> = {
  pass: "compatible",
  warn: "warning",
  fail: "incompatible",
  unknown: "unknown",
};
const checkLabels: Record<CheckState, string> = {
  pass: "OK",
  warn: "Check",
  fail: "Problem",
  unknown: "Unknown",
};

/** Verification source plus one chip per check, so partial results stay visible. */
function CompatChecksRow({ result }: { result: CompatResult }) {
  return (
    <div className="compat-checks">
      <span className="compat-source">
        Verified with {verificationLabels[result.verification]}
      </span>
      <ul aria-label="Compatibility checks">
        {(Object.keys(checkNames) as (keyof CompatChecks)[]).map((check) => {
          const state = result.checks[check];
          const Icon = icons[checkStatus[state]];
          return (
            <li
              key={check}
              className={`compat-badge compat-${checkStatus[state]}`}
            >
              <Icon size={12} aria-hidden="true" />
              {checkNames[check]}: {checkLabels[state]}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

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
      <>
        <CompatChecksRow result={result} />
        <p className="compat-ok">
          Matches the pack's Minecraft version and modloader, and every required
          dependency is in the pack.
        </p>
      </>
    );
  return (
    <>
      <CompatChecksRow result={result} />
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
    </>
  );
}
