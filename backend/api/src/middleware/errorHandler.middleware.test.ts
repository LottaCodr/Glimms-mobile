import type { Request, Response } from 'express';
import { errorHandler, NotFoundError } from './errorHandler.middleware';

function handle(err: unknown) {
  const res = { status: jest.fn().mockReturnThis(), json: jest.fn().mockReturnThis() };
  errorHandler(err as Error, { path: '/x', method: 'GET' } as Request, res as unknown as Response, jest.fn());
  return { status: res.status.mock.calls[0][0], body: res.json.mock.calls[0][0] };
}

const pgError = (code: string, constraint?: string) => Object.assign(new Error('db'), { code, constraint });

describe('errorHandler', () => {
  it('passes application errors through', () => {
    expect(handle(new NotFoundError('Catalog item')))
      .toEqual({ status: 404, body: { error: 'Catalog item not found', code: 'NOT_FOUND' } });
  });

  it('maps a unique violation to 409 naming the field', () => {
    expect(handle(pgError('23505', 'users_email_key')))
      .toEqual({ status: 409, body: { error: 'email already exists', code: 'DUPLICATE_KEY' } });
    expect(handle(pgError('23505', 'device_tokens_token_key')).body.error).toBe('token already exists');
  });

  it('maps a malformed uuid to 400 INVALID_ID', () => {
    expect(handle(pgError('22P02'))).toMatchObject({ status: 400, body: { code: 'INVALID_ID' } });
  });

  it('maps check and foreign-key violations to 4xx', () => {
    expect(handle(pgError('23514', 'users_tier_valid')))
      .toMatchObject({ status: 400, body: { code: 'VALIDATION_ERROR', details: ['users_tier_valid'] } });
    expect(handle(pgError('23503'))).toMatchObject({ status: 409, body: { code: 'INVALID_REFERENCE' } });
  });

  it('does not leak other database failures', () => {
    const result = handle(pgError('42P01')); // undefined_table — our bug, not the client's
    expect(result.status).toBe(500);
    expect(result.body).toEqual({ error: 'Something went wrong', code: 'INTERNAL_ERROR' });
  });
});
