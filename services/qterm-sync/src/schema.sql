PRAGMA foreign_keys = ON;
CREATE TABLE IF NOT EXISTS metadata (
  singleton INTEGER PRIMARY KEY CHECK(singleton = 1),
  server_id TEXT NOT NULL,
  revision INTEGER NOT NULL CHECK(revision >= 0)
);
CREATE TABLE IF NOT EXISTS profile_groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL COLLATE NOCASE UNIQUE
);
CREATE TABLE IF NOT EXISTS profiles (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  host TEXT NOT NULL,
  port INTEGER NOT NULL CHECK(port BETWEEN 1 AND 65535),
  username TEXT NOT NULL,
  auth_preference TEXT NOT NULL,
  group_id TEXT REFERENCES profile_groups(id)
);
CREATE TABLE IF NOT EXISTS profile_jumps (
  profile_id TEXT NOT NULL REFERENCES profiles(id),
  jump_id TEXT NOT NULL REFERENCES profiles(id),
  position INTEGER NOT NULL CHECK(position BETWEEN 0 AND 3),
  PRIMARY KEY(profile_id, position),
  UNIQUE(profile_id, jump_id),
  CHECK(profile_id != jump_id)
);
PRAGMA user_version = 1;
