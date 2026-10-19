import { createHash } from 'node:crypto';
import { REAL_LIBRARY_SUPPORTED_FIELDS, type LargeRealLibrarySnapshot, type RealLibraryPost } from './library-selection-catalog.js';

function isoDay(day: number): string { return `2026-09-${String(day).padStart(2, '0')}`; }

/** Fixed synthetic 40/1,001-post snapshots plus isolated opt-in gallery allowance profiles. */
export function createMockLargeLibrarySnapshot(count: 40|1001, profile?: 'compact'|'wide_vocab'): LargeRealLibrarySnapshot;
export function createMockLargeLibrarySnapshot(count: 100|500, profile: 'gallery_allowance'): LargeRealLibrarySnapshot;
export function createMockLargeLibrarySnapshot(count: 40|1001|100|500, profile: 'compact'|'wide_vocab'|'gallery_allowance' = 'compact'): LargeRealLibrarySnapshot {
  if (profile === 'gallery_allowance') {
    if (count !== 100 && count !== 500) throw new Error('The gallery allowance profile supports 100 or 500 synthetic posts.');
    return createGalleryAllowanceSnapshot(count);
  }
  if (count !== 40 && count !== 1001) throw new Error('The compact and wide vocabulary profiles support 40 or 1,001 synthetic posts.');
  const posts: RealLibraryPost[] = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const postId = `large_post_${String(index).padStart(4, '0')}`;
    const currentCoast = [5, 7, 35, 740, 750, 739, 1000].includes(index);
    const previousCoast = [8, 738].includes(index);
    const draftCoast = [9, 737].includes(index);
    const sketch = [6, 740, 1000].includes(index);
    const citySeries = [10, 740, 750, 999].includes(index);
    const wonderWoman = [11, 1000, 1001].includes(index);
    const isDraft = index === 40 || draftCoast;
    const isVideo = [7, 739].includes(index);
    const title = `Artwork study ${index}`;
    const wideTags = profile === 'wide_vocab' && index <= 40
      ? Array.from({ length: 96 }, (_, tagIndex) => tagIndex).filter(tagIndex => tagIndex % 40 === index - 1).map(tagIndex => `aaa_${String(tagIndex).padStart(3, '0')}`)
      : [];
    const twinLantern = profile === 'wide_vocab' && (index === 12 || index === 13);
    const seriesId = twinLantern ? (index === 12 ? 'series_twin_a' : 'series_twin_b') : citySeries ? 'series_city_heroes' : null;
    const seriesTitle = twinLantern ? 'Twin Lantern' : citySeries ? 'City of Heroes' : null;
    return {
      postId,
      title,
      descriptionText: wonderWoman ? (index === 1001 ? 'Long synthetic notes '.repeat(410) + 'Wonder Woman shoreline study' : 'Wonder Woman synthetic study notes') : `Synthetic artwork notes ${index}`,
      tags: [...wideTags, ...(currentCoast || previousCoast || draftCoast ? ['coastal'] : []), ...(sketch ? ['sketch'] : []), 'character'],
      createdAt: isoDay((index % 28) + 1),
      publishedAt: isDraft ? null : currentCoast ? `2026-10-${String((index % 28) + 1).padStart(2, '0')}` : isoDay((index % 28) + 1),
      publishState: isDraft ? 'draft' : 'published',
      workId: 'work_study',
      workTitle: 'Study work',
      seriesId,
      seriesTitle,
      collectionIds: ['collection_study'],
      collections: [{ id: 'collection_study', title: 'Study collection' }],
      media: [{ id: `large_media_${index}`, mimeType: isVideo ? 'video/mp4' : 'image/png', role: 'main', processingStatus: 'READY' }]
    };
  });
  const revisionKey = profile === 'wide_vocab' ? `mock-large-library-wide-vocab-v1:${count}` : `mock-large-library-v1:${count}`;
  const catalogRevision = createHash('sha256').update(revisionKey).digest('hex');
  return { scope: 'real_library_retrieval', catalogRevision, complete: true, supportedFields: REAL_LIBRARY_SUPPORTED_FIELDS, timezone: 'Europe/London', posts };
}

function createGalleryAllowanceSnapshot(count: 100|500): LargeRealLibrarySnapshot {
  const currentCoast = new Set([5, 7, 35, 95, 498]);
  const previousCoast = new Set([8, 98]);
  const draftCoast = new Set([9, 97]);
  const sketches = new Set([6, 40, 100, 490]);
  const videos = new Set([7, 97, 489]);
  const citySeries = new Set([10, 150, 490, 499]);
  const wonderWoman = new Set([11, 100, 450, 500]);
  const twinSeries = new Map<number, { id: string; title: string }>([
    [12, { id: 'gallery_series_twin_a', title: 'Twin Lantern' }],
    [13, { id: 'gallery_series_twin_b', title: 'twin lantern' }]
  ]);
  const posts: RealLibraryPost[] = Array.from({ length: count }, (_, offset) => {
    const index = offset + 1;
    const postId = `gallery_${String(index).padStart(3, '0')}`;
    const workId = `00000000-0000-4000-8000-${String(index).padStart(12, '0')}`;
    const workTitle = `Synthetic Gallery Work ${String(index).padStart(4, '0')} — moonlight study`;
    const series = twinSeries.get(index) ?? (citySeries.has(index)
      ? { id: 'series_city_heroes', title: 'City of Heroes' }
      : { id: `gallery_series_${String(((index - 1) % 49) + 1).padStart(2, '0')}`, title: `Gallery Series ${String(((index - 1) % 49) + 1).padStart(2, '0')}` });
    const collectionNumber = ((index - 1) % 5) + 1;
    const collection = { id: `gallery_collection_${collectionNumber}`, title: `Gallery Collection ${collectionNumber}` };
    const isDraft = index === 40 || draftCoast.has(index) || index === 420;
    const isCoastal = currentCoast.has(index) || previousCoast.has(index) || draftCoast.has(index);
    const tags = [
      ...(index <= 100 ? [`gallery_tag_${String((index - 1) % 80).padStart(2, '0')}`] : []),
      ...(isCoastal ? ['coastal'] : []),
      ...(sketches.has(index) ? ['sketch'] : []),
      'character'
    ];
    const publishedAt = isDraft ? null : currentCoast.has(index) ? `2026-10-${String((index % 28) + 1).padStart(2, '0')}` : isoDay((index % 28) + 1);
    return {
      postId,
      title: `Gallery Artwork ${index}`,
      descriptionText: wonderWoman.has(index) ? (index === 500 ? 'Long synthetic artwork notes '.repeat(360) + 'Wonder Woman shoreline study' : 'Wonder Woman synthetic gallery notes') : `Synthetic gallery description ${index}`,
      tags,
      createdAt: isoDay((index % 28) + 1),
      publishedAt,
      publishState: isDraft ? 'draft' : 'published',
      workId,
      workTitle,
      seriesId: series.id,
      seriesTitle: series.title,
      collectionIds: [collection.id],
      collections: [collection],
      media: [{ id: `gallery_media_${index}`, mimeType: videos.has(index) ? 'video/mp4' : 'image/png', role: 'main', processingStatus: 'READY' }]
    };
  });
  const catalogRevision = createHash('sha256').update(`mock-gallery-allowance-v1:${count}`).digest('hex');
  return { scope: 'real_library_retrieval', catalogRevision, complete: true, supportedFields: REAL_LIBRARY_SUPPORTED_FIELDS, timezone: 'Europe/London', posts };
}
