import { describe, expect, it, vi } from "vitest";
import {
  createPostTemplate,
  deletePostTemplate,
  normalizePostTemplateTags,
  PostTemplateNotFoundError,
  PostTemplateValidationError,
  renderPostTemplateBody,
  updatePostTemplate
} from "../src/distribution/post-template-service.js";

function prismaStub(over: Record<string, unknown>) {
  return over as any;
}

describe("post-template-service", () => {
  it("normalizes and dedupes template tags", () => {
    expect(normalizePostTemplateTags([" Art ", "art", "#Comic", ""])).toEqual(["Art", "#Comic"]);
  });

  it("renders template placeholders", () => {
    expect(
      renderPostTemplateBody("Page: {{title}}\nTags: {{tags}}", {
        title: "Chapter 5",
        tags: ["comic", "wip"]
      })
    ).toBe("Page: Chapter 5\nTags: comic, wip");
  });

  it("rejects create when name or body is missing", async () => {
    const prisma = prismaStub({ postTemplate: { create: vi.fn() } });
    await expect(
      createPostTemplate(prisma, "cr1", { name: " ", body: "hello" })
    ).rejects.toBeInstanceOf(PostTemplateValidationError);
    await expect(
      createPostTemplate(prisma, "cr1", { name: "Intro", body: " " })
    ).rejects.toBeInstanceOf(PostTemplateValidationError);
    expect(prisma.postTemplate.create).not.toHaveBeenCalled();
  });

  it("updates an owned template", async () => {
    const now = new Date("2026-07-06T12:00:00.000Z");
    const prisma = prismaStub({
      postTemplate: {
        findFirst: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "Old",
          body: "Body",
          tags: [],
          createdAt: now,
          updatedAt: now
        }),
        update: vi.fn().mockResolvedValue({
          id: "tpl1",
          creatorId: "cr1",
          name: "New",
          body: "Body",
          tags: ["comic"],
          createdAt: now,
          updatedAt: now
        })
      }
    });

    const result = await updatePostTemplate(prisma, "cr1", "tpl1", {
      name: "New",
      tags: ["comic"]
    });
    expect(result.name).toBe("New");
    expect(result.tags).toEqual(["comic"]);
  });

  it("throws when updating a template owned by another creator", async () => {
    const prisma = prismaStub({
      postTemplate: { findFirst: vi.fn().mockResolvedValue(null) }
    });
    await expect(
      updatePostTemplate(prisma, "cr1", "tpl1", { name: "New" })
    ).rejects.toBeInstanceOf(PostTemplateNotFoundError);
  });

  it("deletes an owned template", async () => {
    const prisma = prismaStub({
      postTemplate: {
        findFirst: vi.fn().mockResolvedValue({ id: "tpl1" }),
        delete: vi.fn().mockResolvedValue({ id: "tpl1" })
      }
    });
    await expect(deletePostTemplate(prisma, "cr1", "tpl1")).resolves.toEqual({
      template_id: "tpl1"
    });
    expect(prisma.postTemplate.delete).toHaveBeenCalledWith({ where: { id: "tpl1" } });
  });
});
