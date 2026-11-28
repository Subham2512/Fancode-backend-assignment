import type { Ball, CommentaryResponse, ScoreResponse, Snapshot } from '../../src/domain/types';

// asOf and occurredAt are sent like a real response. The aggregator ignores them.
type MockScoreResponse = ScoreResponse & { snapshot: { asOf: string } };
type MockCommentaryResponse = CommentaryResponse & { items: { occurredAt: string }[] };

export type PollStep =
    | { name: string; score: MockScoreResponse; commentary: MockCommentaryResponse }
    | { name: string; errorStatus: 503 };

const envelope = {
    provider: 'provider-b',
    providerMatchId: 'b-match-1001',
} as const;

function scoreResponse(snapshot: Snapshot, asOf: string): MockScoreResponse {
    return { ...envelope, snapshot: { ...snapshot, asOf } };
}

function commentaryResponse(items: (Ball & { occurredAt: string })[]): MockCommentaryResponse {
    return { ...envelope, items };
}

const live = { revision: 1, status: 'live', innings: 1 } as const;

const score15: Snapshot = { ...live, sequence: 15, runs: 98, wickets: 2, overs: '12.4' };
const score16: Snapshot = { ...live, sequence: 16, runs: 99, wickets: 2, overs: '12.5' };
const score17: Snapshot = { ...live, sequence: 17, runs: 103, wickets: 2, overs: '13.0' };

const ball76 = {
    ballId: 'inn1-12.4', sequence: 76, revision: 1, innings: 1, over: 12, ball: 4,
    text: 'Full and straight, driven to long-on for four.',
    occurredAt: '2026-10-22T14:03:11.000Z',
};
const ball77 = {
    ballId: 'inn1-12.5', sequence: 77, revision: 1, innings: 1, over: 12, ball: 5,
    text: 'Pushed into the covers for a single.',
    occurredAt: '2026-10-22T14:03:45.000Z',
};
const ball78 = {
    ballId: 'inn1-12.6', sequence: 78, revision: 1, innings: 1, over: 12, ball: 6,
    text: 'Short and wide, cut away for four.',
    occurredAt: '2026-10-22T14:05:20.000Z',
};

const first: PollStep = {
    name: 'first response',
    score: scoreResponse(score15, '2026-10-22T14:03:12.000Z'),
    commentary: commentaryResponse([ball76]),
};

// Fixed steps, in order. Nothing is random.
export const pollSteps: PollStep[] = [
    first,
    { ...first, name: 'unchanged response' },
    {
        name: 'newer score',
        score: scoreResponse(score16, '2026-10-22T14:03:46.000Z'),
        commentary: commentaryResponse([ball76]),
    },
    {
        name: 'new commentary item',
        score: scoreResponse(score16, '2026-10-22T14:03:46.000Z'),
        commentary: commentaryResponse([ball76, ball77]),
    },
    {
        name: 'stale score with a recent timestamp',
        score: scoreResponse(score15, '2026-10-22T14:04:30.000Z'),
        commentary: commentaryResponse([ball76, ball77]),
    },
    { name: 'temporary error', errorStatus: 503 },
    {
        name: 'recovery',
        score: scoreResponse(score17, '2026-10-22T14:05:21.000Z'),
        commentary: commentaryResponse([ball76, ball77, ball78]),
    },
];