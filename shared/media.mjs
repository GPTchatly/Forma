/** Bounded image geometry shared by inspector and canvas controls. */
import { isInterfaceBlock } from './interfaces.mjs';
import { EXPANSION_BY_ID } from './expansion.mjs';
import { MANIFEST_BY_ID } from './blocks.mjs';
export const IMAGE_SIZE_LIMITS = Object.freeze({ minWidth: 25, maxWidth: 100, minHeight: 80, maxHeight: 1200 });

export function imageSizeOf(owner) {
  return { width: owner?.imageSize?.width ?? 100, height: owner?.imageSize?.height ?? null, fit: owner?.imageSize?.fit ?? 'cover' };
}

function productImageItem(section, item) {
  return Boolean(item && (['app-storefront', 'app-product'].includes(section.block) || ['app-checkout', 'app-workspace'].includes(section.block) && item.uiType === 'product'));
}
export function supportsProductImage(section, itemId) {
  return productImageItem(section, section?.items?.find((item) => item.id === itemId));
}

export function imageOwner(section, itemId) {
  if (!section) return null;
  if (itemId !== undefined && itemId !== null) {
    const item = section.items?.find((entry) => entry.id === itemId);
    if (!item) return null;
    if (MANIFEST_BY_ID[section.block]) return MANIFEST_BY_ID[section.block].media === 'item' ? item : null;
    if (section.group === 'gallery' || EXPANSION_BY_ID[section.block] && (['team', 'logos'].includes(section.group) || ['tabs', 'alternating', 'expand-grid', 'collage', 'tour', 'product'].includes(EXPANSION_BY_ID[section.block].behavior))) return item;
    return productImageItem(section, item) && item.image ? item : null;
  }
  if (isInterfaceBlock(section)) return null;
  if (MANIFEST_BY_ID[section.block]) return MANIFEST_BY_ID[section.block].media === 'section' ? section : null;
  if (EXPANSION_BY_ID[section.block]) return ['cover', 'halves', 'browser', 'phone', 'layers', 'image-cta'].includes(EXPANSION_BY_ID[section.block].behavior) ? section : null;
  return (section.group === 'hero' && section.block !== 'hero-centered') || (section.group === 'about' && section.block === 'about-split') ? section : null;
}
