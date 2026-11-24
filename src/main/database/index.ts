import initSqlJs, { Database, Statement } from 'sql.js';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { app } from 'electron';
import { Track, Album, Artist, Playlist, LibraryStats } from '../../shared/types';

type SqlJsModule = Awaited<ReturnType<typeof initSqlJs>>;

let db: Database | null = null;
let dbPath = '';

const DB_FILENAME = 'maja-library.db';
const SCHEMA_VERSION = 4;
const DATABASE_SAVE_DEBOUNCE_MS = 500;
const MAX_SCHEDULED_SAVE_RETRIES = 3;

let pendingSaveTimer: NodeJS.Timeout | null = null;
let scheduledSaveRetryCount = 0;
let transactionDepth = 0;

export interface IndexedTrackSignature {
  id: string;
  artworkPath?: string;
  fileMtime: number | null;
  fileSize: number | null;
}

export interface UpsertTrackBatchItem {
  track: Track;
  fileMtime?: number;
  size?: number;
}

function getBackupPath(): string {
  return `${dbPath}.bak`;
}

function locateSqlWasmFile(file: string, scriptDirectory: string): string {
  const candidates: string[] = [];

  if (process.resourcesPath) {
    candidates.push(
      path.join(process.resourcesPath, 'app.asar.unpacked', 'node_modules', 'sql.js', 'dist', file)
    );
  }

  try {
    const sqlJsEntry = require.resolve('sql.js');
    const sqlJsDir = path.dirname(sqlJsEntry);
    const unpackedDir = sqlJsDir.replace(/app\.asar([\\/])/i, 'app.asar.unpacked$1');
    if (unpackedDir !== sqlJsDir) {
      candidates.push(path.join(unpackedDir, file));
    }
    candidates.push(path.join(sqlJsDir, file));
  } catch {
    // Fall back to app/bundle paths below.
  }

  try {
    const appPath = app.getAppPath();
    const unpackedAppPath = appPath.replace(/app\.asar$/i, 'app.asar.unpacked');
    if (unpackedAppPath !== appPath) {
      candidates.push(path.join(unpackedAppPath, 'node_modules', 'sql.js', 'dist', file));
    }
    candidates.push(path.join(appPath, 'node_modules', 'sql.js', 'dist', file));
  } catch {
    // Ignore if app path is unavailable.
  }

  candidates.push(path.join(__dirname, file));
  candidates.push(path.join(__dirname, '..', 'node_modules', 'sql.js', 'dist', file));

  if (scriptDirectory) {
    candidates.push(path.join(scriptDirectory, file));
  }

  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }

  return scriptDirectory ? path.join(scriptDirectory, file) : file;
}

function getUserVersion(database: Database): number {
  const result = database.exec('PRAGMA user_version');
  const value = result[0]?.values[0]?.[0];
  return typeof value === 'number' ? value : 0;
}

function openDatabaseFile(SQL: SqlJsModule, filePath: string): Database | null {
  if (!fs.existsSync(filePath)) return null;

  let database: Database | null = null;

  try {
    const fileBuffer = fs.readFileSync(filePath);
    if (fileBuffer.length === 0) {
      throw new Error('Database file is empty');
    }

    database = new SQL.Database(fileBuffer);
    // sql.js can construct a handle for arbitrary bytes without touching the
    // file. Force a read so an invalid database is rejected here rather than
    // failing later during startup.
    database.exec('SELECT count(*) FROM sqlite_master');
    return database;
  } catch (err) {
    console.error(`Could not open database at ${filePath}:`, err);
    try {
      database?.close();
    } catch {
      // Ignore cleanup failures for the invalid handle.
    }
    return null;
  }
}

function quarantineDatabase(filePath: string): void {
  const corruptPath = `${filePath}.corrupt-${Date.now()}`;
  try {
    fs.renameSync(filePath, corruptPath);
    console.warn(`Moved unreadable database to ${corruptPath}`);
  } catch (err) {
    console.error('Failed to quarantine unreadable database:', err);
  }
}

function recoverFromBackup(SQL: SqlJsModule): Database | null {
  const backupPath = getBackupPath();
  if (!fs.existsSync(backupPath)) return null;

  const recovered = openDatabaseFile(SQL, backupPath);
  if (!recovered) {
    quarantineDatabase(backupPath);
    return null;
  }

  try {
    fs.copyFileSync(backupPath, dbPath);
    console.warn('Recovered library database from backup');
  } catch (err) {
    console.warn('Recovered database in memory but could not restore the primary file:', err);
  }

  return recovered;
}

function createSchema(database: Database): void {
  database.run(`
    CREATE TABLE IF NOT EXISTS tracks (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      artist TEXT NOT NULL,
      album TEXT NOT NULL,
      albumArtist TEXT,
      trackNumber INTEGER,
      discNumber INTEGER,
      genre TEXT,
      year INTEGER,
      duration REAL NOT NULL,
      codec TEXT NOT NULL,
      sampleRate INTEGER,
      bitDepth INTEGER,
      bitrate INTEGER,
      channels INTEGER,
      artworkPath TEXT,
      dateAdded INTEGER NOT NULL,
      lastPlayed INTEGER,
      playCount INTEGER DEFAULT 0,
      isFavorite INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS playlists (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT,
      artworkPath TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS playlist_tracks (
      playlistId TEXT NOT NULL,
      trackId TEXT NOT NULL,
      position INTEGER NOT NULL,
      PRIMARY KEY (playlistId, trackId),
      FOREIGN KEY (playlistId) REFERENCES playlists(id) ON DELETE CASCADE,
      FOREIGN KEY (trackId) REFERENCES tracks(id) ON DELETE CASCADE
    );
  `);
}

function createIndexes(database: Database): void {
  database.run(`
    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_favorite ON tracks(isFavorite);
    CREATE INDEX IF NOT EXISTS idx_tracks_dateAdded ON tracks(dateAdded DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_lastPlayed ON tracks(lastPlayed DESC);
    CREATE INDEX IF NOT EXISTS idx_tracks_artist_album ON tracks(artist, album);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_track ON playlist_tracks(trackId);
    CREATE INDEX IF NOT EXISTS idx_playlist_tracks_pos ON playlist_tracks(playlistId, position);
  `);
}

function normalizeAndDeduplicateTrackPaths(database: Database): void {
  const selectRes = database.exec(`SELECT * FROM tracks`);
  if (!selectRes.length || !selectRes[0].values.length) {
    return;
  }

  const columns = selectRes[0].columns;
  const rows = selectRes[0].values;

  type RawTrackRow = Record<string, unknown> & {
    id: string;
    path: string;
    duration: number;
    dateAdded: number;
    lastPlayed: number | null;
    playCount: number;
    isFavorite: number;
  };

  const groups = new Map<string, RawTrackRow[]>();
  for (const row of rows) {
    const obj: Record<string, unknown> = {};
    columns.forEach((col, idx) => {
      obj[col] = row[idx];
    });
    const rawPath = String(obj.path ?? '');
    if (!rawPath) continue;

    const normalizedPath = normalizePathForPlatform(rawPath);
    const key = process.platform === 'win32' ? normalizedPath.toLowerCase() : normalizedPath;
    const entry = obj as RawTrackRow;
    const existingGroup = groups.get(key);
    if (existingGroup) {
      existingGroup.push(entry);
    } else {
      groups.set(key, [entry]);
    }
  }

  const getPlaylistEntriesStmt = database.prepare(
    `SELECT playlistId, position FROM playlist_tracks WHERE trackId = ?`
  );
  const deleteTrackStmt = database.prepare(`DELETE FROM tracks WHERE id = ?`);
  const insertTrackStmt = database.prepare(`
    INSERT INTO tracks (
      id, path, title, artist, album, albumArtist, trackNumber, discNumber,
      genre, year, duration, codec, sampleRate, bitDepth, bitrate, channels,
      artworkPath, dateAdded, lastPlayed, playCount, isFavorite
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const insertPlaylistTrackStmt = database.prepare(
    `INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)`
  );

  try {
    for (const group of groups.values()) {
      const canonicalPath = normalizePathForPlatform(String(group[0].path));
      const canonicalId = crypto.createHash('md5').update(canonicalPath).digest('hex');

      const alreadyCanonical =
        group.length === 1 && group[0].path === canonicalPath && group[0].id === canonicalId;
      if (alreadyCanonical) {
        continue;
      }

      // Preserve every playlist association across all colliding rows before deleting old IDs.
      const playlistPositions = new Map<string, number>();
      for (const row of group) {
        getPlaylistEntriesStmt.bind([row.id]);
        while (getPlaylistEntriesStmt.step()) {
          const [playlistIdRaw, posRaw] = getPlaylistEntriesStmt.get();
          const playlistId = String(playlistIdRaw);
          const pos = typeof posRaw === 'number' ? posRaw : 0;
          const prevPos = playlistPositions.get(playlistId);
          if (prevPos === undefined || pos < prevPos) {
            playlistPositions.set(playlistId, pos);
          }
        }
        getPlaylistEntriesStmt.reset();
      }

      // Choose the best metadata row: prefer valid duration, artwork, and matching normalized path.
      const sorted = [...group].sort((a, b) => {
        const aHasDur = Number(a.duration) > 0 ? 1 : 0;
        const bHasDur = Number(b.duration) > 0 ? 1 : 0;
        if (aHasDur !== bHasDur) return bHasDur - aHasDur;
        const aHasArt = a.artworkPath ? 1 : 0;
        const bHasArt = b.artworkPath ? 1 : 0;
        if (aHasArt !== bHasArt) return bHasArt - aHasArt;
        const aNorm = a.path === canonicalPath ? 1 : 0;
        const bNorm = b.path === canonicalPath ? 1 : 0;
        if (aNorm !== bNorm) return bNorm - aNorm;
        return Number(b.dateAdded || 0) - Number(a.dateAdded || 0);
      });
      const base = sorted[0];

      const mergedIsFavorite = group.some((r) => Number(r.isFavorite) === 1) ? 1 : 0;
      const mergedPlayCount = group.reduce((sum, r) => sum + (Number(r.playCount) || 0), 0);
      let mergedDateAdded = Number(base.dateAdded) || Date.now();
      let mergedLastPlayed: number | null = null;

      for (const r of group) {
        const added = Number(r.dateAdded);
        if (Number.isFinite(added) && added > 0 && added < mergedDateAdded) {
          mergedDateAdded = added;
        }
        const played = r.lastPlayed !== null && r.lastPlayed !== undefined ? Number(r.lastPlayed) : null;
        if (played !== null && Number.isFinite(played)) {
          if (mergedLastPlayed === null || played > mergedLastPlayed) {
            mergedLastPlayed = played;
          }
        }
      }

      for (const r of group) {
        deleteTrackStmt.run([r.id]);
      }

      insertTrackStmt.run([
        canonicalId,
        canonicalPath,
        String(base.title ?? 'Unknown Title'),
        String(base.artist ?? 'Unknown Artist'),
        String(base.album ?? 'Unknown Album'),
        (base.albumArtist as string | null) ?? null,
        (base.trackNumber as number | null) ?? null,
        (base.discNumber as number | null) ?? null,
        (base.genre as string | null) ?? null,
        (base.year as number | null) ?? null,
        Number(base.duration) || 0,
        String(base.codec ?? 'AUDIO'),
        (base.sampleRate as number | null) ?? null,
        (base.bitDepth as number | null) ?? null,
        (base.bitrate as number | null) ?? null,
        (base.channels as number | null) ?? null,
        (base.artworkPath as string | null) ?? null,
        mergedDateAdded,
        mergedLastPlayed,
        mergedPlayCount,
        mergedIsFavorite,
      ]);

      for (const [playlistId, position] of playlistPositions.entries()) {
        insertPlaylistTrackStmt.run([playlistId, canonicalId, position]);
      }
    }
  } finally {
    getPlaylistEntriesStmt.free();
    deleteTrackStmt.free();
    insertTrackStmt.free();
    insertPlaylistTrackStmt.free();
  }
}

function ensureTrackSignatureColumns(database: Database): void {
  const infoRes = database.exec(`PRAGMA table_info(tracks)`);
  const existingCols = new Set<string>();
  if (infoRes.length) {
    for (const row of infoRes[0].values) {
      if (row[1] !== null && row[1] !== undefined) {
        existingCols.add(String(row[1]));
      }
    }
  }

  if (!existingCols.has('fileMtime')) {
    database.run(`ALTER TABLE tracks ADD COLUMN fileMtime REAL`);
  }
  if (!existingCols.has('fileSize')) {
    database.run(`ALTER TABLE tracks ADD COLUMN fileSize INTEGER`);
  }
}

function seedDefaultPlaylists(database: Database): void {
  const plCheck = database.exec(`SELECT COUNT(*) FROM playlists`);
  if (!plCheck.length || !plCheck[0].values.length || (plCheck[0].values[0][0] as number) !== 0) {
    return;
  }

  const now = Date.now();
  const defaultPlaylists = [
    { id: 'pl_chill_vibes', name: 'Chill Vibes', description: 'Relaxing tracks for late night listening' },
    { id: 'pl_coding_playlist', name: 'Coding Playlist', description: 'Lo-fi and focused instrumental beats' },
    { id: 'pl_gym_playlist', name: 'Gym Playlist', description: 'High energy music for workouts' },
    { id: 'pl_city_pop', name: 'Japanese City Pop', description: 'Retro 80s Japanese grooves' },
  ];

  for (const pl of defaultPlaylists) {
    database.run(
      `INSERT INTO playlists (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
      [pl.id, pl.name, pl.description, now, now]
    );
  }
}

type Migration = (database: Database) => void;

const MIGRATIONS: Record<number, Migration> = {
  1: (database) => {
    createSchema(database);
  },
  2: (database) => {
    createIndexes(database);
  },
  3: (database) => {
    normalizeAndDeduplicateTrackPaths(database);
  },
  4: (database) => {
    ensureTrackSignatureColumns(database);
  },
};

function runDatabaseTransaction<T>(database: Database, fn: () => T): T {
  const isTopLevel = transactionDepth === 0;
  const savepointName = `sp_${transactionDepth}`;

  if (isTopLevel) {
    database.run('BEGIN TRANSACTION');
  } else {
    database.run(`SAVEPOINT ${savepointName}`);
  }
  transactionDepth++;

  try {
    const result = fn();
    if (isTopLevel) {
      database.run('COMMIT');
    } else {
      database.run(`RELEASE SAVEPOINT ${savepointName}`);
    }
    return result;
  } catch (err) {
    try {
      if (isTopLevel) {
        database.run('ROLLBACK');
      } else {
        database.run(`ROLLBACK TO SAVEPOINT ${savepointName}`);
        database.run(`RELEASE SAVEPOINT ${savepointName}`);
      }
    } catch {
      // Ignore rollback errors after failure.
    }
    throw err;
  } finally {
    transactionDepth--;
  }
}

export function runInTransaction<T>(fn: () => T): T {
  if (!db) {
    throw new Error('Database not initialized');
  }
  return runDatabaseTransaction(db, fn);
}

function initializeSchema(database: Database, isNewDatabase: boolean): void {
  // Foreign keys are connection-scoped and must be enabled on every launch.
  database.run('PRAGMA foreign_keys = ON');

  const currentVersion = getUserVersion(database);
  for (let version = currentVersion + 1; version <= SCHEMA_VERSION; version++) {
    const migration = MIGRATIONS[version];
    if (!migration) {
      throw new Error(`Missing database migration for schema version ${version}`);
    }
    runDatabaseTransaction(database, () => {
      migration(database);
      database.run(`PRAGMA user_version = ${version}`);
    });
  }

  // Clean up orphaned playlist entries left behind by older versions where
  // foreign keys were not enabled.
  database.run(`
    DELETE FROM playlist_tracks
    WHERE playlistId NOT IN (SELECT id FROM playlists)
       OR trackId NOT IN (SELECT id FROM tracks)
  `);

  // Only seed a brand-new library. An existing library whose playlists were
  // intentionally deleted must not have the demo playlists recreated.
  if (isNewDatabase) {
    seedDefaultPlaylists(database);
  }
}

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  dbPath = path.join(userDataPath, DB_FILENAME);

  const isNewDatabase = !fs.existsSync(dbPath) && !fs.existsSync(getBackupPath());
  const SQL = await initSqlJs({ locateFile: locateSqlWasmFile });

  let database = openDatabaseFile(SQL, dbPath);

  if (!database) {
    if (fs.existsSync(dbPath)) {
      quarantineDatabase(dbPath);
    }
    database = recoverFromBackup(SQL);
  }

  // Last resort: start with an empty database rather than failing to launch.
  if (!database) {
    database = new SQL.Database();
  }

  db = database;
  initializeSchema(db, isNewDatabase);
  saveDatabase();
  return db;
}

function renameWithRetrySync(srcPath: string, destPath: string): void {
  const maxAttempts = process.platform === 'win32' ? 3 : 1;
  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      fs.renameSync(srcPath, destPath);
      return;
    } catch (err: unknown) {
      lastError = err;
      const code = (err as NodeJS.ErrnoException | null)?.code;
      if (code !== 'EPERM' && code !== 'EBUSY') {
        throw err;
      }
    }
  }
  throw lastError;
}

export function saveDatabase(): boolean {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  if (!db || !dbPath) return false;

  const backupPath = getBackupPath();
  const tempPath = `${dbPath}.tmp-${process.pid}`;
  let tempExists = false;
  let movedPrimaryToBackup = false;

  try {
    let buffer: Buffer;
    try {
      buffer = Buffer.from(db.export());
    } finally {
      // sql.js's export() closes and reopens the underlying connection, which
      // resets connection-scoped pragmas. Restore them unconditionally.
      try {
        db.run('PRAGMA foreign_keys = ON');
      } catch (pragmaErr) {
        console.error('Failed to restore PRAGMA foreign_keys:', pragmaErr);
      }
    }

    const fd = fs.openSync(tempPath, 'w');
    try {
      fs.writeFileSync(fd, buffer);
      fs.fsyncSync(fd);
    } finally {
      fs.closeSync(fd);
    }
    tempExists = true;

    // Atomically replace the existing backup only when moving primary -> backup
    // succeeds, so a failed rename or crash never leaves us with zero backups.
    if (fs.existsSync(dbPath)) {
      renameWithRetrySync(dbPath, backupPath);
      movedPrimaryToBackup = true;
    }

    renameWithRetrySync(tempPath, dbPath);
    tempExists = false;
    scheduledSaveRetryCount = 0;
    return true;
  } catch (err) {
    console.error('Error saving SQLite database:', err);

    if (movedPrimaryToBackup && !fs.existsSync(dbPath) && fs.existsSync(backupPath)) {
      try {
        renameWithRetrySync(backupPath, dbPath);
      } catch (restoreErr) {
        console.error('Failed to restore database after save failure:', restoreErr);
      }
    }

    if (tempExists) {
      try {
        fs.rmSync(tempPath, { force: true });
      } catch {
        // Nothing else we can do here.
      }
    }

    return false;
  }
}

/**
 * Persists the in-memory database after a short quiet period. User-visible
 * state is updated in memory immediately, so rapid streams of writes (play
 * counts, favorites, playlist edits) collapse into one export + fsync instead
 * of blocking the main thread on every change.
 */
export function scheduleDatabaseSave(delayMs = DATABASE_SAVE_DEBOUNCE_MS): void {
  if (!db || !dbPath) return;

  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
  }

  pendingSaveTimer = setTimeout(() => {
    pendingSaveTimer = null;
    const saved = saveDatabase();
    if (!saved) {
      if (scheduledSaveRetryCount < MAX_SCHEDULED_SAVE_RETRIES) {
        scheduledSaveRetryCount++;
        const backoffMs = DATABASE_SAVE_DEBOUNCE_MS * Math.pow(2, scheduledSaveRetryCount);
        console.warn(
          `Scheduled database save failed; retrying (${scheduledSaveRetryCount}/${MAX_SCHEDULED_SAVE_RETRIES}) in ${backoffMs}ms`
        );
        scheduleDatabaseSave(backoffMs);
      } else {
        console.error('Scheduled database save failed after maximum retries.');
      }
    }
  }, delayMs);
}

/** Writes any buffered changes immediately, including during app shutdown. */
export function flushDatabaseSave(): void {
  if (pendingSaveTimer) {
    clearTimeout(pendingSaveTimer);
    pendingSaveTimer = null;
  }

  if (db && dbPath) {
    saveDatabase();
  }
}

export function normalizePathForPlatform(p: string): string {
  const resolved = path.resolve(p);
  if (process.platform === 'win32') {
    return resolved.replace(/^[a-zA-Z]:/, (m) => m.toUpperCase());
  }
  return resolved;
}

// Track operations
export function isTrackPathKnown(filePath: string): boolean {
  if (!db || !filePath) return false;

  const normalized = normalizePathForPlatform(filePath);
  const stmt = db.prepare(`SELECT 1 FROM tracks WHERE path = ? LIMIT 1`);
  try {
    stmt.bind([normalized]);
    return stmt.step();
  } finally {
    stmt.free();
  }
}

export function getIndexedTracksForScan(): Map<string, IndexedTrackSignature> {
  const map = new Map<string, IndexedTrackSignature>();
  if (!db) return map;

  const res = db.exec(`SELECT id, path, artworkPath, fileMtime, fileSize FROM tracks`);
  if (!res.length) return map;

  for (const row of res[0].values) {
    const id = String(row[0]);
    const trackPath = String(row[1]);
    const artworkPath = row[2] ? String(row[2]) : undefined;
    const fileMtime = typeof row[3] === 'number' ? row[3] : null;
    const fileSize = typeof row[4] === 'number' ? row[4] : null;
    map.set(trackPath, { id, artworkPath, fileMtime, fileSize });
  }
  return map;
}

const UPSERT_TRACK_SQL = `
  INSERT INTO tracks (
    id, path, title, artist, album, albumArtist, trackNumber, discNumber,
    genre, year, duration, codec, sampleRate, bitDepth, bitrate, channels,
    artworkPath, dateAdded, lastPlayed, playCount, isFavorite, fileMtime, fileSize
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  ON CONFLICT(path) DO UPDATE SET
    title=excluded.title,
    artist=excluded.artist,
    album=excluded.album,
    albumArtist=excluded.albumArtist,
    trackNumber=excluded.trackNumber,
    discNumber=excluded.discNumber,
    genre=excluded.genre,
    year=excluded.year,
    duration=excluded.duration,
    codec=excluded.codec,
    sampleRate=excluded.sampleRate,
    bitDepth=excluded.bitDepth,
    bitrate=excluded.bitrate,
    channels=excluded.channels,
    artworkPath=excluded.artworkPath,
    fileMtime=excluded.fileMtime,
    fileSize=excluded.fileSize;
`;

function bindAndRunUpsert(
  stmt: Statement,
  track: Track,
  fileMtime?: number,
  size?: number
): void {
  stmt.run([
    track.id,
    track.path,
    track.title,
    track.artist,
    track.album,
    track.albumArtist || null,
    track.trackNumber ?? null,
    track.discNumber ?? null,
    track.genre || null,
    track.year ?? null,
    track.duration,
    track.codec,
    track.sampleRate ?? null,
    track.bitDepth ?? null,
    track.bitrate ?? null,
    track.channels ?? null,
    track.artworkPath || null,
    track.dateAdded,
    track.lastPlayed ?? null,
    track.playCount ?? 0,
    track.isFavorite ? 1 : 0,
    fileMtime ?? null,
    size ?? null,
  ]);
}

export function upsertTrack(track: Track, fileMtime?: number, size?: number): void {
  if (!db) return;
  const stmt = db.prepare(UPSERT_TRACK_SQL);
  try {
    bindAndRunUpsert(stmt, track, fileMtime, size);
  } finally {
    stmt.free();
  }
}

export function upsertTracksBatch(items: UpsertTrackBatchItem[]): void {
  if (!db || items.length === 0) return;

  runDatabaseTransaction(db, () => {
    const stmt = db!.prepare(UPSERT_TRACK_SQL);
    try {
      for (const item of items) {
        bindAndRunUpsert(stmt, item.track, item.fileMtime, item.size);
      }
    } finally {
      stmt.free();
    }
  });
}

export function getAllTracks(): Track[] {
  if (!db) return [];
  const res = db.exec(`
    SELECT * FROM tracks
    ORDER BY artist, album, COALESCE(discNumber, 1), COALESCE(trackNumber, 999999), title
  `);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => mapRowToTrack(columns, row));
}

export function getTracksByAlbum(artist: string, title: string): Track[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT * FROM tracks
    WHERE artist = ? AND album = ?
    ORDER BY COALESCE(discNumber, 1) ASC, COALESCE(trackNumber, 999999) ASC, title ASC
  `);
  try {
    stmt.bind([artist, title]);
    const tracks: Track[] = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      tracks.push(mapRowToTrack(columns, stmt.get()));
    }
    return tracks;
  } finally {
    stmt.free();
  }
}

export function getTracksByArtist(artist: string): Track[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT * FROM tracks
    WHERE artist = ?
    ORDER BY year DESC, album ASC, COALESCE(discNumber, 1) ASC, COALESCE(trackNumber, 999999) ASC, title ASC
  `);
  try {
    stmt.bind([artist]);
    const tracks: Track[] = [];
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      tracks.push(mapRowToTrack(columns, stmt.get()));
    }
    return tracks;
  } finally {
    stmt.free();
  }
}

export function getAlbumById(albumId: string): Album | null {
  if (!db || !albumId) return null;

  const sepIndex = albumId.indexOf('___');
  if (sepIndex !== -1) {
    const artist = albumId.slice(0, sepIndex);
    const title = albumId.slice(sepIndex + 3);
    const stmt = db.prepare(`
      SELECT
        album,
        artist,
        MAX(year) as year,
        MAX(artworkPath) as artworkPath,
        COUNT(*) as trackCount,
        SUM(duration) as totalDuration
      FROM tracks
      WHERE artist = ? AND album = ?
      GROUP BY album, artist
    `);
    try {
      stmt.bind([artist, title]);
      if (stmt.step()) {
        return mapRowToAlbum(stmt.get());
      }
    } finally {
      stmt.free();
    }

    // Fallback when artist or album name itself contains '___'
    if (albumId.indexOf('___', sepIndex + 3) !== -1) {
      const fallbackStmt = db.prepare(`
        SELECT
          album,
          artist,
          MAX(year) as year,
          MAX(artworkPath) as artworkPath,
          COUNT(*) as trackCount,
          SUM(duration) as totalDuration
        FROM tracks
        WHERE (artist || '___' || album) = ?
        GROUP BY album, artist
      `);
      try {
        fallbackStmt.bind([albumId]);
        if (fallbackStmt.step()) {
          return mapRowToAlbum(fallbackStmt.get());
        }
      } finally {
        fallbackStmt.free();
      }
    }
  }

  return null;
}

export function getArtistById(artistId: string): Artist | null {
  if (!db || !artistId) return null;
  const stmt = db.prepare(`
    SELECT
      artist,
      COUNT(*) as trackCount,
      COUNT(DISTINCT album) as albumCount,
      MAX(artworkPath) as artworkPath
    FROM tracks
    WHERE artist = ?
    GROUP BY artist
  `);
  try {
    stmt.bind([artistId]);
    if (!stmt.step()) return null;
    const row = stmt.get();
    const name = (row[0] as string) || 'Unknown Artist';
    return {
      id: name,
      name,
      trackCount: (row[1] as number) || 0,
      albumCount: (row[2] as number) || 0,
      artworkPath: (row[3] as string) || undefined,
    };
  } finally {
    stmt.free();
  }
}

export function getAlbumsByArtist(artistName: string): Album[] {
  if (!db || !artistName) return [];
  const stmt = db.prepare(`
    SELECT
      album,
      artist,
      MAX(year) as year,
      MAX(artworkPath) as artworkPath,
      COUNT(*) as trackCount,
      SUM(duration) as totalDuration
    FROM tracks
    WHERE artist = ?
    GROUP BY album, artist
    ORDER BY album ASC
  `);
  try {
    stmt.bind([artistName]);
    const albums: Album[] = [];
    while (stmt.step()) {
      albums.push(mapRowToAlbum(stmt.get()));
    }
    return albums;
  } finally {
    stmt.free();
  }
}

export function getAllArtworkPaths(): string[] {
  if (!db) return [];
  const paths = new Set<string>();
  const trackRes = db.exec(`SELECT artworkPath FROM tracks WHERE artworkPath IS NOT NULL`);
  if (trackRes.length) {
    for (const row of trackRes[0].values) {
      paths.add(String(row[0]));
    }
  }
  const playlistRes = db.exec(`SELECT artworkPath FROM playlists WHERE artworkPath IS NOT NULL`);
  if (playlistRes.length) {
    for (const row of playlistRes[0].values) {
      paths.add(String(row[0]));
    }
  }
  return Array.from(paths);
}

export function getRecentlyPlayed(): Track[] {
  if (!db) return [];
  const res = db.exec(`SELECT * FROM tracks WHERE lastPlayed IS NOT NULL ORDER BY lastPlayed DESC LIMIT 20`);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => mapRowToTrack(columns, row));
}

export function getRecentlyAdded(): Track[] {
  if (!db) return [];
  const res = db.exec(`SELECT * FROM tracks ORDER BY dateAdded DESC LIMIT 20`);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => mapRowToTrack(columns, row));
}

export function getFavorites(): Track[] {
  if (!db) return [];
  const res = db.exec(`SELECT * FROM tracks WHERE isFavorite = 1 ORDER BY title`);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => mapRowToTrack(columns, row));
}

export function toggleFavoriteInDb(trackId: string): boolean {
  if (!db) return false;
  const stmt = db.prepare(`SELECT isFavorite FROM tracks WHERE id = ?`);
  let current = 0;
  try {
    stmt.bind([trackId]);
    if (!stmt.step()) {
      return false;
    }
    current = stmt.get()[0] as number;
  } finally {
    stmt.free();
  }

  const nextVal = current === 1 ? 0 : 1;
  const updateStmt = db.prepare(`UPDATE tracks SET isFavorite = ? WHERE id = ?`);
  try {
    updateStmt.run([nextVal, trackId]);
  } finally {
    updateStmt.free();
  }
  scheduleDatabaseSave();
  return nextVal === 1;
}

export function recordPlayInDb(trackId: string): void {
  if (!db) return;
  const now = Date.now();
  const stmt = db.prepare(`UPDATE tracks SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?`);
  try {
    stmt.run([now, trackId]);
  } finally {
    stmt.free();
  }
  scheduleDatabaseSave();
}

export function getAlbums(): Album[] {
  if (!db) return [];
  const res = db.exec(`
    SELECT
      album,
      artist,
      MAX(year) as year,
      MAX(artworkPath) as artworkPath,
      COUNT(*) as trackCount,
      SUM(duration) as totalDuration
    FROM tracks
    GROUP BY album, artist
    ORDER BY album
  `);
  if (!res.length) return [];
  return res[0].values.map((row) => mapRowToAlbum(row));
}

export function getArtists(): Artist[] {
  if (!db) return [];
  const res = db.exec(`
    SELECT
      artist,
      COUNT(*) as trackCount,
      COUNT(DISTINCT album) as albumCount,
      MAX(artworkPath) as artworkPath
    FROM tracks
    GROUP BY artist
    ORDER BY artist
  `);
  if (!res.length) return [];
  return res[0].values.map((row) => {
    const name = (row[0] as string) || 'Unknown Artist';
    return {
      id: name,
      name,
      trackCount: (row[1] as number) || 0,
      albumCount: (row[2] as number) || 0,
      artworkPath: (row[3] as string) || undefined,
    };
  });
}

export function getLibraryStats(): LibraryStats {
  if (!db) return { trackCount: 0, albumCount: 0, artistCount: 0, playlistCount: 0, totalDuration: 0 };
  const trackRes = db.exec(`SELECT COUNT(*), SUM(duration), COUNT(DISTINCT album), COUNT(DISTINCT artist) FROM tracks`);
  const playlistRes = db.exec(`SELECT COUNT(*) FROM playlists`);

  let trackCount = 0;
  let totalDuration = 0;
  let albumCount = 0;
  let artistCount = 0;
  let playlistCount = 0;

  if (trackRes.length && trackRes[0].values.length) {
    const row = trackRes[0].values[0];
    trackCount = (row[0] as number) || 0;
    totalDuration = (row[1] as number) || 0;
    albumCount = (row[2] as number) || 0;
    artistCount = (row[3] as number) || 0;
  }

  if (playlistRes.length && playlistRes[0].values.length) {
    playlistCount = (playlistRes[0].values[0][0] as number) || 0;
  }

  return { trackCount, totalDuration, albumCount, artistCount, playlistCount };
}

// Playlist operations
export function getAllPlaylists(): Playlist[] {
  if (!db) return [];
  const res = db.exec(`
    SELECT
      p.id, p.name, p.description, p.artworkPath, p.createdAt, p.updatedAt,
      COUNT(pt.trackId) as trackCount,
      COALESCE(SUM(t.duration), 0) as totalDuration
    FROM playlists p
    LEFT JOIN playlist_tracks pt ON p.id = pt.playlistId
    LEFT JOIN tracks t ON pt.trackId = t.id
    GROUP BY p.id
    ORDER BY p.updatedAt DESC
  `);
  if (!res.length) return [];
  return res[0].values.map((row) => ({
    id: row[0] as string,
    name: row[1] as string,
    description: (row[2] as string) || undefined,
    artworkPath: (row[3] as string) || undefined,
    createdAt: row[4] as number,
    updatedAt: row[5] as number,
    trackCount: (row[6] as number) || 0,
    totalDuration: (row[7] as number) || 0,
  }));
}

export function createPlaylistInDb(name: string, description?: string): Playlist {
  if (!db) throw new Error('Database not initialized');
  const id = `pl_${crypto.randomUUID()}`;
  const now = Date.now();
  db.run(
    `INSERT INTO playlists (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [id, name, description || null, now, now]
  );
  scheduleDatabaseSave();
  return {
    id,
    name,
    description,
    trackCount: 0,
    totalDuration: 0,
    createdAt: now,
    updatedAt: now,
  };
}

export function deletePlaylistInDb(id: string): boolean {
  if (!db || !id) return false;

  const deleted = runDatabaseTransaction(db, () => {
    const delPl = db!.prepare(`DELETE FROM playlists WHERE id = ?`);
    try {
      delPl.run([id]);
    } finally {
      delPl.free();
    }
    const rowsDeleted = db!.getRowsModified();
    if (rowsDeleted === 0) {
      return false;
    }

    const delTracks = db!.prepare(`DELETE FROM playlist_tracks WHERE playlistId = ?`);
    try {
      delTracks.run([id]);
    } finally {
      delTracks.free();
    }
    return true;
  });

  if (deleted) {
    scheduleDatabaseSave();
  }
  return deleted;
}

export function addTracksToPlaylistInDb(playlistId: string, trackIds: string[]): boolean {
  if (!db || !playlistId || !trackIds || trackIds.length === 0) return false;

  const uniqueTrackIds = Array.from(
    new Set(trackIds.filter((id): id is string => typeof id === 'string' && id.length > 0))
  );
  if (uniqueTrackIds.length === 0) return false;

  const plStmt = db.prepare(`SELECT 1 FROM playlists WHERE id = ? LIMIT 1`);
  try {
    plStmt.bind([playlistId]);
    if (!plStmt.step()) {
      return false;
    }
  } finally {
    plStmt.free();
  }

  let maxPos = 0;
  const resStmt = db.prepare(`SELECT MAX(position) FROM playlist_tracks WHERE playlistId = ?`);
  try {
    resStmt.bind([playlistId]);
    if (resStmt.step()) {
      const val = resStmt.get()[0];
      if (val !== null && val !== undefined) {
        maxPos = (val as number) + 1;
      }
    }
  } finally {
    resStmt.free();
  }

  let addedAny = false;
  try {
    runDatabaseTransaction(db, () => {
      const trackExistsStmt = db!.prepare(`SELECT 1 FROM tracks WHERE id = ? LIMIT 1`);
      const insertStmt = db!.prepare(
        `INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)`
      );
      const updateStmt = db!.prepare(`UPDATE playlists SET updatedAt = ? WHERE id = ?`);

      try {
        for (const trackId of uniqueTrackIds) {
          trackExistsStmt.bind([trackId]);
          const trackExists = trackExistsStmt.step();
          trackExistsStmt.reset();
          if (!trackExists) continue;

          insertStmt.run([playlistId, trackId, maxPos]);
          if (db!.getRowsModified() > 0) {
            maxPos++;
            addedAny = true;
          }
        }

        if (addedAny) {
          updateStmt.run([Date.now(), playlistId]);
        }
      } finally {
        trackExistsStmt.free();
        insertStmt.free();
        updateStmt.free();
      }
    });
  } catch (err) {
    console.error('Failed to add tracks to playlist in batch:', err);
    return false;
  }

  if (addedAny) {
    scheduleDatabaseSave();
  }
  return true;
}

export const addTracksToPlaylist = addTracksToPlaylistInDb;

export function addTrackToPlaylistInDb(playlistId: string, trackId: string): boolean {
  return addTracksToPlaylistInDb(playlistId, [trackId]);
}

export function removeTrackFromPlaylistInDb(playlistId: string, trackId: string): boolean {
  if (!db || !playlistId || !trackId) return false;

  const removed = runDatabaseTransaction(db, () => {
    const delStmt = db!.prepare(`DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?`);
    try {
      delStmt.run([playlistId, trackId]);
    } finally {
      delStmt.free();
    }

    if (db!.getRowsModified() === 0) {
      return false;
    }

    const updateStmt = db!.prepare(`UPDATE playlists SET updatedAt = ? WHERE id = ?`);
    try {
      updateStmt.run([Date.now(), playlistId]);
    } finally {
      updateStmt.free();
    }
    return true;
  });

  if (removed) {
    scheduleDatabaseSave();
  }
  return removed;
}

export function getPlaylistTracksFromDb(playlistId: string): Track[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT t.* FROM tracks t
    JOIN playlist_tracks pt ON t.id = pt.trackId
    WHERE pt.playlistId = ?
    ORDER BY pt.position ASC
  `);
  const tracks: Track[] = [];
  try {
    stmt.bind([playlistId]);
    const columns = stmt.getColumnNames();
    while (stmt.step()) {
      const row = stmt.get();
      tracks.push(mapRowToTrack(columns, row));
    }
  } finally {
    stmt.free();
  }
  return tracks;
}

// Remove missing tracks (for scanner). The caller is responsible for
// persisting the database once the scan has finished.
export function removeTracksNotInPaths(existingPaths: Set<string>): void {
  if (!db) return;

  const res = db.exec(`SELECT id, path FROM tracks`);
  if (!res.length || !res[0].values.length) return;

  const idsToDelete: string[] = [];
  for (const row of res[0].values) {
    const id = String(row[0]);
    const trackPath = String(row[1]);
    if (!existingPaths.has(trackPath)) {
      idsToDelete.push(id);
    }
  }

  if (idsToDelete.length === 0) return;

  runDatabaseTransaction(db, () => {
    const delStmt = db!.prepare(`DELETE FROM tracks WHERE id = ?`);
    try {
      for (const id of idsToDelete) {
        delStmt.run([id]);
      }
    } finally {
      delStmt.free();
    }
  });
}

function mapRowToAlbum(row: unknown[]): Album {
  const title = (row[0] as string) || 'Unknown Album';
  const artist = (row[1] as string) || 'Unknown Artist';
  return {
    id: `${artist}___${title}`,
    title,
    artist,
    year: (row[2] as number) || undefined,
    artworkPath: (row[3] as string) || undefined,
    trackCount: (row[4] as number) || 0,
    totalDuration: (row[5] as number) || 0,
  };
}

function mapRowToTrack(columns: string[], row: unknown[]): Track {
  const obj: Record<string, unknown> = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id as string,
    path: obj.path as string,
    title: obj.title as string,
    artist: obj.artist as string,
    album: obj.album as string,
    albumArtist: (obj.albumArtist as string) || undefined,
    trackNumber: (obj.trackNumber as number) ?? undefined,
    discNumber: (obj.discNumber as number) ?? undefined,
    genre: (obj.genre as string) || undefined,
    year: (obj.year as number) ?? undefined,
    duration: obj.duration as number,
    codec: obj.codec as string,
    sampleRate: (obj.sampleRate as number) ?? undefined,
    bitDepth: (obj.bitDepth as number) ?? undefined,
    bitrate: (obj.bitrate as number) ?? undefined,
    channels: (obj.channels as number) ?? undefined,
    artworkPath: (obj.artworkPath as string) || undefined,
    dateAdded: obj.dateAdded as number,
    lastPlayed: (obj.lastPlayed as number) ?? undefined,
    playCount: (obj.playCount as number) || 0,
    isFavorite: obj.isFavorite === 1,
  };
}
