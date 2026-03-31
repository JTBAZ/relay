import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";
import type { PageLayout, PageLayoutRoot, PageSection } from "./types.js";

function emptyRoot(): PageLayoutRoot {
  return { layouts: {} };
}

function defaultLayout(creatorId: string): PageLayout {
  return {
    creator_id: creatorId,
    theme: { color_scheme: "dark" },
    sections: [],
    updated_at: new Date().toISOString()
  };
}

export class FilePageLayoutStore {
  private readonly filePath: string;

  public constructor(filePath: string) {
    this.filePath = filePath;
  }

  private async loadRoot(): Promise<PageLayoutRoot> {
    try {
      const raw = await readFile(this.filePath, "utf8");
      return JSON.parse(raw) as PageLayoutRoot;
    } catch {
      return emptyRoot();
    }
  }

  private async saveRoot(root: PageLayoutRoot): Promise<void> {
    await mkdir(dirname(this.filePath), { recursive: true });
    await writeFile(this.filePath, JSON.stringify(root, null, 2), "utf8");
  }

  public async load(creatorId: string): Promise<PageLayout> {
    const root = await this.loadRoot();
    return root.layouts[creatorId] ?? defaultLayout(creatorId);
  }

  public async save(creatorId: string, layout: PageLayout): Promise<void> {
    const root = await this.loadRoot();
    layout.updated_at = new Date().toISOString();
    root.layouts[creatorId] = layout;
    await this.saveRoot(root);
  }

  public async addSection(
    creatorId: string,
    section: Omit<PageSection, "section_id" | "sort_order">
  ): Promise<PageSection> {
    const root = await this.loadRoot();
    const layout = root.layouts[creatorId] ?? defaultLayout(creatorId);
    const maxOrder = layout.sections.reduce((m, s) => Math.max(m, s.sort_order), -1);
    const full: PageSection = {
      ...section,
      section_id: `sec_${randomUUID()}`,
      sort_order: maxOrder + 1
    };
    layout.sections.push(full);
    layout.updated_at = new Date().toISOString();
    root.layouts[creatorId] = layout;
    await this.saveRoot(root);
    return full;
  }

  public async updateSection(
    creatorId: string,
    sectionId: string,
    patch: Partial<Omit<PageSection, "section_id">>
  ): Promise<PageSection | null> {
    const root = await this.loadRoot();
    const layout = root.layouts[creatorId];
    if (!layout) return null;
    const sec = layout.sections.find((s) => s.section_id === sectionId);
    if (!sec) return null;
    if (patch.title !== undefined) sec.title = patch.title;
    if (patch.source !== undefined) sec.source = patch.source;
    if (patch.layout !== undefined) sec.layout = patch.layout;
    if (patch.columns !== undefined) sec.columns = patch.columns;
    if (patch.max_items !== undefined) sec.max_items = patch.max_items;
    if (patch.sort_order !== undefined) sec.sort_order = patch.sort_order;
    layout.updated_at = new Date().toISOString();
    await this.saveRoot(root);
    return sec;
  }

  public async removeSection(creatorId: string, sectionId: string): Promise<boolean> {
    const root = await this.loadRoot();
    const layout = root.layouts[creatorId];
    if (!layout) return false;
    const idx = layout.sections.findIndex((s) => s.section_id === sectionId);
    if (idx < 0) return false;
    layout.sections.splice(idx, 1);
    layout.updated_at = new Date().toISOString();
    await this.saveRoot(root);
    return true;
  }

  public async reorderSections(creatorId: string, orderedIds: string[]): Promise<void> {
    const root = await this.loadRoot();
    const layout = root.layouts[creatorId];
    if (!layout) return;
    for (let i = 0; i < orderedIds.length; i++) {
      const sec = layout.sections.find((s) => s.section_id === orderedIds[i]);
      if (sec) sec.sort_order = i;
    }
    layout.sections.sort((a, b) => a.sort_order - b.sort_order);
    layout.updated_at = new Date().toISOString();
    await this.saveRoot(root);
  }
}
