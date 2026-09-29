/** Bounded image geometry shared by inspector and canvas controls. */
import { isInterfaceBlock } from './interfaces.mjs';
export const IMAGE_SIZE_LIMITS = Object.freeze({ minWidth: 25, maxWidth: 100, minHeight: 80, maxHeight: 1200 });

export function imageSizeOf(owner) {
  return { width: owner?.imageSize?.width ?? 100, height: owner?.imageSize?.height ?? null, fit: owner?.imageSize?.fit ?? 'cover' };
}

function productImageItem(section, item) {
  return Boolean(item && (section.block === 'app-storefront' || ['app-checkout', 'app-workspace'].includes(section.block) && item.uiType === 'product'));
}
export function supportsProductImage(section, itemId) {
  return productImageItem(section, section?.items?.find((item) => item.id === itemId));
}

export function imageOwner(section, itemId) {
  if (!section) return null;
  if (itemId !== undefined && itemId !== null) {
    const item = section.items?.find((entry) => entry.id === itemId);
    if (!item) return null;
    if (section.group === 'gallery') return item;
    return productImageItem(section, item) && item.image ? item : null;
  }
  if (isInterfaceBlock(section)) return null;
  return (section.group === 'hero' && section.block !== 'hero-centered') || (section.group === 'about' && section.block === 'about-split') ? section : null;
}
