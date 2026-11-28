import type { Ball, PushEvent, Snapshot } from '../../src/domain/types';

export type TimelineStep = {
    name: string;
    event: PushEvent;
};

const envelope = {
    provider: 'provider-a',
    providerMatchId: 'a-match-1001',
} as const;

const live = { revision: 1, status: 'live', innings: 1 } as const;

const score1: Snapshot = { ...live, sequence: 1, runs: 4, wickets: 0, overs: '0.4' };
const score2: Snapshot = { ...live, sequence: 2, runs: 4, wickets: 1, overs: '0.5' };
const score3: Snapshot = { ...live, sequence: 3, runs: 8, wickets: 1, overs: '1.0' };
const score4: Snapshot = { ...live, sequence: 4, runs: 10, wickets: 1, overs: '1.1' };

const ball1: Ball = { ballId: 'b1', sequence: 1, revision: 1, innings: 1, over: 0, ball: 4, text: 'four' };
const ball2: Ball = { ballId: 'b2', sequence: 2, revision: 1, innings: 1, over: 0, ball: 5, text: 'out' };
const ball3: Ball = { ballId: 'b3', sequence: 3, revision: 1, innings: 1, over: 0, ball: 6, text: 'four' };
const ball4: Ball = { ballId: 'b4', sequence: 4, revision: 1, innings: 1, over: 1, ball: 1, text: 'two runs' };
const ball2Corrected: Ball = { ...ball2, revision: 2, text: 'out, review stays out' };

const delivery2: PushEvent = {
    ...envelope,
    deliveryId: 'd2',
    occurredAt: '2026-10-22T14:00:30.000Z',
    snapshot: score2,
    commentary: ball2,
};

// The assignment's worked example. The order is fixed: nothing is random.
export const timeline: TimelineStep[] = [
    {
        name: 'ordered delivery',
        event: {
            ...envelope,
            deliveryId: 'd1',
            occurredAt: '2026-10-22T14:00:00.000Z',
            snapshot: score1,
            commentary: ball1,
        },
    },
    { name: 'ordered delivery', event: delivery2 },
    { name: 'repeated deliveryId', event: delivery2 },
    {
        name: 'out of order: ball 4 arrives before ball 3',
        event: {
            ...envelope,
            deliveryId: 'd4',
            occurredAt: '2026-10-22T14:01:30.000Z',
            snapshot: score4,
            commentary: ball4,
        },
    },
    {
        name: 'delayed older snapshot with a late ball',
        event: {
            ...envelope,
            deliveryId: 'd3',
            occurredAt: '2026-10-22T14:01:00.000Z',
            snapshot: score3,
            commentary: ball3,
        },
    },
    {
        name: 'correction of an earlier ball',
        event: {
            ...envelope,
            deliveryId: 'd5',
            occurredAt: '2026-10-22T14:02:00.000Z',
            snapshot: score4,
            commentary: ball2Corrected,
        },
    },
];