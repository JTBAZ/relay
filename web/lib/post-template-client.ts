/** Client-side mirror of `renderPostTemplateBody` in post-template-service.ts */
export function renderPostTemplateBody(
  body: string,
  vars: { title?: string | null; tags?: string[] }
): string {
  const tagsJoined = (vars.tags ?? []).join(", ");
  return body
    .replace(/\{\{title\}\}/gi, vars.title?.trim() ?? "")
    .replace(/\{\{tags\}\}/gi, tagsJoined);
}
