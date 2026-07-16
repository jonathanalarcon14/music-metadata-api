import { formatError } from './error.helpers';

describe('formatError', () => {
  it('returns the message of an Error instance', () => {
    expect(formatError(new Error('boom'))).toBe('boom');
  });

  it('returns the message of an Error subclass', () => {
    class CustomError extends Error {}
    expect(formatError(new CustomError('custom'))).toBe('custom');
  });

  it('stringifies a non-Error value', () => {
    expect(formatError('plain string')).toBe('plain string');
    expect(formatError(42)).toBe('42');
    expect(formatError(null)).toBe('null');
    expect(formatError(undefined)).toBe('undefined');
  });

  it('stringifies an object without throwing', () => {
    expect(formatError({ code: 500 })).toBe('[object Object]');
  });
});
