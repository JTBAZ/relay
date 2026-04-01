/**
 * Patreon post `attributes.content` is usually an HTML string, but some responses
 * use a small object wrapper or Quill delta format. Normalizes to a single string
 * for description and image URL scraping.
 */
export function normalizePatreonPostContent(raw: unknown): string {
  if (typeof raw === "string") {
    return raw;
  }
  if (raw == null) {
    return "";
  }
  if (typeof raw === "object") {
    const o = raw as Record<string, unknown>;
    const delta = flattenQuillDelta(o);
    if (delta) return delta;
    for (const key of ["html", "body", "text", "value", "content"]) {
      const v = o[key];
      if (typeof v === "string" && v.length > 0) {
        return v;
      }
      if (v && typeof v === "object") {
        const nested = normalizePatreonPostContent(v);
        if (nested) {
          return nested;
        }
      }
    }
  }
  return "";
}

/**
 * Quill delta ops are `{ insert: string, attributes?: {...} }`.
 * Accepts `{ delta: [...] }` or `{ ops: [...] }` wrappers.
 * Concatenates insert strings and wraps non-empty lines in `<p>` tags.
 */
function flattenQuillDelta(obj: Record<string, unknown>): string | null {
  const ops = obj.delta ?? obj.ops;
  if (!Array.isArray(ops) || ops.length === 0) return null;
  const parts: string[] = [];
  for (const op of ops) {
    if (op && typeof op === "object") {
      const insert = (op as Record<string, unknown>).insert;
      if (typeof insert === "string") {
        parts.push(insert);
      }
    }
  }
  if (parts.length === 0) return null;
  const text = parts.join("");
  if (!text.trim()) return null;
  return text
    .split(/\n+/)
    .filter((line) => line.trim())
    .map((line) => `<p>${line}</p>`)
    .join("");
}

/**
 * ProseMirror / Tiptap document format used by Patreon's `content_json_string`.
 * Shape: `{ type: "doc", content: [ { type: "paragraph", content: [ { type: "text", text: "..." } ] } ] }`
 * Recursively extracts text nodes, wraps paragraph-level blocks in `<p>` tags.
 */
export function flattenProseMirrorDoc(raw: unknown): string {
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return "";
    }
  }
  if (!raw || typeof raw !== "object") return "";
  const doc = raw as Record<string, unknown>;
  if (doc.type !== "doc" || !Array.isArray(doc.content)) return "";

  const blocks: string[] = [];
  for (const node of doc.content) {
    if (!node || typeof node !== "object") continue;
    const n = node as Record<string, unknown>;
    const text = extractProseMirrorText(n);
    if (text.trim()) {
      blocks.push(`<p>${text}</p>`);
    }
  }
  return blocks.join("");
}

function extractProseMirrorText(node: Record<string, unknown>): string {
  if (node.type === "text" && typeof node.text === "string") {
    return node.text;
  }
  if (!Array.isArray(node.content)) return "";
  const parts: string[] = [];
  for (const child of node.content) {
    if (child && typeof child === "object") {
      parts.push(extractProseMirrorText(child as Record<string, unknown>));
    }
  }
  return parts.join("");
}
