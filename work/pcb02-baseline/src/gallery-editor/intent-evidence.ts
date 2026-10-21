import type { EditorReadToolName, EditorReadToolResult } from './intent.js';
import type { NamingProvenance, ResolvedPost } from './types.js';

type Scope = 'post' | 'work' | 'series' | 'collection' | 'media';
type Row = Record<string, unknown>;
const row = (value: unknown): Row => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Row : {};
const list = (value: unknown): unknown[] => Array.isArray(value) ? value : [];
const strings = (value: unknown): string[] => list(value).filter((v): v is string => typeof v === 'string' && v.length > 0);
const id = (value: unknown): string | undefined => typeof value === 'string' && value.length > 0 ? value : undefined;
interface Page { ids: string[]; total: number; hasMore: boolean; nextCursor: string | null }
interface Retrieval { tool: EditorReadToolName; key: string; pages: Map<string, Page>; complete: boolean; ids: string[]; total?: number }
interface Media { mediaId: string; postIds: string[]; inspected: boolean; mimeType?: string | null; role?: string | null; processingStatus?: string; unsupportedReason?: string }
interface Collection { id: string; title?: string; postIds: string[]; totalPosts?: number; membershipComplete: boolean }

/** Turn-local evidence. Only pass successful, creator-authorized read results, never model JSON.
 * Text is untrusted data; this catalog establishes identity/relationships, not user intent.
 */
export class IntentEvidence {
  private posts = new Map<string, Pick<ResolvedPost, 'postId' | 'title' | 'mediaIds' | 'tags' | 'naming'>>();
  private targets: Record<Scope, Set<string>> = { post: new Set(), work: new Set(), series: new Set(), collection: new Set(), media: new Set() };
  private media = new Map<string, Media>();
  private collections = new Map<string, Collection>();
  private retrievals = new Map<string, Retrieval>();
  private completeFamilies = { work: new Set<string>(), series: new Set<string>() };
  private missingPosts = new Set<string>();
  private missingMedia = new Set<string>();
  private unsupported = new Map<string, string>();
  private postMedia = new Map<string, Set<string>>();

  hasTarget(scope: Scope, targetId: string): boolean { return this.targets[scope].has(targetId); }
  familyComplete(scope: 'work' | 'series', targetId: string): boolean { return this.completeFamilies[scope].has(targetId); }
  inspected(mediaId: string): boolean { return this.media.get(mediaId)?.inspected === true; }
  mediaPostIds(mediaId: string): string[] { return [...new Set([...(this.media.get(mediaId)?.postIds ?? []), ...(this.postMedia.get(mediaId) ?? [])])]; }
  collectionComplete(collectionId: string): boolean { return this.collections.get(collectionId)?.membershipComplete === true; }
  collectionPostIds(collectionId: string): string[] { return [...(this.collections.get(collectionId)?.postIds ?? [])]; }

  private post(value: unknown): string | undefined {
    const p = row(value), postId = id(p.postId);
    if (!postId) return;
    this.missingPosts.delete(postId);
    this.targets.post.add(postId);
    const n = row(p.naming);
    // Copy only canonical fields; URLs, descriptions, images and arbitrary tool payloads stay out.
    const naming = Object.fromEntries(['mode', 'effectiveTitle', 'sourceTitle', 'workId', 'workTitle', 'workTitleMode', 'seriesId', 'seriesTitle', 'partLabel', 'exception']
      .filter(k => typeof n[k] === 'string' || (k === 'exception' && typeof n[k] === 'boolean')).map(k => [k, n[k]])) as unknown as NamingProvenance;
    this.posts.set(postId, { postId, title: typeof p.title === 'string' ? p.title : '', mediaIds: strings(p.mediaIds), tags: strings(p.tags), naming });
    for (const mediaId of strings(p.mediaIds)) {
      this.targets.media.add(mediaId);
      const related = this.postMedia.get(mediaId) ?? new Set<string>();
      related.add(postId); this.postMedia.set(mediaId, related);
    }
    if (id(n.workId)) this.targets.work.add(n.workId as string);
    if (id(n.seriesId)) this.targets.series.add(n.seriesId as string);
    return postId;
  }

  private page(tool: EditorReadToolName, key: string, args: Row, data: Row, itemIds: string[]): Retrieval {
    const signature = JSON.stringify([tool, key]);
    let retrieval = this.retrievals.get(signature);
    if (!retrieval) { retrieval = { tool, key, pages: new Map(), complete: false, ids: [] }; this.retrievals.set(signature, retrieval); }
    // Missing pagination metadata can never establish completeness.
    if (Number.isSafeInteger(data.total) && Number(data.total) >= 0 && typeof data.hasMore === 'boolean' && (data.nextCursor === null || typeof data.nextCursor === 'string')) {
      retrieval.pages.set(id(args.cursor) ?? '', { ids: itemIds, total: Number(data.total), hasMore: data.hasMore, nextCursor: data.nextCursor as string | null });
    }
    retrieval.complete = false;
    const seen = new Set<string>(), all = new Set<string>();
    let cursor = '', total: number | undefined;
    while (!seen.has(cursor)) {
      seen.add(cursor);
      const page = retrieval.pages.get(cursor);
      if (!page || (total !== undefined && page.total !== total)) break;
      total = page.total;
      page.ids.forEach(v => all.add(v));
      if (!page.hasMore) { retrieval.complete = page.nextCursor === null && all.size === total; break; }
      if (!page.nextCursor) break;
      cursor = page.nextCursor;
    }
    retrieval.ids = [...all]; retrieval.total = total;
    return retrieval;
  }

  record(name: EditorReadToolName, args: Record<string, unknown>, result: EditorReadToolResult): void {
    const data = row(result.data);
    if (name === 'resolveLibraryPosts') {
      list(data.resolvedPosts).forEach(p => this.post(p));
      strings(data.missingPostIds).forEach(v => this.missingPosts.add(v));
    } else if (name === 'searchLibraryPosts' || name === 'expandLibraryFamily' || (name === 'readLibraryCollections' && id(args.collectionId))) {
      const postIds = list(data.items).flatMap(p => { const found = this.post(p); return found ? [found] : []; });
      const key = name === 'searchLibraryPosts' ? String(args.query ?? '') : name === 'expandLibraryFamily' ? JSON.stringify([args.kind, args.id]) : String(args.collectionId);
      const retrieval = this.page(name, key, args, data, postIds);
      if (name === 'expandLibraryFamily') {
        const target = row(data.target);
        if ((target.kind === 'post' || target.kind === 'work' || target.kind === 'series') && id(target.id)) this.targets[target.kind].add(target.id as string);
        strings(data.workIds).forEach(v => this.targets.work.add(v));
        if (id(data.seriesId)) this.targets.series.add(data.seriesId as string);
        if(!retrieval.complete){
          strings(data.workIds).forEach(v=>this.completeFamilies.work.delete(v));
          if(id(data.seriesId))this.completeFamilies.series.delete(data.seriesId as string);
          for(const postId of retrieval.ids){const n=this.posts.get(postId)?.naming;if(n?.workId)this.completeFamilies.work.delete(n.workId);if(n?.seriesId)this.completeFamilies.series.delete(n.seriesId);}
        }
        if (retrieval.complete) {
          const workIds = new Set(strings(data.workIds));
          const seriesIds = new Set<string>(id(data.seriesId) ? [data.seriesId as string] : []);
          for (const postId of retrieval.ids) {
            const n = this.posts.get(postId)?.naming;
            if (n?.workId) workIds.add(n.workId);
            if (n?.seriesId) seriesIds.add(n.seriesId);
          }
          workIds.forEach(v => this.completeFamilies.work.add(v));
          seriesIds.forEach(v => this.completeFamilies.series.add(v));
        }
      } else if (name === 'readLibraryCollections') {
        const collectionId = String(args.collectionId);
        this.targets.collection.add(collectionId);
        this.collections.set(collectionId, { ...this.collections.get(collectionId), id: collectionId, postIds: retrieval.ids, totalPosts: retrieval.total, membershipComplete: retrieval.complete });
      }
    } else if (name === 'readLibraryCollections') {
      const collectionIds: string[] = [];
      for (const value of list(data.items)) {
        const c = row(value), collectionId = id(c.id);
        if (!collectionId) continue;
        collectionIds.push(collectionId); this.targets.collection.add(collectionId);
        const postIds = strings(c.postIds); postIds.forEach(v => this.targets.post.add(v));
        this.collections.set(collectionId, { id: collectionId, title: typeof c.title === 'string' ? c.title : undefined, postIds,
          totalPosts: typeof c.totalPosts === 'number' ? c.totalPosts : undefined, membershipComplete: c.membershipComplete === true && c.totalPosts === postIds.length });
      }
      this.page(name, 'collections', args, data, collectionIds);
    } else if (name === 'readLibraryMedia') {
      for (const value of list(data.items)) {
        const m = row(value), mediaId = id(m.mediaId);
        if (!mediaId) continue;
        this.missingMedia.delete(mediaId);
        this.targets.media.add(mediaId);
        const postIds = strings(m.postIds); postIds.forEach(v => this.targets.post.add(v));
        const entry: Media = { mediaId, postIds, inspected: this.inspected(mediaId) };
        for (const field of ['mimeType', 'role', 'processingStatus'] as const) if (typeof m[field] === 'string') entry[field] = m[field];
        if (id(m.imageUnsupportedReason)) entry.unsupportedReason = m.imageUnsupportedReason as string;
        this.media.set(mediaId, entry);
      }
      strings(data.missingMediaIds).forEach(v => this.missingMedia.add(v));
    } else if (name === 'resolveLibraryImageReferences') {
      for (const image of result.images ?? []) {
        if (!id(image.mediaId)) continue;
        this.unsupported.delete(image.mediaId);
        this.missingMedia.delete(image.mediaId);
        this.targets.media.add(image.mediaId);
        const previous = this.media.get(image.mediaId);
        const postIds = [...new Set([...(previous?.postIds ?? []), ...(id(image.postId) ? [image.postId!] : [])])];
        postIds.forEach(v => this.targets.post.add(v));
        this.media.set(image.mediaId, { ...previous, mediaId: image.mediaId, postIds, inspected: true });
      }
      for (const value of list(data.unsupported)) {
        const u = row(value);
        if (id(u.mediaId) && id(u.reason)) this.unsupported.set(u.mediaId as string, u.reason as string);
      }
    }
  }

  compact() {
    return structuredClone({ posts: [...this.posts.values()], works: [...this.targets.work].map(id => ({ id, familyComplete: this.familyComplete('work', id) })),
      series: [...this.targets.series].map(id => ({ id, familyComplete: this.familyComplete('series', id) })), collections: [...this.collections.values()], media: [...this.targets.media].map(mediaId=>({...this.media.get(mediaId),mediaId,postIds:this.mediaPostIds(mediaId),inspected:this.inspected(mediaId)})),
      retrievals: [...this.retrievals.values()].map(r => ({ tool: r.tool, key: r.key, total: r.total, retrievedIds: r.ids, complete: r.complete })),
      missingPostIds: [...this.missingPosts], missingMediaIds: [...this.missingMedia], unsupported: [...this.unsupported].map(([mediaId, reason]) => ({ mediaId, reason })) });
  }
}
