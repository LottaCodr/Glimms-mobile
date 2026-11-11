/**
 * Seed script — creates the two dev accounts and some sample catalog items.
 * Run: npm run seed   (after `npm run db:migrate`)
 *
 * Safe to re-run: it replaces only its own two accounts (their data goes with
 * them via ON DELETE CASCADE) and touches nothing else. Refuses to run against
 * production.
 */
import bcrypt from 'bcryptjs';
import { config } from '../config';
import { disconnectDb, getDb } from '../db';
import { catalogRepository, userPreferencesRepository, usersRepository } from '../repositories';

const SEED_PASSWORD = 'password123';
const SEED_USERS = [
  { email: 'free@glimms.ai',    name: 'Free User',    tier: 'free' as const },
  { email: 'premium@glimms.ai', name: 'Premium User', tier: 'premium' as const },
];

async function seed() {
  if (config.nodeEnv === 'production') {
    throw new Error('Refusing to seed: NODE_ENV=production');
  }

  const passwordHash = await bcrypt.hash(SEED_PASSWORD, 10);

  await getDb().transaction(async (tx) => {
    await tx.query('delete from users where email = any($1::text[])', [SEED_USERS.map((u) => u.email)]);

    const [freeUser, premiumUser] = await Promise.all(
      SEED_USERS.map((user) => usersRepository.create({ ...user, passwordHash }, tx)),
    );
    console.log(`✅ Created users: ${freeUser.email}, ${premiumUser.email}`);

    await userPreferencesRepository.upsert(freeUser.id, {
      occupation:  'designer',
      styleGoals:  ['look professional', 'be comfortable'],
      occasions:   ['work', 'casual'],
      culturalCtx: 'west_africa',
      location:    { lat: 6.5, lon: 3.3, city: 'Lagos', country: 'Nigeria' },
    }, tx);

    const base = {
      userId: freeUser.id, vertical: 'wardrobe' as const,
      texture: null, pattern: null, thumbnailKey: null, attributes: {},
    };
    await catalogRepository.insertMany([
      {
        ...base,
        label: 'white button shirt', category: 'top',
        color: { dominant: { hex: '#f5f5f5', rgb: { r: 245, g: 245, b: 245 } }, palette: [], mood: 'neutral' },
        imageKey: 'uploads/seed/shirt.jpg', confidence: 0.95,
        tags: ['cotton', 'formal'], styleTags: ['smart-casual', 'formal'],
      },
      {
        ...base,
        label: 'navy chinos', category: 'bottom',
        color: { dominant: { hex: '#1e3a5f', rgb: { r: 30, g: 58, b: 95 } }, palette: [], mood: 'cool' },
        imageKey: 'uploads/seed/chinos.jpg', confidence: 0.91,
        tags: ['cotton', 'slim-fit'], styleTags: ['smart-casual', 'formal'],
      },
      {
        ...base,
        label: 'white sneakers', category: 'footwear',
        color: { dominant: { hex: '#ffffff', rgb: { r: 255, g: 255, b: 255 } }, palette: [], mood: 'neutral' },
        imageKey: 'uploads/seed/sneakers.jpg', confidence: 0.88,
        tags: ['casual'], styleTags: ['casual', 'minimalist'],
      },
    ], tx);
    console.log('✅ Created sample catalog items');
  });

  console.log('\n📋 Dev credentials:');
  console.log(`  free@glimms.ai     / ${SEED_PASSWORD}  (free tier)`);
  console.log(`  premium@glimms.ai  / ${SEED_PASSWORD}  (premium tier)`);
  console.log('\n✅ Seed complete');
}

seed()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => disconnectDb());
