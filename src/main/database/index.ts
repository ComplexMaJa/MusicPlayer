import initSqlJs, { Database } from 'sql.js';
import fs from 'fs';
import path from 'path';
import { app } from 'electron';
import { Track, Album, Artist, Playlist, LibraryStats } from '../../shared/types';

let db: Database | null = null;
let dbPath = '';

export async function initDatabase(): Promise<Database> {
  if (db) return db;

  const userDataPath = app.getPath('userData');
  if (!fs.existsSync(userDataPath)) {
    fs.mkdirSync(userDataPath, { recursive: true });
  }
  dbPath = path.join(userDataPath, 'maja-library.db');

  const SQL = await initSqlJs();

  if (fs.existsSync(dbPath)) {
    const fileBuffer = fs.readFileSync(dbPath);
    db = new SQL.Database(fileBuffer);
  } else {
    db = new SQL.Database();
  }

  // Create tables & indexes
  db.run(`
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

    CREATE TABLE IF NOT EXISTS folders (
      path TEXT PRIMARY KEY,
      lastScanned INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_tracks_artist ON tracks(artist);
    CREATE INDEX IF NOT EXISTS idx_tracks_album ON tracks(album);
    CREATE INDEX IF NOT EXISTS idx_tracks_favorite ON tracks(isFavorite);
  `);

  // Seed default playlists if table is empty
  const plCheck = db.exec(`SELECT COUNT(*) FROM playlists`);
  if (plCheck.length && plCheck[0].values.length && (plCheck[0].values[0][0] as number) === 0) {
    const now = Date.now();
    const defaultPlaylists = [
      { id: 'pl_chill_vibes', name: 'Chill Vibes', description: 'Relaxing tracks for late night listening' },
      { id: 'pl_coding_playlist', name: 'Coding Playlist', description: 'Lo-fi and focused instrumental beats' },
      { id: 'pl_gym_playlist', name: 'Gym Playlist', description: 'High energy music for workouts' },
      { id: 'pl_city_pop', name: 'Japanese City Pop', description: 'Retro 80s Japanese grooves' },
    ];
    for (const pl of defaultPlaylists) {
      db.run(
        `INSERT INTO playlists (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
        [pl.id, pl.name, pl.description, now, now]
      );
    }
  }

  saveDatabase();
  return db;
}

export function saveDatabase(): void {
  if (!db || !dbPath) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (err) {
    console.error('Error saving SQLite database:', err);
  }
}

// Track operations
export function upsertTrack(track: Track): void {
  if (!db) return;
  const stmt = db.prepare(`
    INSERT INTO tracks (
      id, path, title, artist, album, albumArtist, trackNumber, discNumber,
      genre, year, duration, codec, sampleRate, bitDepth, bitrate, channels,
      artworkPath, dateAdded, lastPlayed, playCount, isFavorite
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
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
      artworkPath=excluded.artworkPath;
  `);

  stmt.run([
    track.id,
    track.path,
    track.title,
    track.artist,
    track.album,
    track.albumArtist || null,
    track.trackNumber || null,
    track.discNumber || null,
    track.genre || null,
    track.year || null,
    track.duration,
    track.codec,
    track.sampleRate || null,
    track.bitDepth || null,
    track.bitrate || null,
    track.channels || null,
    track.artworkPath || null,
    track.dateAdded,
    track.lastPlayed || null,
    track.playCount || 0,
    track.isFavorite ? 1 : 0,
  ]);
  stmt.free();
}

export function getAllTracks(): Track[] {
  if (!db) return [];
  const res = db.exec(`SELECT * FROM tracks ORDER BY artist, album, trackNumber, title`);
  if (!res.length) return [];
  const columns = res[0].columns;
  return res[0].values.map((row) => mapRowToTrack(columns, row));
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
  stmt.bind([trackId]);
  if (!stmt.step()) {
    stmt.free();
    return false;
  }
  const current = stmt.get()[0] as number;
  stmt.free();

  const nextVal = current === 1 ? 0 : 1;
  const updateStmt = db.prepare(`UPDATE tracks SET isFavorite = ? WHERE id = ?`);
  updateStmt.run([nextVal, trackId]);
  updateStmt.free();
  saveDatabase();
  return nextVal === 1;
}

export function recordPlayInDb(trackId: string): void {
  if (!db) return;
  const now = Date.now();
  const stmt = db.prepare(`UPDATE tracks SET playCount = playCount + 1, lastPlayed = ? WHERE id = ?`);
  stmt.run([now, trackId]);
  stmt.free();
  saveDatabase();
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
  return res[0].values.map((row) => {
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
  });
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
  const id = `pl_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const now = Date.now();
  db.run(
    `INSERT INTO playlists (id, name, description, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?)`,
    [id, name, description || null, now, now]
  );
  saveDatabase();
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
  if (!db) return false;
  const delPl = db.prepare(`DELETE FROM playlists WHERE id = ?`);
  delPl.run([id]);
  delPl.free();

  const delTracks = db.prepare(`DELETE FROM playlist_tracks WHERE playlistId = ?`);
  delTracks.run([id]);
  delTracks.free();

  saveDatabase();
  return true;
}

export function addTrackToPlaylistInDb(playlistId: string, trackId: string): boolean {
  if (!db) return false;
  const resStmt = db.prepare(`SELECT MAX(position) FROM playlist_tracks WHERE playlistId = ?`);
  resStmt.bind([playlistId]);
  let maxPos = 0;
  if (resStmt.step()) {
    const val = resStmt.get()[0];
    if (val !== null && val !== undefined) {
      maxPos = (val as number) + 1;
    }
  }
  resStmt.free();

  const insertStmt = db.prepare(
    `INSERT OR IGNORE INTO playlist_tracks (playlistId, trackId, position) VALUES (?, ?, ?)`
  );
  insertStmt.run([playlistId, trackId, maxPos]);
  insertStmt.free();

  const updateStmt = db.prepare(`UPDATE playlists SET updatedAt = ? WHERE id = ?`);
  updateStmt.run([Date.now(), playlistId]);
  updateStmt.free();

  saveDatabase();
  return true;
}

export function removeTrackFromPlaylistInDb(playlistId: string, trackId: string): boolean {
  if (!db) return false;
  const delStmt = db.prepare(`DELETE FROM playlist_tracks WHERE playlistId = ? AND trackId = ?`);
  delStmt.run([playlistId, trackId]);
  delStmt.free();

  const updateStmt = db.prepare(`UPDATE playlists SET updatedAt = ? WHERE id = ?`);
  updateStmt.run([Date.now(), playlistId]);
  updateStmt.free();

  saveDatabase();
  return true;
}

export function getPlaylistTracksFromDb(playlistId: string): Track[] {
  if (!db) return [];
  const stmt = db.prepare(`
    SELECT t.* FROM tracks t
    JOIN playlist_tracks pt ON t.id = pt.trackId
    WHERE pt.playlistId = ?
    ORDER BY pt.position ASC
  `);
  stmt.bind([playlistId]);
  const tracks: Track[] = [];
  const columns = stmt.getColumnNames();
  while (stmt.step()) {
    const row = stmt.get();
    tracks.push(mapRowToTrack(columns, row));
  }
  stmt.free();
  return tracks;
}

// Remove missing tracks (for scanner)
export function removeTracksNotInPaths(existingPaths: Set<string>): void {
  if (!db) return;
  const allTracks = getAllTracks();
  const delStmt = db.prepare(`DELETE FROM tracks WHERE id = ?`);
  for (const track of allTracks) {
    if (!existingPaths.has(track.path)) {
      delStmt.run([track.id]);
    }
  }
  delStmt.free();
  saveDatabase();
}

function mapRowToTrack(columns: string[], row: any[]): Track {
  const obj: any = {};
  columns.forEach((col, idx) => {
    obj[col] = row[idx];
  });
  return {
    id: obj.id,
    path: obj.path,
    title: obj.title,
    artist: obj.artist,
    album: obj.album,
    albumArtist: obj.albumArtist || undefined,
    trackNumber: obj.trackNumber || undefined,
    discNumber: obj.discNumber || undefined,
    genre: obj.genre || undefined,
    year: obj.year || undefined,
    duration: obj.duration,
    codec: obj.codec,
    sampleRate: obj.sampleRate || undefined,
    bitDepth: obj.bitDepth || undefined,
    bitrate: obj.bitrate || undefined,
    channels: obj.channels || undefined,
    artworkPath: obj.artworkPath || undefined,
    dateAdded: obj.dateAdded,
    lastPlayed: obj.lastPlayed || undefined,
    playCount: obj.playCount || 0,
    isFavorite: obj.isFavorite === 1,
  };
}
