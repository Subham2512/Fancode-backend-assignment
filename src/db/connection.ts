import { readFileSync } from 'node:fs';
import Database from 'better-sqlite3';

const schemaUrl = new URL('./schema.sql', import.meta.url);

export type Db = Database.Database;

export function openDb(path: string): Db {
    const db = new Database(path);

    db.pragma('journal_mode = WAL');
    // Sync on every commit, so acknowledged writes can survive power loss
    db.pragma('synchronous = FULL');
    db.pragma('foreign_keys = ON');
    // Wait up to 5s if another connection holds a lock
    db.pragma('busy_timeout = 5000');

    db.exec(readFileSync(schemaUrl, 'utf8'));

    return db;
}