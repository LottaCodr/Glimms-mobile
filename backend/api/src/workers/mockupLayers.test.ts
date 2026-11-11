import { buildMockupLayers, MAX_MOCKUP_LAYERS } from './mockupLayers';

describe('buildMockupLayers', () => {
  it('sends the detection box as a source crop, never as a canvas position', () => {
    const layers = buildMockupLayers(
      [{ image_key: 'users/u/a.png', bbox: { x: 10, y: 20, width: 300, height: 400 }, label: 'shirt' }],
      'users/u/fallback.png',
    );
    expect(layers).toEqual([{ image_key: 'users/u/a.png', crop: { x: 10, y: 20, width: 300, height: 400 } }]);
    expect(layers[0]).not.toHaveProperty('bbox');
  });

  it('uses the whole fallback photo when an item has no key or usable box', () => {
    expect(buildMockupLayers(
      [{ label: 'shirt' }, { bbox: { x: 0, y: 0, width: 0, height: 10 } }, { bbox: { width: 'wide', height: 5 } }, null],
      'users/u/a.png',
    )).toEqual([
      { image_key: 'users/u/a.png' }, { image_key: 'users/u/a.png' },
      { image_key: 'users/u/a.png' }, { image_key: 'users/u/a.png' },
    ]);
  });

  it('skips items that cannot be resolved to an image', () => {
    expect(buildMockupLayers([{ label: 'shirt' }], undefined)).toEqual([]);
    expect(buildMockupLayers(undefined, 'k')).toEqual([]);
  });

  it('respects the compositor layer limit', () => {
    const many = Array.from({ length: 50 }, () => ({ image_key: 'k' }));
    expect(buildMockupLayers(many, 'k')).toHaveLength(MAX_MOCKUP_LAYERS);
  });
});
