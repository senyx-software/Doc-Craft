import { expect, it } from 'vitest';
import { ApiRequestError } from '../client';
import type { ApiError } from '../../types';

it('shows FastAPI validation details instead of an opaque HTTP status', () => {
  expect(new ApiRequestError(422, {detail:'Choose a valid PDF file.'} as ApiError).message).toBe('Choose a valid PDF file.');
  expect(new ApiRequestError(422, {detail:[{loc:['body','document_type'],msg:'Field required'}]} as ApiError).message).toBe('document_type: Field required');
  expect(new ApiRequestError(413, {} as ApiError).message).toBe('Request failed with status 413');
});
