import Database from 'better-sqlite3';
import path from 'path';

const dbPath = path.resolve(process.cwd(), 'shoption_backtests.db');
const db = new Database(dbPath);

db.exec(`
  CREATE TABLE IF NOT EXISTS backtests (
    id TEXT PRIMARY KEY,
    ticker TEXT,
    signal TEXT,
    entryTime INTEGER,
    entryDate TEXT,
    entryPrice REAL,
    peakPrice REAL,
    peakPremium REAL,
    entryPremium REAL,
    maxGainPct REAL,
    hitTarget INTEGER,
    strength INTEGER,
    reason TEXT
  );
`);

export default db;
