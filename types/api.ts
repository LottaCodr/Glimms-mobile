/**
 * API types — mirrors FRONTEND_INTEGRATION.md §15.
 * Backend: glimms-api (Express + Mongoose). All dates are ISO strings.
 */

export type Tier = "free" | "premium" | "pro";
export type Vertical = "wardrobe" | "room" | "garden";
export type JobStatus = "pending" | "processing" | "completed" | "failed";
export type SubStatus = "active" | "inactive" | "past_due" | "cancelled";

// ─── Auth ────────────────────────────────────────────────────────────────────
export type AuthTokens = {
    accessToken: string;
    refreshToken: string;
    /** Seconds until the access token expires (e.g. 900). */
    expiresIn: number;
};

export type User = {
    id: string;
    email: string;
    name: string | null;
    avatarUrl: string | null;
    tier: Tier;
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
};

export type UserLocation = {
    lat: number;
    lon: number;
    city?: string;
    country?: string;
};

export type UserPreferences = {
    id: string;
    userId: string;
    occupation: string | null;
    styleGoals: string[];
    occasions: string[];
    culturalCtx: string | null;
    location: UserLocation | null;
    createdAt: string;
    updatedAt: string;
};

export type PreferencesInput = Partial<{
    occupation: string | null;
    styleGoals: string[];
    occasions: string[];
    culturalCtx: string | null;
    location: UserLocation | null;
}>;

// ─── Catalog ─────────────────────────────────────────────────────────────────
export type ColorSwatch = { hex: string; rgb: { r: number; g: number; b: number } };

export type CatalogItem = {
    id: string;
    userId: string;
    vertical: Vertical;
    label: string;
    category: string;
    color: {
        dominant: ColorSwatch;
        palette: ColorSwatch[];
        mood: string;
    };
    texture: string | null;
    pattern: string | null;
    imageKey: string;
    thumbnailKey: string | null;
    confidence: number;
    attributes: Record<string, unknown>;
    tags: string[];
    styleTags: string[];
    isActive: boolean;
    createdAt: string;
    updatedAt: string;
    /** Presigned GET (900s) — only present when requested with includeUrls=true */
    imageUrl?: string | null;
    thumbnailUrl?: string | null;
};

export type CatalogFilters = {
    vertical?: Vertical;
    category?: string;
    tag?: string;
    includeUrls?: boolean;
};

export type CatalogItemInput = {
    vertical: Vertical;
    label: string;
    category: string;
    color: { dominant: ColorSwatch; palette?: ColorSwatch[]; mood?: string };
    imageKey: string;
    thumbnailKey?: string;
    confidence: number;
    texture?: string;
    pattern?: string;
    tags?: string[];
    styleTags?: string[];
    attributes?: Record<string, unknown>;
};

// ─── Design jobs (legacy pipeline) ───────────────────────────────────────────
export type DesignJob = {
    id: string;
    userId: string;
    vertical: Vertical;
    status: JobStatus;
    imageKeys: string[];
    contextData: Record<string, unknown> & {
        climate: unknown;
        occasion: string;
        culturalCtx: string;
        constraints: unknown;
    };
    result: null | {
        designs: GeneratedDesign[];
        vertical: Vertical;
        itemCount: number;
        designCount: number;
        generatedAt: string;
        message?: string;
    };
    errorMsg: string | null;
    completedAt: string | null;
    createdAt: string;
    updatedAt: string;
};

export type JobStep =
    | "detecting"
    | "extracting"
    | "embedding"
    | "permutating"
    | "reasoning"
    | "compositing";

export type JobProgress = {
    status: "processing";
    step: JobStep;
    progress: number;
    itemCount?: number;
};

export type JobComplete = {
    designs: GeneratedDesign[];
    vertical: Vertical;
    itemCount: number;
    designCount: number;
    generatedAt: string;
    message?: string; // e.g. "No items detected…" when designs is empty
};

/** AI-generated design card (snake_case from python services — normalize before use). */
export type GeneratedDesign = {
    title?: string | null;
    items?: Record<string, unknown>[];
    mockupUrl?: string | null;
    mockup_url?: string | null;
    explanation?: string | null;
    tips?: string[];
    score?: number;
    [key: string]: unknown;
};

// ─── Saved designs ───────────────────────────────────────────────────────────
export type SavedDesign = {
    id: string;
    userId: string;
    jobId: string;
    title: string | null;
    items: Record<string, unknown>[];
    mockupUrl: string | null;
    explanation: string | null;
    tips: string[];
    score: number;
    isFavorite: boolean;
    tags: string[];
    createdAt: string;
};

export type SaveDesignInput = {
    jobId: string;
    title?: string | null;
    items: Record<string, unknown>[];
    mockupUrl?: string | null;
    explanation?: string | null;
    tips?: string[];
    score?: number;
};

// ─── v1 design sessions (guide §8A / §3) ─────────────────────────────────────
export type SessionStatus =
    | "created"
    | "uploading"
    | "queued"
    | "quality_review"
    | "detecting"
    | "extracting"
    | "permuting"
    | "embedding"
    | "reasoning"
    | "composing"
    | "completed"
    | "failed"
    | "cancelled";

export type StepStatus = "pending" | "running" | "completed" | "failed" | "skipped";

export type SessionStepKey =
    | "quality"
    | "detection"
    | "attributes"
    | "context"
    | "permutations"
    | "embeddings"
    | "reasoning"
    | "mockups";

export type UploadUrl = {
    image_id: string;
    object_key: string;
    /** Short-lived presigned PUT (900s) — client PUTs bytes directly to S3. */
    upload_url: string;
    expires_at: string;
};

export type SessionPreferences = {
    styles?: string[];
    excluded_labels?: string[];
    coverage?: string;
};

export type CreateSessionInput = {
    vertical: Vertical;
    occasion?: string;
    culture?: string | null;
    climate?: { temperature_c: number; humidity?: number };
    preferences?: SessionPreferences;
    imageCount: number; // 1-5
};

export type DesignSession = {
    session_id: string;
    status: SessionStatus;
    vertical: Vertical;
    progress: number;
    steps: Partial<Record<SessionStepKey, StepStatus>>;
    designs: GeneratedDesign[];
    warnings: string[];
    artifacts: {
        id: string;
        permutationId: string;
        objectKey: string;
        contentType: string;
        url?: string;
    }[];
    error: {
        code: string;
        message: string;
        details?: unknown;
        request_id?: string;
    } | null;
    correlationId: string;
    createdAt: string;
    updatedAt: string;
};

export type CreateSessionResponse = {
    session_id: string;
    status: SessionStatus;
    upload_urls: UploadUrl[];
    correlationId: string;
};

export type CompleteUploadsResponse = {
    session_id: string;
    status: SessionStatus; // "queued"
    image_count: number;
    message: string;
};

// ─── Subscriptions ───────────────────────────────────────────────────────────
export type Subscription = {
    userId: string;
    status: SubStatus;
    tier?: Tier;
    stripeCustomerId: string | null;
    stripeSubscriptionId: string | null;
    currentPeriodEnd: string | null;
    cancelAtPeriodEnd: boolean;
};

export type CheckoutResponse = { url: string; id: string };

// ─── Notifications ───────────────────────────────────────────────────────────
export type DevicePlatform = "ios" | "android";
export type DeviceTokenInput = { token: string; platform: DevicePlatform };

// ─── Analytics ───────────────────────────────────────────────────────────────
export type AnalyticsSummary = {
    scansToday: number;
    catalogCount: number;
    savedCount: number;
};

// ─── Pagination ──────────────────────────────────────────────────────────────
export type Paginated<T> = {
    items: T[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
export type PaginatedJobs = {
    jobs: DesignJob[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
export type PaginatedDesigns = {
    designs: SavedDesign[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};
export type PaginatedSessions = {
    sessions: DesignSession[];
    total: number;
    page: number;
    limit: number;
    totalPages: number;
};

// ─── Errors ──────────────────────────────────────────────────────────────────
export type ApiErrorPayload = {
    error: string;
    code?: string;
    details?: { field: string; message: string }[];
    // present on 429 SCAN_LIMIT_REACHED
    scansUsed?: number;
    limit?: number;
    tier?: Tier;
    resetsAt?: string;
    // present on 403 UPGRADE_REQUIRED
    yourTier?: Tier;
    upgradeUrl?: string;
};

export type HealthResponse = {
    status: "ok" | "degraded";
    service?: string;
    env?: string;
    checks?: { mongodb?: string; redis?: string };
    uptime?: number;
    ts?: string;
};
