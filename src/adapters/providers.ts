import type {
    CommentaryResponse,
    ProviderUpdate,
    PushEvent,
    ScoreResponse,
} from '../domain/types';

export function fromPush(event: PushEvent): ProviderUpdate {
    return {
        provider: event.provider,
        providerMatchId: event.providerMatchId,
        deliveryId: event.deliveryId,
        snapshot: event.snapshot,
        balls: event.commentary ? [event.commentary] : [],
    };
}

export function fromScore(response: ScoreResponse): ProviderUpdate {
    return {
        provider: response.provider,
        providerMatchId: response.providerMatchId,
        snapshot: response.snapshot,
        balls: [],
    };
}

export function fromCommentary(response: CommentaryResponse): ProviderUpdate {
    return {
        provider: response.provider,
        providerMatchId: response.providerMatchId,
        balls: response.items,
    };
}