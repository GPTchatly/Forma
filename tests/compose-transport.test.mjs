import test from 'node:test';
import assert from 'node:assert/strict';
import { IMAGE_PLACEHOLDER, prepareComposeRequest, validateTransportImages } from '../shared/compose-transport.mjs';
import { createSpec } from '../shared/content.mjs';
import { createPage } from '../shared/pages.mjs';
import { safeImage, validateSpec, ValidationError } from '../shared/schema.mjs';
import { inspectRasterDataUrl } from '../shared/raster.mjs';
import { PNG_IMAGE, SECOND_PNG_IMAGE, WEBP_IMAGE, JPEG_IMAGE, paddedPng } from './fixtures/images.mjs';

const section = (spec, group) => spec.sections.find((entry) => entry.group === group);
const designRequest = (spec, extra = {}) => ({ mode: 'jev', operation: 'edit', prompt: 'Change the design', spec, locks: {}, ...extra });
function imageSpec() {
  const spec = createSpec();
  section(spec, 'hero').image = PNG_IMAGE;
  section(spec, 'gallery').items[0].id = 'shared-item';
  section(spec, 'gallery').items[0].image = SECOND_PNG_IMAGE;
  const page = createPage(spec, { id: 'portfolio', title: 'Work', slug: 'work', template: 'portfolio' });
  section(page, 'hero').image = WEBP_IMAGE;
  section(page, 'gallery').items[0].id = 'shared-item';
  section(page, 'gallery').items[0].image = JPEG_IMAGE;
  spec.pages.push(page);
  return validateSpec(spec);
}
function images(spec) {
  return [spec, ...(spec.pages || [])].flatMap((page) => page.sections.flatMap((entry) => [entry.image, ...entry.items.map((item) => item.image)]));
}

test('image-presence marker is an actual bounded raster accepted by the shared schema', () => {
  assert.equal(safeImage(IMAGE_PLACEHOLDER), IMAGE_PLACEHOLDER);
  assert.ok(IMAGE_PLACEHOLDER.length <= 1024);
  const inspected = inspectRasterDataUrl(IMAGE_PLACEHOLDER);
  assert.equal(inspected.width, 1); assert.equal(inspected.height, 1);
});

test('hosted request strips all uploaded bytes across pages without changing the editable input', () => {
  const spec = imageSpec(), original = structuredClone(spec);
  const { request, restore } = prepareComposeRequest(designRequest(spec));
  assert.deepEqual(spec, original);
  assert.equal(images(request.spec).filter(Boolean).length, 4);
  assert.ok(images(request.spec).every((image) => image === '' || image === IMAGE_PLACEHOLDER));
  const encoded = JSON.stringify(request);
  for (const image of [PNG_IMAGE, SECOND_PNG_IMAGE, WEBP_IMAGE, JPEG_IMAGE]) assert.ok(!encoded.includes(image));
  assert.deepEqual(validateTransportImages(request.spec), request.spec);
  assert.deepEqual(restore(request.spec), original);
  assert.ok(images(request.spec).includes(IMAGE_PLACEHOLDER), 'restoring does not mutate the request');
});

test('image restoration follows explicit section and item identities through reordering', () => {
  const { request, restore } = prepareComposeRequest(designRequest(imageSpec()));
  const response = structuredClone(request.spec);
  const featuresIndex = response.sections.findIndex((entry) => entry.group === 'features');
  const galleryIndex = response.sections.findIndex((entry) => entry.group === 'gallery');
  [response.sections[featuresIndex], response.sections[galleryIndex]] = [response.sections[galleryIndex], response.sections[featuresIndex]];
  section(response, 'gallery').items.reverse();
  section(response.pages[0], 'gallery').items.reverse();
  const result = restore(response);
  assert.equal(section(result, 'hero').image, PNG_IMAGE);
  assert.equal(section(result, 'gallery').items.find((item) => item.id === 'shared-item').image, SECOND_PNG_IMAGE);
  assert.equal(section(result.pages[0], 'hero').image, WEBP_IMAGE);
  assert.equal(section(result.pages[0], 'gallery').items.find((item) => item.id === 'shared-item').image, JPEG_IMAGE);
  assert.ok(!images(result).includes(IMAGE_PLACEHOLDER));
});

test('removed images and owners stay removed and unknown markers never enter saved output', () => {
  const { request, restore } = prepareComposeRequest(designRequest(imageSpec()));
  const response = structuredClone(request.spec);
  section(response, 'hero').image = '';
  section(response, 'gallery').items = section(response, 'gallery').items.filter((item) => item.id !== 'shared-item');
  const childGallery = section(response.pages[0], 'gallery');
  childGallery.items[0].id = 'new-item';
  section(response.pages[0], 'hero').id = 'new-hero';
  const result = restore(response);
  assert.equal(section(result, 'hero').image, '');
  assert.ok(!section(result, 'gallery').items.some((item) => item.id === 'shared-item'));
  assert.equal(section(result.pages[0], 'gallery').items[0].image, '');
  assert.equal(section(result.pages[0], 'hero').image, '');
  assert.ok(!images(result).includes(IMAGE_PLACEHOLDER));
});

test('new designs cannot inherit photos even when generated IDs match the previous project', () => {
  const spec = imageSpec();
  const { request, restore } = prepareComposeRequest(designRequest(spec, { operation: 'create' }));
  request.operation = 'edit'; // Retained-image policy is fixed at preparation.
  const result = restore(request.spec);
  assert.ok(images(result).every((image) => image === ''));
  assert.equal(images(spec).filter(Boolean).length, 4);
});

test('page identity is required: a renamed or recreated page cannot recover an old page photo', () => {
  const { request, restore } = prepareComposeRequest(designRequest(imageSpec(), { pageId: 'portfolio' }));
  const response = structuredClone(request.spec);
  response.pages[0].id = 'replacement';
  const result = restore(response);
  assert.equal(section(result, 'hero').image, PNG_IMAGE);
  assert.ok(images({ sections: [], pages: result.pages }).every((image) => image === ''));
});

test('legacy item IDs normalize before upload stripping, but absent returned IDs do not authorize restoration', () => {
  const spec = createSpec();
  const gallery = section(spec, 'gallery');
  for (const item of gallery.items) delete item.id;
  gallery.items[0].image = PNG_IMAGE;
  const { request, restore } = prepareComposeRequest(designRequest(spec));
  assert.equal(section(request.spec, 'gallery').items[0].id, 'item-1');
  assert.equal(section(restore(request.spec), 'gallery').items[0].image, PNG_IMAGE);
  const response = structuredClone(request.spec);
  delete section(response, 'gallery').items[0].id;
  assert.equal(section(restore(response), 'gallery').items[0].image, '');
});

test('server accepts only the exact marker or an empty image at every possible owner', () => {
  const { request } = prepareComposeRequest(designRequest(imageSpec()));
  const targets = [
    (spec) => section(spec, 'hero'),
    (spec) => section(spec, 'gallery').items[0],
    (spec) => section(spec.pages[0], 'hero'),
    (spec) => section(spec.pages[0], 'gallery').items[0],
  ];
  for (const target of targets) {
    const value = structuredClone(request.spec); target(value).image = PNG_IMAGE;
    assert.throws(() => validateTransportImages(value), (error) => error instanceof ValidationError && error.status === 400);
  }
});

test('malformed images and oversized real projects cannot bypass validation through stripping', () => {
  for (const image of ['https://example.test/photo.png', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:image/png;base64,not-a-raster']) {
    const spec = createSpec(); section(spec, 'hero').image = image;
    assert.throws(() => prepareComposeRequest(designRequest(spec)), ValidationError);
  }
  const large = createSpec(), image = paddedPng();
  for (const entry of large.sections.slice(0, 6)) entry.image = image;
  assert.throws(() => prepareComposeRequest(designRequest(large)), /Project exceeds 4 MB/);
});

test('response validation rejects injected image bytes, URLs, invalid structure and unsafe links', () => {
  const { request, restore } = prepareComposeRequest(designRequest(imageSpec()));
  for (const image of [PNG_IMAGE, 'https://example.test/track.png', 'data:image/svg+xml;base64,PHN2Zz4=']) {
    const response = structuredClone(request.spec); section(response, 'hero').image = image;
    assert.throws(() => restore(response), ValidationError);
  }
  const unsafe = structuredClone(request.spec); unsafe.brand.href = 'javascript:alert(1)';
  assert.throws(() => restore(unsafe), ValidationError);
  const duplicate = structuredClone(request.spec); duplicate.pages.push(structuredClone(duplicate.pages[0]));
  assert.throws(() => restore(duplicate), ValidationError);
});

test('each request retains its own photo snapshot without consulting later mutable project state', () => {
  const spec = createSpec(); section(spec, 'hero').image = PNG_IMAGE;
  const first = prepareComposeRequest(designRequest(spec));
  section(spec, 'hero').image = SECOND_PNG_IMAGE;
  const second = prepareComposeRequest(designRequest(spec));
  assert.equal(section(first.restore(first.request.spec), 'hero').image, PNG_IMAGE);
  assert.equal(section(second.restore(second.request.spec), 'hero').image, SECOND_PNG_IMAGE);
});

test('reserved marker imports are cleared and normalization removes unknown payload fields', () => {
  const spec = createSpec(); section(spec, 'hero').image = IMAGE_PLACEHOLDER; spec.hiddenUpload = PNG_IMAGE;
  const { request, restore } = prepareComposeRequest({ ...designRequest(spec), unrecognized: PNG_IMAGE });
  assert.equal(Object.hasOwn(request, 'unrecognized'), false);
  assert.equal(Object.hasOwn(request.spec, 'hiddenUpload'), false);
  assert.ok(images(restore(request.spec)).every((image) => image === ''));
});

test('restored images and edited text must still fit the complete project size cap', () => {
  const spec = createSpec(), image = paddedPng(495000);
  for (const entry of spec.sections.slice(0, 6)) entry.image = image;
  const { request, restore } = prepareComposeRequest(designRequest(spec));
  const response = structuredClone(request.spec);
  response.brief = 'x'.repeat(5000);
  for (const entry of response.sections) {
    entry.body = 'x'.repeat(3000);
    for (const item of entry.items) item.body = 'x'.repeat(1800);
  }
  assert.doesNotThrow(() => validateSpec(response));
  assert.throws(() => restore(response), /Project exceeds 4 MB/);
  assert.equal(section(spec, 'hero').image, image);
});
