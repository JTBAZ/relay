import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { PrismaClient } from "@prisma/client";
import type { RelayPageLayoutStore } from "./layout-store.js";
import type { PageLayout, PageSection } from "./types.js";

function defaultLayout(creatorId: string): PageLayout {
  return {
    creator_id: creatorId,
    theme: { color_scheme: "dark" },
    sections: [],
    updated_at: new Date().toISOString()
  };
}

export class DbPageLayoutStore implements RelayPageLayoutStore {
  public constructor(private readonly prisma: PrismaClient) {}

  public async load(creatorId: string): Promise<PageLayout> {
    const row = await this.prisma.pageLayout.findUnique({ where: { creatorId } });
    if (!row) {
      return defaultLayout(creatorId);
    }
    const layout = row.layoutJson as unknown as PageLayout;
    layout.creator_id = creatorId;
    layout.updated_at = row.updatedAt.toISOString();
    return layout;
  }

  public async save(creatorId: string, layout: PageLayout): Promise<void> {
    layout.updated_at = new Date().toISOString();
    const json = layout as unknown as Prisma.InputJsonValue;
    await this.prisma.pageLayout.upsert({
      where: { creatorId },
      create: {
        creatorId,
        layoutJson: json,
        version: 1
      },
      update: {
        layoutJson: json,
        version: { increment: 1 }
      }
    });
  }

  public async addSection(
    creatorId: string,
    section: Omit<PageSection, "section_id" | "sort_order">
  ): Promise<PageSection> {
    const layout = await this.load(creatorId);
    const maxOrder = layout.sections.reduce((m, s) => Math.max(m, s.sort_order), -1);
    const full: PageSection = {
      ...section,
      section_id: `sec_${randomUUID()}`,
      sort_order: maxOrder + 1
    };
    layout.sections.push(full);
    await this.save(creatorId, layout);
    return full;
  }

  public async updateSection(
    creatorId: string,
    sectionId: string,
    patch: Partial<Omit<PageSection, "section_id">>
  ): Promise<PageSection | null> {
    const layout = await this.load(creatorId);
    const sec = layout.sections.find((s) => s.section_id === sectionId);
    if (!sec) {
      return null;
    }
    if (patch.title !== undefined) {
      sec.title = patch.title;
    }
    if (patch.source !== undefined) {
      sec.source = patch.source;
    }
    if (patch.layout !== undefined) {
      sec.layout = patch.layout;
    }
    if (patch.columns !== undefined) {
      sec.columns = patch.columns;
    }
    if (patch.max_items !== undefined) {
      sec.max_items = patch.max_items;
    }
    if (patch.sort_order !== undefined) {
      sec.sort_order = patch.sort_order;
    }
    await this.save(creatorId, layout);
    return sec;
  }

  public async removeSection(creatorId: string, sectionId: string): Promise<boolean> {
    const layout = await this.load(creatorId);
    const idx = layout.sections.findIndex((s) => s.section_id === sectionId);
    if (idx < 0) {
      return false;
    }
    layout.sections.splice(idx, 1);
    await this.save(creatorId, layout);
    return true;
  }

  public async reorderSections(creatorId: string, orderedIds: string[]): Promise<void> {
    const layout = await this.load(creatorId);
    for (let i = 0; i < orderedIds.length; i++) {
      const sec = layout.sections.find((s) => s.section_id === orderedIds[i]);
      if (sec) {
        sec.sort_order = i;
      }
    }
    layout.sections.sort((a, b) => a.sort_order - b.sort_order);
    await this.save(creatorId, layout);
  }
}
