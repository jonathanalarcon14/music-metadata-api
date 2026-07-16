import { AcoustIdClient } from './acoustid.client';
import { AcrCloudClient } from './acrcloud.client';
import { AuddClient } from './audd.client';

export { AcoustIdClient, AcrCloudClient, AuddClient };

// Order defines query priority: providers are tried sequentially and the
// first successful match wins. Put the most accurate / cheapest sources first.
export const IDENTIFY_CLIENTS = [AcoustIdClient, AcrCloudClient, AuddClient];
