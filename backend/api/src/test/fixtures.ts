import { usersRepository } from '../repositories';
import type { User } from '../models';

let sequence = 0;

/** Most tables reference users, so tests need real rows rather than made-up ids. */
export async function createUser(overrides: Partial<{ email: string; name: string; tier: User['tier'] }> = {}): Promise<User> {
  sequence += 1;
  return usersRepository.create({
    email: overrides.email ?? `user${sequence}-${Date.now()}@glimms.test`,
    passwordHash: null,
    name: overrides.name ?? null,
    tier: overrides.tier,
  });
}

/** Well-formed, but matches no row. */
export const UNKNOWN_ID = '00000000-0000-4000-8000-000000000000';

export const SAMPLE_ITEM = {
  vertical:   'wardrobe' as const,
  label:      'white shirt',
  category:   'top',
  color:      { dominant: { hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } }, palette: [], mood: 'neutral' },
  imageKey:   'uploads/test/shirt.jpg',
  confidence: 0.92,
  tags:       ['cotton', 'classic'],
  styleTags:  ['smart-casual'],
};
