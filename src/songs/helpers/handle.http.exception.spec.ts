import { AxiosError, AxiosResponse } from 'axios';
import { handleHttpException } from './handle.http.exception';
import {
  ProviderBadRequestException,
  ProviderRateLimitException,
  ProviderServerException,
  ProviderUnauthorizedException,
} from '../exceptions';

const axiosErrorWithStatus = (status: number): AxiosError => {
  const response = { status } as AxiosResponse;
  return new AxiosError('http error', 'ERR', undefined, undefined, response);
};

describe('handleHttpException', () => {
  const PROVIDER = 'TestProvider';

  it('returns null for a 404 (no match, not an error)', () => {
    expect(handleHttpException(axiosErrorWithStatus(404), PROVIDER)).toBeNull();
  });

  it('throws ProviderBadRequestException for 400', () => {
    expect(() =>
      handleHttpException(axiosErrorWithStatus(400), PROVIDER),
    ).toThrow(ProviderBadRequestException);
  });

  it('throws ProviderUnauthorizedException for 401', () => {
    expect(() =>
      handleHttpException(axiosErrorWithStatus(401), PROVIDER),
    ).toThrow(ProviderUnauthorizedException);
  });

  it('throws ProviderRateLimitException for 429', () => {
    expect(() =>
      handleHttpException(axiosErrorWithStatus(429), PROVIDER),
    ).toThrow(ProviderRateLimitException);
  });

  it('throws ProviderServerException for any 5xx', () => {
    for (const status of [500, 502, 503]) {
      expect(() =>
        handleHttpException(axiosErrorWithStatus(status), PROVIDER),
      ).toThrow(ProviderServerException);
    }
  });

  it('includes the provider name in the thrown message', () => {
    expect(() =>
      handleHttpException(axiosErrorWithStatus(429), PROVIDER),
    ).toThrow(/TestProvider/);
  });

  it('re-throws an AxiosError with an unmapped status (e.g. 418)', () => {
    const err = axiosErrorWithStatus(418);
    expect(() => handleHttpException(err, PROVIDER)).toThrow(err);
  });

  it('re-throws an AxiosError with no response (network error)', () => {
    const err = new AxiosError('network down');
    expect(() => handleHttpException(err, PROVIDER)).toThrow(err);
  });

  it('re-throws a non-Axios error untouched', () => {
    const err = new Error('something else');
    expect(() => handleHttpException(err, PROVIDER)).toThrow(err);
  });
});
