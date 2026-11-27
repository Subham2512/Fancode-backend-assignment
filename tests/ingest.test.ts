import { afterEach, beforeEach, describe, expect, test, vi } from 'vitest';
import { matches } from '../src/config/matches';
import { openDb, type Db } from '../src/db/connection';
import { createRepository, type Repository } from '../src/db/repository';
import { seedMatches } from '../src/db/seed';
import type { Ball, ProviderUpdate, Snapshot } from '../src/domain/types';
import {
    createIngest,
    UnknownMatchError,
    type Ingest,
    type Logger,
} from '../src/ingestion/ingest';

const MATCH = 'match-1';

type PushUpdate = Extract<ProviderUpdate, { provider: 'provider-a' }>;

function snapshot(sequence: number, runs: number, wickets: number, overs: string): Snapshot {
    return { sequence, revision: 1, status: 'live', innings: 1, runs, wickets, overs };
}

function ball(ballId: string, sequence: number, over: number, ballNumber: number, text: string): Ball {
    return { ballId, sequence, revision: 1, innings: 1, over, ball: ballNumber, text };
}

function push(deliveryId: string, score: Snapshot, item: Ball): PushUpdate {
    return {
        provider: 'provider-a',
        providerMatchId: 'a-match-1001',
        deliveryId,
        snapshot: score,
        balls: [item],
    };
}

// The worked example from the assignment
const b1 = ball('b1', 1, 0, 4, 'four');
const b2 = ball('b2', 2, 0, 5, 'out');
const b3 = ball('b3', 3, 1, 0, 'single');
const b4 = ball('b4', 4, 1, 1, 'two runs');
const b2Corrected: Ball = { ...b2, revision: 2, text: 'out, review stays out' };

const d1 = push('d1', snapshot(1, 4, 0, '0.4'), b1);
const d2 = push('d2', snapshot(2, 4, 1, '0.5'), b2);
const d3 = push('d3', snapshot(3, 8, 1, '1.0'), b3);
const d4 = push('d4', snapshot(4, 10, 1, '1.1'), b4);
const d5 = push('d5', snapshot(4, 10, 1, '1.1'), b2Corrected);

let db: Db;
let repo: Repository;
let ingest: Ingest;
let warn: ReturnType<typeof vi.fn<Logger['warn']>>;

function setup() {
    db = openDb(':memory:');
    seedMatches(db, matches);
    repo = createRepository(db);
    warn = vi.fn<Logger['warn']>();
    ingest = createIngest(db, repo, { warn });
}

beforeEach(setup);
afterEach(() => db.close());

function score() {
    const current = repo.findMatch(MATCH)?.score;
    return current ? `${current.runs}/${current.wickets}` : null;
}

function ballIds() {
    return repo.listCommentary(MATCH).map((item) => item.ballId);
}

// Every stored row, to prove that nothing changed
function storedRows() {
    return {
        scores: db.prepare('SELECT * FROM scores ORDER BY provider').all(),
        balls: db.prepare('SELECT * FROM balls ORDER BY provider, ball_id').all(),
        deliveries: db.prepare('SELECT * FROM deliveries ORDER BY delivery_id').all(),
    };
}

describe('ingest', () => {
    test('follows the worked example step by step', () => {
        const steps = [
            { update: d1, score: '4/0', balls: ['b1'] },
            { update: d2, score: '4/1', balls: ['b1', 'b2'] },
            { update: d2, score: '4/1', balls: ['b1', 'b2'] },
            { update: d4, score: '10/1', balls: ['b1', 'b2', 'b4'] },
            { update: d3, score: '10/1', balls: ['b1', 'b2', 'b3', 'b4'] },
            { update: d5, score: '10/1', balls: ['b1', 'b2', 'b3', 'b4'] },
        ];

        for (const [index, step] of steps.entries()) {
            ingest(step.update);
            expect(score(), `step ${index + 1}`).toBe(step.score);
            expect(ballIds(), `step ${index + 1}`).toEqual(step.balls);
        }

        expect(repo.listCommentary(MATCH)[1]).toEqual(b2Corrected);
        expect(warn).not.toHaveBeenCalled();
    });

    test('a repeated deliveryId leaves stored rows unchanged', () => {
        ingest(d1);
        const before = storedRows();

        expect(ingest(d1)).toEqual({ duplicate: true, scoreApplied: false, ballsApplied: 0 });
        expect(storedRows()).toEqual(before);
    });

    test('a reused deliveryId with different data is ignored with a warning', () => {
        ingest(d1);
        const before = storedRows();

        ingest({ ...d4, deliveryId: 'd1' });

        expect(storedRows()).toEqual(before);
        expect(warn).toHaveBeenCalledOnce();
    });

    test('a stale score is ignored, but its late ball is saved in order', () => {
        ingest(d4);

        expect(ingest(d3)).toEqual({ duplicate: false, scoreApplied: false, ballsApplied: 1 });
        expect(score()).toBe('10/1');
        expect(ballIds()).toEqual(['b3', 'b4']);
    });

    test('a higher snapshot revision corrects the score', () => {
        ingest(d4);
        const corrected = { ...snapshot(4, 11, 1, '1.1'), revision: 2 };

        ingest({ ...d4, deliveryId: 'd6', snapshot: corrected, balls: [] });

        expect(score()).toBe('11/1');
    });

    test('an older ball revision does not undo a correction', () => {
        ingest(d5);
        ingest(d2);

        expect(repo.listCommentary(MATCH)).toEqual([b2Corrected]);
    });

    test('the same version with different data keeps the saved data and warns', () => {
        ingest(d1);

        ingest(push('d7', snapshot(1, 99, 0, '0.4'), { ...b1, text: 'changed' }));

        expect(score()).toBe('4/0');
        expect(repo.listCommentary(MATCH)).toEqual([b1]);
        expect(warn).toHaveBeenCalledTimes(2);
    });

    test('versions are compared separately for each provider', () => {
        ingest(d4);

        const result = ingest({
            provider: 'provider-b',
            providerMatchId: 'b-match-1001',
            snapshot: snapshot(1, 99, 0, '0.1'),
            balls: [],
        });

        expect(result.scoreApplied).toBe(true);
        expect(score()).toBe('10/1'); // provider A is primary
    });

    test('an unknown match saves nothing', () => {
        const before = storedRows();

        expect(() => ingest({ ...d1, providerMatchId: 'unknown' })).toThrow(UnknownMatchError);
        expect(storedRows()).toEqual(before);
    });

    test('a failed update rolls back completely and can be retried', () => {
        const before = storedRows();
        // Skips validation on purpose, so the database rejects the ball
        const broken = { ...d1, balls: [{ ...b1, innings: 0 }] };

        expect(() => ingest(broken)).toThrow(/CHECK constraint/);
        expect(storedRows()).toEqual(before);

        expect(ingest(d1)).toEqual({ duplicate: false, scoreApplied: true, ballsApplied: 1 });
    });

    test('every arrival order ends in the same state', () => {
        function orders<T>(items: T[]): T[][] {
            if (items.length === 0) return [[]];
            return items.flatMap((first, i) =>
                orders(items.toSpliced(i, 1)).map((rest) => [first, ...rest]),
            );
        }

        const allOrders = orders([d1, d2, d3, d4, d5]);
        expect(allOrders).toHaveLength(120);

        for (const order of allOrders) {
            db.close();
            setup();
            for (const update of order) ingest(update);

            const label = order.map((u) => u.deliveryId).join(',');
            expect(score(), label).toBe('10/1');
            expect(repo.listCommentary(MATCH), label).toEqual([b1, b2Corrected, b3, b4]);
        }
    });
});