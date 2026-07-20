import {
  customTextFieldConfig,
  type CustomTextDraft,
} from "@/lib/custom-text-draft";
import type { DistributionDestination } from "@/lib/relay-api";

const DESTINATION_LABEL: Record<DistributionDestination, string> = {
  patreon: "Patreon",
  x: "X / Twitter",
  deviantart: "DeviantArt",
  bluesky: "Bluesky",
};

type Props = {
  dest: DistributionDestination;
  draft: CustomTextDraft;
  onChange: (patch: Partial<CustomTextDraft>) => void;
  /** Questionnaire uses labeled fields; card editor uses compact placeholders. */
  variant?: "questionnaire" | "card";
};

export function CustomTextEditorFields({
  dest,
  draft,
  onChange,
  variant = "questionnaire",
}: Props) {
  const fields = customTextFieldConfig(dest);
  const isQuestionnaire = variant === "questionnaire";
  const inputClass = isQuestionnaire
    ? "w-full rounded-lg border px-2 py-1.5 text-[11px] bg-transparent text-[#f9fafb]"
    : "w-full rounded-lg border px-2 py-1.5 text-xs bg-transparent text-[#f9fafb]";
  const labelClass = "text-[9px] uppercase tracking-wide text-[#6b7280] font-medium";

  return (
    <>
      {fields.showTitle ? (
        <div className="space-y-1">
          {isQuestionnaire ? (
            <label className={labelClass}>Title</label>
          ) : null}
          <input
            type="text"
            value={draft.title}
            disabled={fields.titleDisabled}
            title={fields.titleTooltip}
            onChange={(e) => onChange({ title: e.target.value })}
            className={`${inputClass}${fields.titleDisabled ? " opacity-50 cursor-not-allowed" : ""}`}
            style={{ borderColor: "#2a2a2a" }}
            placeholder={
              fields.titleDisabled
                ? "Not used on X"
                : isQuestionnaire
                  ? `Title for ${DESTINATION_LABEL[dest]}`
                  : "Title"
            }
          />
        </div>
      ) : null}

      {fields.showDescription ? (
        <div className="space-y-1">
          {isQuestionnaire ? (
            <div className="flex items-center justify-between">
              <label className={labelClass}>Description</label>
              {fields.characterLimit ? (
                <span className="text-[9px] text-[#6b7280]">
                  {draft.body.length}/{fields.characterLimit}
                </span>
              ) : null}
            </div>
          ) : null}
          <textarea
            value={draft.body}
            onChange={(e) => onChange({ body: e.target.value })}
            rows={isQuestionnaire ? 3 : 4}
            className={`${inputClass} resize-none`}
            style={{ borderColor: "#2a2a2a" }}
            placeholder={
              isQuestionnaire
                ? `Description for ${DESTINATION_LABEL[dest]}`
                : undefined
            }
          />
          {!isQuestionnaire && fields.characterLimit ? (
            <p className="text-[9px] text-[#6b7280] text-right">
              {draft.body.length}/{fields.characterLimit}
            </p>
          ) : null}
        </div>
      ) : null}

      {fields.showTags ? (
        <div className="space-y-1">
          {isQuestionnaire ? (
            <label className={labelClass}>Tags</label>
          ) : null}
          <input
            type="text"
            value={draft.tags}
            onChange={(e) => onChange({ tags: e.target.value })}
            className={inputClass}
            style={{ borderColor: "#2a2a2a" }}
            placeholder={isQuestionnaire ? "tag1, tag2, tag3" : "Tags, comma-separated"}
          />
        </div>
      ) : null}
    </>
  );
}
