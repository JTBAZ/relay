import type { Prisma, PrismaClient } from "@prisma/client";
import {
  MAX_CUSTOM_PREVIEW_TEMPLATES,
  MAX_PREVIEW_TEMPLATE_NAME_LENGTH,
  parsePreviewTemplateConfig,
  PreviewTemplateConfigError,
  type PreviewTemplateConfigV1
} from "./preview-template-config.js";

export type PreviewTemplateWire = {
  template_id: string;
  creator_id: string;
  name: string;
  config: PreviewTemplateConfigV1;
  created_at: string;
  updated_at: string;
};

export type PreviewTemplateCreateInput = {
  name: string;
  config: unknown;
  /** When at capacity, overwrite this owned template instead of creating. */
  replaceTemplateId?: string | null;
};

export type PreviewTemplateUpdateInput = {
  name?: string;
  config?: unknown;
};

export class PreviewTemplateValidationError extends Error {
  public override readonly name = "PreviewTemplateValidationError";
  public constructor(
    message: string,
    public readonly details: Array<{ field: string; issue: string }>
  ) {
    super(message);
  }
}

export class PreviewTemplateNotFoundError extends Error {
  public override readonly name = "PreviewTemplateNotFoundError";
  public constructor(public readonly templateId: string) {
    super(`Preview template not found: ${templateId}`);
  }
}

export { MAX_CUSTOM_PREVIEW_TEMPLATES };

function mapRow(row: {
  id: string;
  creatorId: string;
  name: string;
  config: unknown;
  createdAt: Date;
  updatedAt: Date;
}): PreviewTemplateWire {
  return {
    template_id: row.id,
    creator_id: row.creatorId,
    name: row.name,
    config: parsePreviewTemplateConfig(row.config),
    created_at: row.createdAt.toISOString(),
    updated_at: row.updatedAt.toISOString()
  };
}

function validateName(name: string): string {
  const trimmed = name.trim();
  const details: Array<{ field: string; issue: string }> = [];
  if (!trimmed) details.push({ field: "name", issue: "required" });
  if (trimmed.length > MAX_PREVIEW_TEMPLATE_NAME_LENGTH) {
    details.push({ field: "name", issue: "too_long" });
  }
  if (details.length > 0) {
    throw new PreviewTemplateValidationError("Invalid preview template.", details);
  }
  return trimmed;
}

function validateConfig(raw: unknown): PreviewTemplateConfigV1 {
  try {
    return parsePreviewTemplateConfig(raw);
  } catch (err) {
    if (err instanceof PreviewTemplateConfigError) {
      throw new PreviewTemplateValidationError(err.message, err.details);
    }
    throw err;
  }
}

export async function listPreviewTemplates(
  prisma: PrismaClient,
  creatorId: string
): Promise<PreviewTemplateWire[]> {
  const rows = await prisma.creatorPreviewTemplate.findMany({
    where: { creatorId: creatorId.trim() },
    orderBy: [{ updatedAt: "desc" }, { name: "asc" }]
  });
  return rows.map(mapRow);
}

export async function createPreviewTemplate(
  prisma: PrismaClient,
  creatorId: string,
  input: PreviewTemplateCreateInput
): Promise<PreviewTemplateWire> {
  const name = validateName(input.name ?? "");
  const config = validateConfig(input.config);
  const cid = creatorId.trim();
  const replaceId = input.replaceTemplateId?.trim() || null;

  if (replaceId) {
    const existing = await prisma.creatorPreviewTemplate.findFirst({
      where: { id: replaceId, creatorId: cid }
    });
    if (!existing) throw new PreviewTemplateNotFoundError(replaceId);
    const row = await prisma.creatorPreviewTemplate.update({
      where: { id: replaceId },
      data: {
        name,
        config: config as unknown as Prisma.InputJsonValue
      }
    });
    return mapRow(row);
  }

  const count = await prisma.creatorPreviewTemplate.count({ where: { creatorId: cid } });
  if (count >= MAX_CUSTOM_PREVIEW_TEMPLATES) {
    throw new PreviewTemplateValidationError(
      `At most ${MAX_CUSTOM_PREVIEW_TEMPLATES} preview templates per creator.`,
      [{ field: "templates", issue: "max_count" }]
    );
  }

  const row = await prisma.creatorPreviewTemplate.create({
    data: {
      creatorId: cid,
      name,
      config: config as unknown as Prisma.InputJsonValue
    }
  });
  return mapRow(row);
}

export async function updatePreviewTemplate(
  prisma: PrismaClient,
  creatorId: string,
  templateId: string,
  input: PreviewTemplateUpdateInput
): Promise<PreviewTemplateWire> {
  const id = templateId.trim();
  const existing = await prisma.creatorPreviewTemplate.findFirst({
    where: { id, creatorId: creatorId.trim() }
  });
  if (!existing) throw new PreviewTemplateNotFoundError(id);

  const data: { name?: string; config?: Prisma.InputJsonValue } = {};
  if (input.name !== undefined) {
    data.name = validateName(input.name);
  }
  if (input.config !== undefined) {
    data.config = validateConfig(input.config) as unknown as Prisma.InputJsonValue;
  }
  if (Object.keys(data).length === 0) {
    throw new PreviewTemplateValidationError("No fields to update.", [
      { field: "config", issue: "no_changes" }
    ]);
  }

  const row = await prisma.creatorPreviewTemplate.update({
    where: { id },
    data
  });
  return mapRow(row);
}

export async function deletePreviewTemplate(
  prisma: PrismaClient,
  creatorId: string,
  templateId: string
): Promise<{ template_id: string }> {
  const id = templateId.trim();
  const existing = await prisma.creatorPreviewTemplate.findFirst({
    where: { id, creatorId: creatorId.trim() },
    select: { id: true }
  });
  if (!existing) throw new PreviewTemplateNotFoundError(id);

  await prisma.creatorPreviewTemplate.delete({ where: { id } });
  return { template_id: id };
}
