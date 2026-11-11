/**
 * Layers for the mockup compositor (`POST /compose`).
 *
 * A detected item is a region of the photo it was found in, so each layer names
 * that photo (`image_key`) and the region (`crop`, the detection box in source
 * pixels). The compositor cuts the region out and lays the items out on the
 * canvas itself.
 *
 * The detection box must NOT be sent as `bbox`: the compositor reads `bbox` as
 * a position on the output canvas, which would paste the whole photo at
 * coordinates that only make sense in the source image.
 */

export interface MockupLayer {
  image_key: string;
  crop?: { x: number; y: number; width: number; height: number };
}

/** The compositor accepts at most 30 layers per request. */
export const MAX_MOCKUP_LAYERS = 30;

function toCrop(bbox: unknown): MockupLayer['crop'] | undefined {
  if (!bbox || typeof bbox !== 'object') return undefined;
  const { x, y, width, height } = bbox as Record<string, unknown>;
  const values = [x ?? 0, y ?? 0, width, height].map(Number);
  if (!values.every(Number.isFinite)) return undefined;
  const [cx, cy, cw, ch] = values;
  if (cw <= 0 || ch <= 0) return undefined;
  return { x: cx, y: cy, width: cw, height: ch };
}

export function buildMockupLayers(items: unknown, fallbackImageKey: string | undefined): MockupLayer[] {
  if (!Array.isArray(items)) return [];
  const layers: MockupLayer[] = [];
  for (const item of items) {
    const record = (item ?? {}) as Record<string, unknown>;
    const imageKey = typeof record.image_key === 'string' && record.image_key ? record.image_key : fallbackImageKey;
    if (!imageKey) continue;
    const crop = toCrop(record.bbox);
    layers.push(crop ? { image_key: imageKey, crop } : { image_key: imageKey });
    if (layers.length === MAX_MOCKUP_LAYERS) break;
  }
  return layers;
}
