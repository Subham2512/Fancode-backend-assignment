import type { ProviderName } from '../domain/types';

export type MatchConfig = {
    id: string; // the match id that clients see
    primaryProvider: ProviderName; // the only provider the read API shows
    providerMatchIds: Record<ProviderName, string>;
};

export const matches: MatchConfig[] = [
    {
        id: 'match-1',
        primaryProvider: 'provider-a',
        providerMatchIds: {
            'provider-a': 'a-match-1001',
            'provider-b': 'b-match-1001',
        },
    },
];