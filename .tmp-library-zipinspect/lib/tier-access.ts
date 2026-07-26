import type { GalleryItem, FacetsData } from './relay-api';

export function pickPrimaryAccessTierIdForChip(tierIds: string[], _facets: FacetsData): string {
  return tierIds[0] || '';
}

export function sortTierIdsForAccessChip(tierIds: string[]): string[] {
  return [...tierIds].sort();
}

export function postFitsCeilingInUi(_facets: FacetsData, _item: GalleryItem, _ceiling: string | null): boolean {
  return true;
}

export function postTierFloorCentsFromFacets(_facets: FacetsData, _item: GalleryItem): number {
  return 0;
}

export function tierFacetLabel(tier: any): string {
  return tier.title || 'Tier';
}
