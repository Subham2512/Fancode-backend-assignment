CREATE TABLE IF NOT EXISTS matches (
  id               TEXT NOT NULL PRIMARY KEY CHECK (id <> ''),
  primary_provider TEXT NOT NULL CHECK (primary_provider <> '')
) STRICT;

-- Maps each provider's match id to our match id
CREATE TABLE IF NOT EXISTS provider_matches (
  provider          TEXT NOT NULL CHECK (provider <> ''),
  provider_match_id TEXT NOT NULL CHECK (provider_match_id <> ''),
  match_id          TEXT NOT NULL REFERENCES matches (id),
  PRIMARY KEY (provider, provider_match_id),
  UNIQUE (match_id, provider)
) STRICT;

-- Push messages already processed
CREATE TABLE IF NOT EXISTS deliveries (
  provider    TEXT NOT NULL,
  delivery_id TEXT NOT NULL CHECK (delivery_id <> ''),
  payload     TEXT NOT NULL,
  PRIMARY KEY (provider, delivery_id)
) STRICT;

-- Latest score, one row per match per provider
CREATE TABLE IF NOT EXISTS scores (
  match_id   TEXT    NOT NULL,
  provider   TEXT    NOT NULL,
  sequence   INTEGER NOT NULL CHECK (sequence >= 0),
  revision   INTEGER NOT NULL CHECK (revision >= 1),
  status     TEXT    NOT NULL CHECK (
    status IN ('scheduled', 'live', 'innings_break', 'completed', 'abandoned')
  ),
  innings    INTEGER NOT NULL CHECK (innings >= 1),
  runs       INTEGER NOT NULL CHECK (runs >= 0),
  wickets    INTEGER NOT NULL CHECK (wickets >= 0),
  overs      TEXT    NOT NULL,
  updated_at TEXT    NOT NULL,
  PRIMARY KEY (match_id, provider),
  FOREIGN KEY (match_id, provider)
    REFERENCES provider_matches (match_id, provider)
) STRICT;

-- Latest version of each ball, per match per provider
CREATE TABLE IF NOT EXISTS balls (
  match_id    TEXT    NOT NULL,
  provider    TEXT    NOT NULL,
  ball_id     TEXT    NOT NULL CHECK (ball_id <> ''),
  sequence    INTEGER NOT NULL CHECK (sequence >= 0),
  revision    INTEGER NOT NULL CHECK (revision >= 1),
  innings     INTEGER NOT NULL CHECK (innings >= 1),
  over_number INTEGER NOT NULL CHECK (over_number >= 0),
  ball_number INTEGER NOT NULL CHECK (ball_number >= 0),
  text        TEXT    NOT NULL,
  PRIMARY KEY (match_id, provider, ball_id),
  FOREIGN KEY (match_id, provider)
    REFERENCES provider_matches (match_id, provider)
) STRICT;

-- Supports reading commentary in display order
CREATE INDEX IF NOT EXISTS balls_by_sequence
  ON balls (match_id, provider, sequence, ball_id);