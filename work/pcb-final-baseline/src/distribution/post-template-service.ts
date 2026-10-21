import type { PrismaClient } from "@prisma/client";

export type PostTemplateWire = {
  template_id: string;
  creator_id: string;
  name: string;
  body: string;
  tags: string[];
  created_at: string;
  updated_at: string;
};

export type PostTemplateCreateInput = {
  name: string;
  body: string;
  tags?: string[];
};

export type PostTemplateUpdateInput = {
  name?: string;
  body?: string;
  tags?: string[];
};

export class PostTemplateValidationError extends Error {
  public override readonly name = "PostTemplateValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

export class PostTemplateNotFoundError extends Error {
  public override readonly name = "PostTemplateNotFoundError";
  public constructor(public readonly templateId: string) {
    super(`Post template not found: ${templateId}`);
  }
}

const MAX_NAME_LENGTH = 80;
const MAX_BODY_LENGTH = 20_000;
const MAX_TAG_COUNT = 30;
const MAX_TAG_LENGTH = 100;

function mapRow(row: {
  id: string;
  creatorId: string;
  name: string;
  body: string;
  tags: string[];
  createdAt: Date;
  updatedAt: Date;
}): PostTemplateWire {
  return {
    template_id: row.id,
    creator_id: row.creatorId,
    name: row.name,
    body: row.body,
    tags: row.tags,
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

export function normalizePostTemplateTags(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  const out: string[] = [];
  const seen = new Set<string>();
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const trimmed = item.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(trimmed.slice(0, MAX_TAG_LENGTH));
    if (out.length >= MAX_TAG_COUNT) break;
  }
  return out;
}

function validateCreateInput(input: PostTemplateCreateInput): {
  name: string;
  body: string;
  tags: string[];
} {
  const details: Array<{ field: string; issue: string }> = [];
  const name = input.name?.trim() ?? "";
  const body = input.body?.trim() ?? "";
  if (!name) details.push({ field: "name", issue: "required" });
  if (name.length > MAX_NAME_LENGTH) details.push({ field: "name", issue: "too_long" });
  if (!body) details.push({ field: "body", issue: "required" });
  if (body.length > MAX_BODY_LENGTH) details.push({ field: "body", issue: "too_long" });
  if (details.length > 0) {
    throw new PostTemplateValidationError("Invalid post template.", details);
  }
  return { name, body, tags: normalizePostTemplateTags(input.tags) };
}

function validateUpdateInput(input: PostTemplateUpdateInput): {
  name?: string;
  body?: string;
  tags?: string[];
} {
  const details: Array<{ field: string; issue: string }> = [];
  const patch: { name?: string; body?: string; tags?: string[] } = {};

  if (input.name !== undefined) {
    const name = input.name.trim();
    if (!name) details.push({ field: "name", issue: "required" });
    if (name.length > MAX_NAME_LENGTH) details.push({ field: "name", issue: "too_long" });
    else patch.name = name;
  }

  if (input.body !== undefined) {
    const body = input.body.trim();
    if (!body) details.push({ field: "body", issue: "required" });
    if (body.length > MAX_BODY_LENGTH) details.push({ field: "body", issue: "too_long" });
    else patch.body = body;
  }

  if (input.tags !== undefined) {
    patch.tags = normalizePostTemplateTags(input.tags);
  }

  if (details.length > 0) {
    throw new PostTemplateValidationError("Invalid post template.", details);
  }

  if (Object.keys(patch).length === 0) {
    throw new PostTemplateValidationError("No fields to update.", [
      { field: "body", issue: "no_changes" }
    ]);
  }

  return patch;
}

/** Substitute `{{title}}` and `{{tags}}` placeholders when applying a template to a post. */
export function renderPostTemplateBody(
  body: string,
  vars: { title?: string | null; tags?: string[] }
): string {
  const tagsJoined = (vars.tags ?? []).join(", ");
  return body
    .replace(/\{\{title\}\}/gi, vars.title?.trim() ?? "")
    .replace(/\{\{tags\}\}/gi, tagsJoined);
}

export async function listPostTemplates(
  prisma: PrismaClient,
  creatorId: string
): Promise<PostTemplateWire[]> {
  const rows = await prisma.postTemplate.findMany({
    where: { creatorId: creatorId.trim() },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });
  return rows.map(mapRow);
}

export async function createPostTemplate(
  prisma: PrismaClient,
  creatorId: string,
  input: PostTemplateCreateInput
): Promise<PostTemplateWire> {
  const validated = validateCreateInput(input);
  const row = await prisma.postTemplate.create({
    data: {
      creatorId: creatorId.trim(),
      name: validated.name,
      body: validated.body,
      tags: validated.tags
    }
  });
  return mapRow(row);
}

export async function updatePostTemplate(
  prisma: PrismaClient,
  creatorId: string,
  templateId: string,
  input: PostTemplateUpdateInput
): Promise<PostTemplateWire> {
  const id = templateId.trim();
  const existing = await prisma.postTemplate.findFirst({
    where: { id, creatorId: creatorId.trim() }
  });
  if (!existing) throw new PostTemplateNotFoundError(id);

  const patch = validateUpdateInput(input);
  const row = await prisma.postTemplate.update({
    where: { id },
    data: patch
  });
  return mapRow(row);
}

export async function deletePostTemplate(
  prisma: PrismaClient,
  creatorId: string,
  templateId: string
): Promise<{ template_id: string }> {
  const id = templateId.trim();
  const existing = await prisma.postTemplate.findFirst({
    where: { id, creatorId: creatorId.trim() },
    select: { id: true }
  });
  if (!existing) throw new PostTemplateNotFoundError(id);

  await prisma.postTemplate.delete({ where: { id } });
  return { template_id: id };
}
