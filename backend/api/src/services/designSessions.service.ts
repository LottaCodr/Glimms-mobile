import crypto from 'crypto';
import { designSessionsRepository, usersRepository } from '../repositories';
import type { DesignSessionPatch } from '../repositories/designSessions.repository';
import type { DesignSession, SessionStatus, SourceImage, StepStatus } from '../models';
import { isUuid } from '../utils/uuid';
import { NotFoundError, ForbiddenError, BadRequestError } from '../middleware/errorHandler.middleware';
import { getPresignedUploadUrl, headObject, verifyObjectOwnership, isAllowedImageType, MAX_IMAGE_BYTES } from '../lib/s3';
import { enqueueDesignJob } from '../lib/queue';
import { logger } from '../lib/logger';
import { config } from '../config';

const PIPELINE_VERSION = '1.0.0';

/** Progress (0–100) a session has reached once the given step completes. */
const STEP_PROGRESS: Record<string, number> = {
  quality: 10, detection: 25, attributes: 40, context: 45, permutations: 55, embeddings: 60, reasoning: 75, mockups: 90,
};

/** Session status shown to polling clients while a step runs (guide §3.4). */
const RUNNING_STEP_STATUS: Record<string, SessionStatus> = {
  quality: 'quality_review', detection: 'detecting', attributes: 'extracting',
  context: 'detecting', permutations: 'permuting', embeddings: 'embedding',
  reasoning: 'reasoning', mockups: 'composing',
};

export interface StepExtras {
  inferredContext?: Record<string, unknown>;
  warnings?:        string[];
  designs?:         Record<string, unknown>[];
  artifacts?:       DesignSession['artifacts'];
  error?:           DesignSession['error'];
}

async function findOwnedSession(sessionId: string, userId: string, forbiddenMessage?: string): Promise<DesignSession> {
  if (!isUuid(sessionId)) throw new NotFoundError('Design session');
  const session = await designSessionsRepository.findById(sessionId);
  if (!session) throw new NotFoundError('Design session');
  if (session.userId !== userId) throw new ForbiddenError(forbiddenMessage);
  return session;
}

// Helper to build opaque IDs like ds_01J..., img_01J...
function opaqueId(prefix: string) {
  return `${prefix}_${crypto.randomBytes(12).toString('hex')}`;
}

export const designSessionsService = {

  async createSession(
    userId: string,
    input: {
      vertical: 'wardrobe' | 'room' | 'garden';
      occasion?: string;
      culture?: string;
      climate?: { temperature_c?: number; humidity?: number };
      preferences?: { styles?: string[]; excluded_labels?: string[]; coverage?: string; budget?: unknown };
      imageCount?: number; // how many upload URLs to create (default 1)
    }
  ) {
    const vertical = input.vertical;
    if (!['wardrobe','room','garden'].includes(vertical)) throw new BadRequestError('Invalid vertical');

    const correlationId = `cor_${crypto.randomBytes(8).toString('hex')}`;
    // Generated here rather than by the database: the S3 object keys embed it.
    const sessionId = crypto.randomUUID();
    const imageCount = Math.min(Math.max(input.imageCount ?? 1, 1), 5);

    const sourceImages: SourceImage[] = await Promise.all(
      Array.from({ length: imageCount }).map(async () => {
        const imageId = opaqueId('img');
        const objectKey = `users/${userId}/sessions/${sessionId}/images/${imageId}/source.png`;
        // Default to png, client can PUT jpeg/png/webp — presigned URL will validate Content-Type if enforced by bucket policy
        // For guide compliance, we issue one per image with 15m expiry
        const { url, expiresAt } = await getPresignedUploadUrl(objectKey, 'image/png', 900).catch(() => {
          // If S3 not configured (local dev without AWS keys), return a fake URL that echoes back
          // so local dev without AWS still works (the complete step will skip HeadObject)
          return { url: `https://fake-s3/${objectKey}?presigned=dev`, expiresAt: new Date(Date.now()+900_000) };
        });
        return { imageId, objectKey, uploadUrl: url, expiresAt: expiresAt.toISOString(), qualityStatus: 'pending' as const };
      })
    );

    const session = await designSessionsRepository.create({
      id: sessionId,
      userId,
      vertical,
      status: 'created',
      progress: 5,
      inputContext: {
        vertical,
        occasion: input.occasion,
        culture: input.culture,
        climate: input.climate,
        preferences: input.preferences,
      },
      sourceImages,
      pipelineVersion: PIPELINE_VERSION,
      correlationId,
    });

    logger.info({ sessionId: session.id, userId, vertical, correlationId }, 'Design session created');

    return {
      session_id: session.id,
      status: session.status,
      upload_urls: sourceImages.map(s => ({
        image_id: s.imageId,
        object_key: s.objectKey,
        upload_url: s.uploadUrl,
        expires_at: s.expiresAt,
      })),
      correlationId,
    };
  },

  async getSession(sessionId: string, userId: string) {
    const session = await findOwnedSession(sessionId, userId, 'You do not own this session');
    // Map to guide §3.4 status model
    return {
      session_id: session.id,
      status: session.status,
      vertical: session.vertical,
      progress: session.progress,
      steps: session.steps,
      designs: session.designs,
      warnings: session.warnings,
      artifacts: session.artifacts,
      sourceImages: session.sourceImages.map(s => ({ image_id: s.imageId, object_key: s.objectKey, qualityStatus: s.qualityStatus, width: s.width, height: s.height })),
      error: session.error ?? null,
      correlationId: session.correlationId,
      createdAt: session.createdAt,
      updatedAt: session.updatedAt,
    };
  },

  async listSessions(userId: string, opts: { page:number; limit:number } = { page:1, limit:20 }) {
    const { page, limit } = opts;
    const [sessions, total] = await Promise.all([
      designSessionsRepository.listSummariesByUser(userId, { page, limit }),
      designSessionsRepository.countByUser(userId),
    ]);
    return {
      sessions: sessions.map(s => ({
        session_id: s.id,
        status: s.status,
        vertical: s.vertical,
        progress: s.progress,
        createdAt: s.createdAt,
        imageCount: s.imageCount,
        designCount: s.designCount,
      })),
      total, page, limit, totalPages: Math.ceil(total/limit),
    };
  },

  // POST /v1/design-sessions/:id/images/complete — verify uploads and enqueue
  async completeImages(sessionId: string, userId: string, imageIds: string[]) {
    const session = await findOwnedSession(sessionId, userId);
    if (!['created','uploading'].includes(session.status)) {
      throw new BadRequestError(`Session is ${session.status}, cannot complete images`);
    }
    if (!imageIds?.length) throw new BadRequestError('image_ids is required');

    // Validate each imageId belongs to session and verify S3 object exists via HeadObject
    const idSet = new Set(imageIds);
    const matched = session.sourceImages.filter(s => idSet.has(s.imageId));
    if (matched.length !== imageIds.length) {
      throw new BadRequestError('One or more image_ids not found in session');
    }

    const verifiedKeys: string[] = [];
    for (const img of matched) {
      // Ownership check
      if (!(await verifyObjectOwnership(img.objectKey, userId, sessionId))) {
        throw new BadRequestError(`Invalid object_key ownership for ${img.imageId}`);
      }
      // HeadObject verification (best-effort if S3 not configured)
      try {
        const head = await headObject(img.objectKey);
        if (!head.exists) {
          // In dev without S3, allow missing — log warning
          if (config.isDev) {
            logger.warn({ objectKey: img.objectKey }, 'HeadObject not found — dev mode, allowing');
            verifiedKeys.push(img.objectKey);
          } else {
            throw new BadRequestError(`Image not uploaded yet: ${img.imageId} (${img.objectKey})`);
          }
        } else {
          // Validate MIME and size per guide §3.2
          if (head.contentType && !isAllowedImageType(head.contentType)) {
            throw new BadRequestError(`Invalid MIME type for ${img.imageId}: ${head.contentType}`);
          }
          if (head.contentLength && head.contentLength > MAX_IMAGE_BYTES) {
            throw new BadRequestError(`Image too large for ${img.imageId}: ${head.contentLength} bytes > 15MB`);
          }
          // Update metadata
          img.contentType = head.contentType;
          img.byteSize = head.contentLength ?? undefined;
          verifiedKeys.push(img.objectKey);
        }
      } catch (err: any) {
        if (err instanceof BadRequestError) throw err;
        logger.warn({ err: err.message, objectKey: img.objectKey }, 'HeadObject verification error — allowing in dev');
        if (config.isDev) verifiedKeys.push(img.objectKey);
        else throw new BadRequestError(`Failed to verify image ${img.imageId}`);
      }
    }

    // Persist verified metadata and move to queued
    await designSessionsRepository.update(sessionId, {
      status: 'queued',
      progress: 10,
      sourceImages: session.sourceImages,
    });

    // Enqueue design.analysis.requested — reuse existing queue but with sessionId
    // For guide compliance, we use a distinct queue name via same BullMQ with pipelineVersion
    const jobData = {
      jobId: sessionId, // for WS room compatibility, use sessionId as jobId
      sessionId,
      userId,
      tier: 'free' as const, // tier will be looked up by worker from User
      vertical: session.vertical,
      imageKeys: verifiedKeys,
      contextData: session.inputContext,
      correlationId: session.correlationId,
      pipelineVersion: PIPELINE_VERSION,
    };

    // Lookup tier from User for priority
    try {
      const user = await usersRepository.findById(userId);
      if (user) (jobData as any).tier = user.tier;
    } catch {}

    await enqueueDesignJob(jobData as any);

    logger.info({ sessionId, userId, verifiedKeys: verifiedKeys.length, correlationId: session.correlationId }, 'Session images completed — enqueued');

    return {
      session_id: sessionId,
      status: 'queued',
      image_count: verifiedKeys.length,
      message: 'Uploads verified — analysis queued',
    };
  },

  async cancelSession(sessionId: string, userId: string) {
    await findOwnedSession(sessionId, userId, 'You do not own this session');
    await designSessionsRepository.update(sessionId, { status: 'cancelled', progress: 0 });
    return { session_id: sessionId, status: 'cancelled' };
  },

  /**
   * Internal (worker): records a pipeline step's status, advances progress and
   * the client-facing session status. Returns the updated session, or null if
   * the session no longer exists.
   */
  async updateStep(sessionId: string, step: string, status: StepStatus, extra: StepExtras = {}): Promise<DesignSession | null> {
    const session = await designSessionsRepository.findById(sessionId);
    if (!session) return null;

    const stepProgress = STEP_PROGRESS[step];
    let progress = session.progress;
    if (status === 'completed' && stepProgress) progress = Math.max(progress, stepProgress);
    if (status === 'running' && stepProgress) progress = Math.max(progress, stepProgress - 5);

    const patch: DesignSessionPatch = { progress };
    if (extra.inferredContext) patch.inferredContext = extra.inferredContext;
    if (extra.warnings) patch.warnings = extra.warnings;
    if (extra.designs) patch.designs = extra.designs;
    if (extra.artifacts) patch.artifacts = extra.artifacts;
    if (extra.error) { patch.error = extra.error; patch.status = 'failed'; }

    if (step === 'mockups' && status === 'completed') {
      patch.status = 'completed';
      patch.completedAt = new Date();
      patch.progress = 100;
    } else if (status === 'running' && RUNNING_STEP_STATUS[step]) {
      patch.status = RUNNING_STEP_STATUS[step];
    }

    // The step status is merged in SQL, so concurrent steps don't clobber each other.
    return designSessionsRepository.update(sessionId, patch, { [step]: status });
  },
};
