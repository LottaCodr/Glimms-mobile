import { Router, Request } from 'express';
import { z } from 'zod';
import { subscriptionsService } from '../services/subscriptions.service';
import { credoService } from '../services/credo.service';
import { requireAuth, AuthRequest } from '../middleware/auth.middleware';
import { validateBody } from '../middleware/validate.middleware';

const router = Router();

// A plan is named by tier (preferred) or by the plan code from GET /prices.
const checkoutSchema = z.object({
  planCode: z.string().regex(/^PLN_[A-Za-z0-9]+$/, 'must be a Paystack plan code').optional(),
  tier:     z.enum(['premium', 'pro']).optional(),
}).refine((body) => body.planCode || body.tier, { message: 'planCode or tier is required', path: ['planCode'] });

const confirmSchema = z.object({ reference: z.string().min(1).max(100).regex(/^[A-Za-z0-9._=-]+$/, 'is not a payment reference') });

/**
 * GET /api/subscriptions/prices — plans that can be bought right now.
 * Public: the paywall is shown before sign-in too. `{ prices: [] }` means
 * purchases are switched off.
 */
router.get('/prices', async (_req, res) => {
  const prices = await subscriptionsService.listPrices();
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ prices });
});

/** GET /api/subscriptions/me */
router.get('/me', requireAuth, async (req: AuthRequest, res) => {
  const sub = await subscriptionsService.getByUserId(req.user!.sub);
  res.json(sub);
});

/** POST /api/subscriptions/checkout → { url, reference } */
router.post('/checkout', requireAuth, validateBody(checkoutSchema), async (req: AuthRequest, res) => {
  const { planCode, tier } = req.body;
  res.json(await subscriptionsService.createCheckoutSession(req.user!.sub, { planCode, tier }));
});

/** POST /api/subscriptions/confirm → { status: paid|pending|failed, tier } */
router.post('/confirm', requireAuth, validateBody(confirmSchema), async (req: AuthRequest, res) => {
  res.json(await subscriptionsService.confirmForUser(req.user!.sub, req.body.reference));
});

/** POST /api/subscriptions/portal → { url }: Paystack page to update the card or cancel */
router.post('/portal', requireAuth, async (req: AuthRequest, res) => {
  const session = await subscriptionsService.createPortalSession(req.user!.sub);
  res.json(session);
});

// ── Credo (eTranzact): naira card and bank-transfer passes ──────────────────

const credoCheckoutSchema = z.object({ tier: z.enum(['premium', 'pro']) });
const credoConfirmSchema = z.object({ reference: z.string().min(1).max(100) });

/** GET /api/subscriptions/credo/plans — public; `{ plans: [] }` when switched off */
router.get('/credo/plans', (_req, res) => {
  res.set('Cache-Control', 'public, max-age=300');
  res.json({ plans: credoService.listPlans() });
});

/** POST /api/subscriptions/credo/checkout → { url, reference } */
router.post('/credo/checkout', requireAuth, validateBody(credoCheckoutSchema), async (req: AuthRequest, res) => {
  res.json(await credoService.createCheckout(req.user!.sub, req.body.tier));
});

/** POST /api/subscriptions/credo/confirm → { status: paid|pending|failed, tier } */
router.post('/credo/confirm', requireAuth, validateBody(credoConfirmSchema), async (req: AuthRequest, res) => {
  res.json(await credoService.confirmForUser(req.user!.sub, req.body.reference));
});

/** POST /api/subscriptions/credo/webhook  (called by Credo) */
router.post('/credo/webhook', async (req: Request, res) => {
  res.json(await credoService.handleWebhook(req.get('x-credo-signature') ?? req.get('credo-signature'), req.body));
});

/** POST /api/subscriptions/webhook  (called by Paystack; raw body) */
router.post('/webhook', async (req: Request, res) => {
  const sig = req.get('x-paystack-signature');
  if (!sig) {
    res.status(400).json({ error: 'Missing Paystack signature', code: 'MISSING_SIGNATURE' });
    return;
  }
  const result = await subscriptionsService.handleWebhook(req.body as Buffer, sig);
  res.json(result);
});

export default router;
export { router as subscriptionsRouter };
