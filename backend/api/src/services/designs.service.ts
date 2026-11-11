import { designJobsRepository, designSessionsRepository, savedDesignsRepository } from '../repositories';
import type { DesignJobPatch } from '../repositories/designJobs.repository';
import type { DesignSource } from '../repositories/savedDesigns.repository';
import type { JobStatus } from '../models';
import { enqueueDesignJob } from '../lib/queue';
import { NotFoundError, ForbiddenError } from '../middleware/errorHandler.middleware';
import { logger } from '../lib/logger';
import { isUuid } from '../utils/uuid';

async function findOwnedSavedDesign(id: string, userId: string) {
  if (!isUuid(id)) throw new NotFoundError('Saved design');
  const design = await savedDesignsRepository.findById(id);
  if (!design) throw new NotFoundError('Saved design');
  if (design.userId !== userId) throw new ForbiddenError();
  return design;
}

/**
 * Clients pass one id — "the thing that generated this design" — which is a
 * legacy job id or a v1 session id. Resolve which, and check ownership.
 */
async function resolveDesignSource(sourceId: string, userId: string): Promise<DesignSource> {
  if (!isUuid(sourceId)) throw new NotFoundError('Design job');

  const job = await designJobsRepository.findById(sourceId);
  if (job) {
    if (job.userId !== userId) throw new ForbiddenError('You do not own this job');
    return { kind: 'job', id: job.id };
  }

  const session = await designSessionsRepository.findById(sourceId);
  if (session) {
    if (session.userId !== userId) throw new ForbiddenError('You do not own this session');
    return { kind: 'session', id: session.id };
  }

  throw new NotFoundError('Design job');
}

export const designsService = {

  async createJob(
    userId: string,
    tier: 'free' | 'premium' | 'pro',
    data: {
      vertical:    'wardrobe' | 'room' | 'garden';
      imageKeys:   string[];
      contextData: Record<string, unknown>;
    },
  ) {
    const job = await designJobsRepository.create({
      userId,
      vertical:    data.vertical,
      imageKeys:   data.imageKeys,
      contextData: data.contextData,
    });

    await enqueueDesignJob({
      jobId:       job.id,
      userId,
      tier,
      vertical:    data.vertical,
      imageKeys:   data.imageKeys,
      contextData: data.contextData,
    });

    logger.info({ jobId: job.id, userId, vertical: data.vertical }, 'Design job created');

    return {
      jobId:            job.id,
      status:           'pending',
      estimatedSeconds: data.imageKeys.length * 5,
    };
  },

  async getJob(id: string, userId: string) {
    if (!isUuid(id)) throw new NotFoundError('Design job');
    const job = await designJobsRepository.findById(id);
    if (!job) throw new NotFoundError('Design job');
    if (job.userId !== userId) throw new ForbiddenError();
    return job;
  },

  async listJobs(userId: string, opts: { page: number; limit: number } = { page: 1, limit: 20 }) {
    const { page, limit } = opts;
    const [jobs, total] = await Promise.all([
      designJobsRepository.listSummariesByUser(userId, { page, limit }),
      designJobsRepository.countByUser(userId),
    ]);
    return { jobs, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  /** Called by the worker. A no-op (returns null) when `jobId` is not a legacy job. */
  async updateJobStatus(
    jobId: string,
    status: JobStatus,
    result?: Record<string, unknown>,
    errorMsg?: string,
  ) {
    if (!isUuid(jobId)) return null;
    const patch: DesignJobPatch = { status };
    if (result)   patch.result   = result;
    if (errorMsg) patch.errorMsg = errorMsg;
    if (status === 'completed') patch.completedAt = new Date();
    return designJobsRepository.update(jobId, patch);
  },

  async getSavedDesigns(userId: string, opts: { page: number; limit: number; favorite?: boolean } = { page: 1, limit: 20 }) {
    const { page, limit, favorite } = opts;
    const [designs, total] = await Promise.all([
      savedDesignsRepository.listByUser(userId, { favorite }, { page, limit }),
      savedDesignsRepository.countByUser(userId, { favorite }),
    ]);
    return { designs, total, page, limit, totalPages: Math.ceil(total / limit) };
  },

  async saveDesign(userId: string, jobId: string, data: {
    title?:       string;
    items:        Record<string, unknown>[];
    mockupUrl?:   string;
    explanation?: string;
    tips?:        string[];
    score?:       number;
  }) {
    const source = await resolveDesignSource(jobId, userId);
    return savedDesignsRepository.create({
      userId,
      source,
      title:       data.title?.trim() || null,
      items:       data.items,
      mockupUrl:   data.mockupUrl,
      explanation: data.explanation,
      tips:        data.tips,
      score:       data.score,
    });
  },

  async deleteSavedDesign(id: string, userId: string) {
    await findOwnedSavedDesign(id, userId);
    await savedDesignsRepository.delete(id);
    return { message: 'Saved design deleted' };
  },

  async toggleFavorite(id: string, userId: string) {
    await findOwnedSavedDesign(id, userId);
    return savedDesignsRepository.toggleFavorite(id);
  },
};
