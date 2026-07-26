"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createPostTemplate,
  deletePostTemplate,
  fetchPostTemplates,
  updatePostTemplate,
  type PostTemplateWire,
} from "@/lib/relay-api";

type TemplateDraft = {
  name: string;
  body: string;
  tags: string;
};

const EMPTY_DRAFT: TemplateDraft = { name: "", body: "", tags: "" };

function tagsFromDraft(tags: string): string[] {
  return tags
    .split(",")
    .map((tag) => tag.trim())
    .filter(Boolean);
}

function draftFromTemplate(template: PostTemplateWire): TemplateDraft {
  return {
    name: template.name,
    body: template.body,
    tags: template.tags.join(", "),
  };
}

function TemplateDraftFields({
  draft,
  onChange,
  idPrefix,
}: {
  draft: TemplateDraft;
  onChange: (next: TemplateDraft) => void;
  idPrefix: string;
}) {
  return (
    <div className="space-y-3">
      <div>
        <label htmlFor={`${idPrefix}-name`} className="text-xs font-medium text-[var(--lib-fg)]">
          Name
        </label>
        <input
          id={`${idPrefix}-name`}
          type="text"
          value={draft.name}
          onChange={(e) => onChange({ ...draft, name: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
          placeholder="Patreon intro"
          maxLength={80}
        />
      </div>
      <div>
        <label htmlFor={`${idPrefix}-body`} className="text-xs font-medium text-[var(--lib-fg)]">
          Body
        </label>
        <textarea
          id={`${idPrefix}-body`}
          value={draft.body}
          onChange={(e) => onChange({ ...draft, body: e.target.value })}
          rows={5}
          className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
          placeholder="Thanks for reading {{title}}! Tags: {{tags}}"
        />
        <p className="mt-1 text-[11px] text-[var(--lib-fg-muted)]">
          Use <code className="text-[10px]">{"{{title}}"}</code> and{" "}
          <code className="text-[10px]">{"{{tags}}"}</code> to insert the Relay post title and tags when
          applying a template.
        </p>
      </div>
      <div>
        <label htmlFor={`${idPrefix}-tags`} className="text-xs font-medium text-[var(--lib-fg)]">
          Default tags
        </label>
        <input
          id={`${idPrefix}-tags`}
          type="text"
          value={draft.tags}
          onChange={(e) => onChange({ ...draft, tags: e.target.value })}
          className="mt-1 w-full rounded-lg border border-[var(--lib-border)] bg-[var(--lib-bg)] px-3 py-2 text-sm text-[var(--lib-fg)] outline-none ring-[#2D6A4F]/30 focus:ring-2"
          placeholder="comic, wip, process"
        />
      </div>
    </div>
  );
}

export function PostTemplateSettings() {
  const [templates, setTemplates] = useState<PostTemplateWire[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [createDraft, setCreateDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [createBusy, setCreateBusy] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<TemplateDraft>(EMPTY_DRAFT);
  const [editBusy, setEditBusy] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const { templates: rows } = await fetchPostTemplates();
      setTemplates(rows);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const startCreate = () => {
    setMessage(null);
    setEditingId(null);
    setCreating(true);
    setCreateDraft(EMPTY_DRAFT);
  };

  const cancelCreate = () => {
    setCreating(false);
    setCreateDraft(EMPTY_DRAFT);
  };

  const submitCreate = async () => {
    const name = createDraft.name.trim();
    const body = createDraft.body.trim();
    if (!name || !body) {
      setError("Name and body are required.");
      return;
    }
    setCreateBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { template } = await createPostTemplate({
        name,
        body,
        tags: tagsFromDraft(createDraft.tags),
      });
      setTemplates((prev) => [template, ...prev.filter((t) => t.template_id !== template.template_id)]);
      setCreating(false);
      setCreateDraft(EMPTY_DRAFT);
      setMessage(`Saved “${template.name}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setCreateBusy(false);
    }
  };

  const startEdit = (template: PostTemplateWire) => {
    setMessage(null);
    setCreating(false);
    setEditingId(template.template_id);
    setEditDraft(draftFromTemplate(template));
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft(EMPTY_DRAFT);
  };

  const submitEdit = async () => {
    if (!editingId) return;
    const name = editDraft.name.trim();
    const body = editDraft.body.trim();
    if (!name || !body) {
      setError("Name and body are required.");
      return;
    }
    setEditBusy(true);
    setError(null);
    setMessage(null);
    try {
      const { template } = await updatePostTemplate(editingId, {
        name,
        body,
        tags: tagsFromDraft(editDraft.tags),
      });
      setTemplates((prev) =>
        prev.map((row) => (row.template_id === template.template_id ? template : row))
      );
      setEditingId(null);
      setEditDraft(EMPTY_DRAFT);
      setMessage(`Updated “${template.name}”.`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setEditBusy(false);
    }
  };

  const removeTemplate = async (templateId: string) => {
    setDeletingId(templateId);
    setError(null);
    setMessage(null);
    try {
      await deletePostTemplate(templateId);
      setTemplates((prev) => prev.filter((row) => row.template_id !== templateId));
      if (editingId === templateId) cancelEdit();
      setMessage("Template deleted.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeletingId(null);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-3 text-sm text-[var(--lib-fg-muted)]">
        <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
        Loading post templates…
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-card)] px-4 py-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-[var(--lib-fg)]">Post templates</h2>
          <p className="mt-1 text-xs leading-relaxed text-[var(--lib-fg-muted)]">
            Reusable description filler for Autopost cross-posting. Templates appear in the Transformer Node
            strategy step.
          </p>
        </div>
        {!creating ? (
          <button
            type="button"
            onClick={startCreate}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-[#2D6A4F] px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-[#40916C]"
          >
            <Plus className="h-3.5 w-3.5" aria-hidden />
            Add template
          </button>
        ) : null}
      </div>

      {creating ? (
        <div className="mt-4 rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-[var(--lib-fg-muted)]">
            New template
          </p>
          <div className="mt-3">
            <TemplateDraftFields
              idPrefix="create-template"
              draft={createDraft}
              onChange={setCreateDraft}
            />
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              disabled={createBusy}
              onClick={() => void submitCreate()}
              className="rounded-lg bg-[#2D6A4F] px-4 py-2 text-sm font-medium text-white hover:bg-[#40916C] disabled:opacity-50"
            >
              {createBusy ? "Saving…" : "Save template"}
            </button>
            <button
              type="button"
              disabled={createBusy}
              onClick={cancelCreate}
              className="rounded-lg border border-[var(--lib-border)] px-4 py-2 text-sm text-[var(--lib-fg)] hover:border-[var(--lib-primary)]/45"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4 space-y-2">
        {templates.length === 0 ? (
          <p className="rounded-lg border border-dashed border-[var(--lib-border)] px-3 py-4 text-xs text-[var(--lib-fg-muted)]">
            No templates yet. Add one here or save custom copy from the Autopost strategy step.
          </p>
        ) : (
          templates.map((template) => {
            const isEditing = editingId === template.template_id;
            return (
              <div
                key={template.template_id}
                className="rounded-xl border border-[var(--lib-border)] bg-[var(--lib-bg)] p-3"
              >
                {isEditing ? (
                  <>
                    <TemplateDraftFields
                      idPrefix={`edit-${template.template_id}`}
                      draft={editDraft}
                      onChange={setEditDraft}
                    />
                    <div className="mt-3 flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={editBusy}
                        onClick={() => void submitEdit()}
                        className="rounded-lg bg-[#2D6A4F] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#40916C] disabled:opacity-50"
                      >
                        {editBusy ? "Saving…" : "Save changes"}
                      </button>
                      <button
                        type="button"
                        disabled={editBusy}
                        onClick={cancelEdit}
                        className="rounded-lg border border-[var(--lib-border)] px-3 py-1.5 text-xs text-[var(--lib-fg)]"
                      >
                        Cancel
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-[var(--lib-fg)]">{template.name}</p>
                      <p className="mt-1 line-clamp-2 text-xs text-[var(--lib-fg-muted)]">{template.body}</p>
                      {template.tags.length > 0 ? (
                        <p className="mt-1 text-[10px] text-[var(--lib-fg-muted)]">
                          Tags: {template.tags.join(", ")}
                        </p>
                      ) : null}
                    </div>
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        onClick={() => startEdit(template)}
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--lib-border)] p-2 text-[var(--lib-fg-muted)] hover:text-[var(--lib-fg)]"
                        aria-label={`Edit ${template.name}`}
                      >
                        <Pencil className="h-3.5 w-3.5" aria-hidden />
                      </button>
                      <button
                        type="button"
                        disabled={deletingId === template.template_id}
                        onClick={() => void removeTemplate(template.template_id)}
                        className="inline-flex items-center justify-center rounded-lg border border-[var(--lib-border)] p-2 text-[var(--lib-fg-muted)] hover:text-red-400 disabled:opacity-50"
                        aria-label={`Delete ${template.name}`}
                      >
                        {deletingId === template.template_id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" aria-hidden />
                        )}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {error ? <p className="mt-3 text-xs text-red-400">{error}</p> : null}
      {message && !error ? <p className="mt-3 text-xs text-[#40916C]">{message}</p> : null}
    </div>
  );
}
