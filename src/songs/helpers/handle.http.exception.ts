import {
  ProviderBadRequestException,
  ProviderRateLimitException,
  ProviderServerException,
  ProviderUnauthorizedException,
} from '../exceptions';
import { AxiosError } from 'axios';

/**
 * Maps an HTTP error to a `ProviderException` or returns `null` for "no
 * match" (404). Always throws unless the response status is 404, so callers
 * should treat the return value as `null` and let exceptions propagate.
 */
export function handleHttpException(err: unknown, provider: string): null {
  if (err instanceof AxiosError) {
    const status = err.response?.status;
    // 404 means the provider found no match for the query — not an error,
    // just an empty result. The caller handles null as "no data from this provider".
    if (status === 404) return null;
    if (status === 400) throw new ProviderBadRequestException(provider);
    if (status === 401) throw new ProviderUnauthorizedException(provider);
    if (status === 429) throw new ProviderRateLimitException(provider);
    if (status !== undefined && status >= 500)
      throw new ProviderServerException(provider);
  }
  throw err;
}
