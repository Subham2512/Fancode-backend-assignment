import { afterEach, beforeEach, describe, expect, test } from 'vitest';
import { buildApp } from '../src/api/app';
import { matches } from '../src/config/matches';
import { openDb, type Db } from '../src/db/connection';
import { seedMatches } from '../src/db/seed';
import type { Ball, PushEvent, Snapshot } from '../src/domain/types';
import type { Ingest } from '../src/ingestion/ingest';

let db: Db;
let app: ReturnType<typeof buildApp>['app'];
let ingest: Ingest;

beforeEach(() => {
    db = openDb(':memory:');
    seedMatches(db, matches);
    ({ app, ingest } = buildApp({ db }));
});

afterEach(async () => {
    await app.close();
    if (db.open) db.close();
});

function snapshot(sequence: number, runs: number): Snapshot {
    return { sequence, revision: 1, status: 'live', innings: 1, runs, wickets: 1, overs: '1.1' };
}

function ball(sequence: number, text: string, revision = 1): Ball {
    return { ballId: `b${sequence}`, sequence, revision, innings: 1, over: 0, ball: sequence, text };
}

function event(deliveryId: string, data: Pick<PushEvent, 'snapshot' | 'commentary'>): PushEvent {
    return {
        provider: 'provider-a',
        deliveryId,
        occurredAt: '2026-10-22T14:03:11.000Z',
        providerMatchId: 'a-match-1001',
        ...data,
    };
}

function send(payload: object) {
    return app.inject({ method: 'POST', url: '/webhooks/provider-a', payload });
}

async function get(url: string) {
    const response = await app.inject(url);
    return { status: response.statusCode, body: response.json() };
}

function countDeliveries() {
    return db.prepare('SELECT count(*) FROM deliveries').pluck().get();
}

describe('webhook', () => {
    test('replies 200 for a new update and for its duplicate', async () => {
        const payload = event('d1', { snapshot: snapshot(1, 4), commentary: ball(1, 'four') });

        const first = await send(payload);
        const second = await send(payload);

        expect(first.statusCode).toBe(200);
        expect(first.json()).toEqual({ duplicate: false, scoreApplied: true, ballsApplied: 1 });
        expect(second.statusCode).toBe(200);
        expect(second.json()).toEqual({ duplicate: true, scoreApplied: false, ballsApplied: 0 });
        expect((await get('/matches/match-1/commentary')).body.items).toHaveLength(1);
    });

    test('replies 400 to invalid data without using up the deliveryId', async () => {
        const valid = event('d1', { snapshot: snapshot(1, 4) });

        const rejected = await send({ ...valid, snapshot: { ...valid.snapshot, runs: '4' } });

        expect(rejected.statusCode).toBe(400);
        expect(rejected.json().issues[0].field).toBe('snapshot.runs');
        expect(countDeliveries()).toBe(0);
        expect((await send(valid)).json().scoreApplied).toBe(true);
    });

    test('replies 400 to broken JSON', async () => {
        const response = await app.inject({
            method: 'POST',
            url: '/webhooks/provider-a',
            headers: { 'content-type': 'application/json' },
            payload: '{broken',
        });

        expect(response.statusCode).toBe(400);
    });

    test('replies 422 to an unknown provider match', async () => {
        const payload = event('d1', { snapshot: snapshot(1, 4) });

        const response = await send({ ...payload, providerMatchId: 'unknown' });

        expect(response.statusCode).toBe(422);
        expect(countDeliveries()).toBe(0);
    });

    test('replies 500 without leaking details when the database fails', async () => {
        db.close();

        const response = await send(event('d1', { snapshot: snapshot(1, 4) }));

        expect(response.statusCode).toBe(500);
        expect(response.json()).toEqual({ error: 'internal server error' });
    });
});

describe('read API', () => {
    test('shows an empty match before any data arrives', async () => {
        expect((await get('/matches')).body).toEqual({
            matches: [{ id: 'match-1', status: null, score: null }],
        });
        expect((await get('/matches/match-1')).body).toEqual({
            id: 'match-1',
            status: null,
            score: null,
        });
        expect((await get('/matches/match-1/score')).body).toEqual({
            matchId: 'match-1',
            score: null,
        });
        expect((await get('/matches/match-1/commentary')).body).toEqual({
            matchId: 'match-1',
            items: [],
        });
    });

    test('returns the stored score', async () => {
        await send(event('d1', { snapshot: snapshot(1, 4) }));

        const score = {
            status: 'live',
            innings: 1,
            runs: 4,
            wickets: 1,
            overs: '1.1',
            scoreUpdatedAt: expect.any(String),
        };
        expect((await get('/matches/match-1/score')).body).toEqual({ matchId: 'match-1', score });
        expect((await get('/matches/match-1')).body).toEqual({ id: 'match-1', status: 'live', score });
        expect((await get('/matches')).body.matches[0].score).toEqual({
            runs: 4,
            wickets: 1,
            overs: '1.1',
        });
    });

    test('keeps the newer score and orders a late ball and a correction', async () => {
        await send(event('d1', { snapshot: snapshot(1, 4), commentary: ball(1, 'one') }));
        await send(event('d3', { snapshot: snapshot(3, 10), commentary: ball(3, 'three') }));
        await send(event('d2', { snapshot: snapshot(2, 8), commentary: ball(2, 'two') }));
        await send(event('d4', { commentary: ball(2, 'two, corrected', 2) }));

        expect((await get('/matches/match-1/score')).body.score.runs).toBe(10);
        expect((await get('/matches/match-1/commentary')).body.items).toEqual([
            ball(1, 'one'),
            ball(2, 'two, corrected', 2),
            ball(3, 'three'),
        ]);
    });

    test('shows only the primary provider', async () => {
        await send(event('d1', { snapshot: snapshot(1, 4), commentary: ball(1, 'from A') }));

        ingest({
            provider: 'provider-b',
            providerMatchId: 'b-match-1001',
            snapshot: snapshot(99, 500),
            balls: [ball(9, 'from B')],
        });

        expect((await get('/matches/match-1/score')).body.score.runs).toBe(4);
        expect((await get('/matches/match-1/commentary')).body.items).toEqual([ball(1, 'from A')]);
    });

    test.each([
        '/matches/unknown',
        '/matches/unknown/score',
        '/matches/unknown/commentary',
        '/matches/a-match-1001', // a provider id is not a client id
    ])('replies 404 to %s', async (url) => {
        expect(await get(url)).toEqual({ status: 404, body: { error: 'match not found' } });
    });
});