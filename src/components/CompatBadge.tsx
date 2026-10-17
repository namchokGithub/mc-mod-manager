import { CircleCheck, CircleHelp, CircleX, TriangleAlert } from "lucide-react";
import {
  compatLabels,
  verificationLabels,
  verificationText,
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

const dateFormat = new Intl.DateTimeFormat("en", { dateStyle: "medium" });

/** The manual verification on record: its link and date, marked as earlier evidence when it no longer applies. */
function Evidence({ result }: { result: CompatResult }) {
  const evidence = result.evidence;
  if (!evidence) return null;
  const date = Date.parse(evidence.verifiedAt);
  const current = result.verification === "manual-verified";
  return (
    <span className="compat-evidence">
      {current
        ? "User-confirmed"
        : `Earlier manual check (${evidence.version})`}
      {Number.isFinite(date) ? ` on ${dateFormat.format(date)}` : ""} ·{" "}
      <a href={evidence.evidenceUrl} target="_blank" rel="noreferrer">
        Evidence
      </a>
    </span>
  );
}

/** Verification source plus one chip per check, so partial results stay visible. */
function CompatChecksRow({ result }: { result: CompatResult }) {
  return (
    <div className="compat-checks">
      <span className="compat-source">{verificationText(result)}</span>
      <Evidence result={result} />
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
              {result.checkSources[check] !== result.verification &&
                (result.checkSources[check] === "manual"
                  ? " (manual)"
                  : ` (${verificationLabels[result.checkSources[check]]})`)}
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
  label,
  source,
  compact = false,
}: {
  status: CompatStatus;
  /** Overrides the status text, e.g. "Manual Match" from statusLabel(). */
  label?: string;
  /** Verification source, e.g. from verificationText(); added to the compact tooltip. */
  source?: string;
  compact?: boolean;
}) {
  const Icon = icons[status];
  const text = label ?? compatLabels[status];
  const full = source && compact ? `${text} · ${source}` : text;
  const manual = text.startsWith("Manual");
  return (
    <span
      className={`compat-badge compat-${status}${compact ? " compat-compact" : ""}${manual ? " compat-manual" : ""}`}
      title={compact ? full : undefined}
    >
      <Icon size={13} aria-hidden="true" />
      <span className={compact ? "sr-only" : undefined}>{full}</span>
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
