import { useId, useState } from "react";
import { ArrowRight, CircleAlert, Info, Link2 } from "lucide-react";
import { Button } from "../../components/ui/button";
import { parseCurseForgeUrl, type CurseForgeUrl } from "../../lib/curseforge";
import { findCurseForgeDuplicate } from "../../lib/contentVerification";
import type { ContentItem, ContentType } from "../../lib/schema";

/**
 * First step of "Add from CurseForge": checks the link's format and looks for an entry that
 * already is (or might be) this project. Nothing is fetched; details are entered next.
 */
export function CurseForgeLink({
  type,
  items,
  collectionTitle,
  onContinue,
  onReview,
  onAttach,
  onCancel,
}: {
  type: ContentType;
  items: ContentItem[];
  collectionTitle: string;
  onContinue: (link: CurseForgeUrl) => void;
  onReview: (item: ContentItem) => void;
  onAttach: (item: ContentItem, link: CurseForgeUrl) => void;
  onCancel: () => void;
}) {
  const id = useId();
  const [text, setText] = useState("");
  const [checked, setChecked] = useState<ReturnType<
    typeof parseCurseForgeUrl
  > | null>(null);
  const link = checked?.ok ? checked.value : null;
  const duplicate = link ? findCurseForgeDuplicate(items, link) : undefined;
  const check = () => setChecked(parseCurseForgeUrl(text, type));

  return (
    <form
      className="editor-form"
      noValidate
      onSubmit={(event) => {
        event.preventDefault();
        if (link && !duplicate) onContinue(link);
        else check();
      }}
    >
      <label
        className={`form-field form-field-wide${checked && !checked.ok ? " has-error" : ""}`}
      >
        <span>CurseForge URL</span>
        <input
          autoFocus
          type="url"
          value={text}
          placeholder="https://www.curseforge.com/minecraft/…"
          aria-invalid={checked && !checked.ok ? true : undefined}
          aria-describedby={`${id}-hint`}
          onChange={(event) => {
            setText(event.target.value);
            setChecked(null);
          }}
          onBlur={() => text.trim() && check()}
        />
        {checked && !checked.ok ? (
          <small id={`${id}-hint`} className="field-error" role="alert">
            <CircleAlert size={12} aria-hidden="true" /> {checked.error}
          </small>
        ) : (
          <small id={`${id}-hint`}>
            A project or file link. Only its format is checked; you enter the
            name, version, and Minecraft versions yourself.
          </small>
        )}
      </label>

      {link && (
        <p className="mr-hint" role="status">
          <Link2 size={13} aria-hidden="true" /> Project “{link.slug}”
          {link.fileId ? `, file ${link.fileId} (as written in the link)` : ""}
        </p>
      )}

      {link && duplicate && (
        <div
          className={
            duplicate.match === "url"
              ? "inline-message error"
              : "inline-message"
          }
          role={duplicate.match === "url" ? "alert" : "status"}
        >
          <Info size={16} aria-hidden="true" />
          <span>
            {duplicate.match === "url"
              ? `${collectionTitle} already link this project as “${duplicate.item.name}”.`
              : `“${duplicate.item.name}” may be the same project${duplicate.item.modrinth ? " on Modrinth" : ""}. Attach this link to it instead of adding a second entry?`}
          </span>
        </div>
      )}

      <div className="dialog-actions">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        {link && duplicate && (
          <Button
            type="button"
            variant="secondary"
            onClick={() => onReview(duplicate.item)}
          >
            Review “{duplicate.item.name}”
          </Button>
        )}
        {link && duplicate?.match === "possible" && (
          <>
            {!duplicate.item.curseforge && (
              <Button
                type="button"
                variant="secondary"
                onClick={() => onAttach(duplicate.item, link)}
              >
                <Link2 size={15} /> Attach to “{duplicate.item.name}”
              </Button>
            )}
            <Button type="button" onClick={() => onContinue(link)}>
              Add as new <ArrowRight size={16} />
            </Button>
          </>
        )}
        {!duplicate && (
          <Button type="submit" disabled={!text.trim()}>
            {link ? "Enter details" : "Check link"} <ArrowRight size={16} />
          </Button>
        )}
      </div>
    </form>
  );
}
