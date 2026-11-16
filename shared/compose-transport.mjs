/** Hosted composition keeps uploaded raster bytes in the browser. The server
 * receives only a fixed image-presence marker, never a user image or image URL. */
import { validateCompose, validateSpec, ValidationError } from './schema.mjs';
import { HOME_PAGE_ID } from './pages.mjs';

// Original transparent 1 x 1 RGBA PNG. This reserved transport value passes the
// same raster validation as ordinary images while conveying presence only.
export const IMAGE_PLACEHOLDER = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR4nGNgAAIAAAUAAXpeqz8AAAAASUVORK5CYII=';

function visitImages(spec, visit) {
  for (const page of [{ id: HOME_PAGE_ID, sections: spec.sections }, ...(spec.pages || [])]) {
    for (const section of page.sections) {
      visit(section, JSON.stringify([page.id, section.id, 'section']));
      for (const item of section.items) visit(item, JSON.stringify([page.id, section.id, 'item', item.id]));
    }
  }
}

export function validateTransportImages(rawSpec) {
  const spec = validateSpec(rawSpec);
  visitImages(spec, (owner) => {
    if (owner.image !== '' && owner.image !== IMAGE_PLACEHOLDER) throw new ValidationError('Hosted composition accepts image-presence markers only. Uploaded images must remain in your browser.');
  });
  return spec;
}

export function prepareComposeRequest(data) {
  // Validate the real images before replacing them: the marker must never let a
  // malformed import bypass the shared raster or cumulative project-size caps.
  const request = validateCompose(data), images = new Map();
  const preserveImages = request.operation !== 'create';
  visitImages(request.spec, (owner, key) => {
    if (!owner.image) return;
    if (preserveImages && owner.image !== IMAGE_PLACEHOLDER) images.set(key, owner.image);
    owner.image = IMAGE_PLACEHOLDER;
  });
  return {
    request,
    restore(rawSpec) {
      const spec = validateTransportImages(rawSpec);
      const returnedMarkers = new Set();
      // Legacy normalization may invent missing item IDs. Only explicit IDs in
      // the returned document can refer to a retained local image.
      visitImages(rawSpec, (owner, key) => { if (owner.image === IMAGE_PLACEHOLDER) returnedMarkers.add(key); });
      visitImages(spec, (owner, key) => {
        if (owner.image === IMAGE_PLACEHOLDER) owner.image = returnedMarkers.has(key) ? images.get(key) || '' : '';
      });
      // Restoring several original images can exceed the project-size limit
      // after a text edit. Fail before replacing the current editable project.
      return validateSpec(spec);
    },
  };
}
