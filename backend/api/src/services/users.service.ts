import { usersRepository, userPreferencesRepository } from '../repositories';
import type { PreferencesPatch } from '../repositories/userPreferences.repository';
import { NotFoundError } from '../middleware/errorHandler.middleware';

export const usersService = {
  async findById(id: string) {
    const user = await usersRepository.findById(id);
    if (!user) throw new NotFoundError('User');
    return user;
  },

  async update(id: string, data: { name?: string; avatarUrl?: string }) {
    const user = await usersRepository.update(id, {
      name:      data.name?.trim(),
      avatarUrl: data.avatarUrl,
    });
    if (!user) throw new NotFoundError('User');
    return user;
  },

  async getPreferences(userId: string) {
    return userPreferencesRepository.findByUserId(userId);
  },

  async upsertPreferences(userId: string, data: PreferencesPatch) {
    return userPreferencesRepository.upsert(userId, {
      ...data,
      occupation: typeof data.occupation === 'string' ? data.occupation.trim() : data.occupation,
    });
  },
};
