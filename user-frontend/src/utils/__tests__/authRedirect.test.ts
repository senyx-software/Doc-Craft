import { describe, expect, it } from 'vitest';
import { postAuthDestination } from '../authRedirect';

describe('the destination after sign-in', () => {
  it('opens an invoice when sign-in has no document selection', () => {
    expect(postAuthDestination(null)).toBe('/builder?type=invoice');
    expect(postAuthDestination({ from: { pathname: '/builder' } })).toBe('/builder?type=invoice');
    expect(postAuthDestination({ from: { pathname: '/builder', search: '?new=true' } })).toBe('/builder?new=true&type=invoice');
  });

  it('returns to the selected template, document type, and canvas position', () => {
    expect(postAuthDestination({ from: { pathname: '/builder', search: '?type=quotation&templateId=classic', hash: '#preview' } }))
      .toBe('/builder?type=quotation&templateId=classic#preview');
  });

  it('reopens an existing draft without selecting a new invoice', () => {
    expect(postAuthDestination({ from: { pathname: '/builder', search: '?sessionId=saved-draft' } }))
      .toBe('/builder?sessionId=saved-draft');
    expect(postAuthDestination({ from: { pathname: '/dashboard/document-history' } }))
      .toBe('/dashboard/document-history');
  });

  it.each(['/login', '/register', '/verify-email', '/oauth-callback', '//example.com', '/\\example.com', 'https://example.com'])(
    'avoids sign-in loops and external destinations: %s', pathname => {
      expect(postAuthDestination({ from: { pathname } })).toBe('/builder?type=invoice');
    });
});
