// lib/db.ts
// Removed better-sqlite3 for Vercel Serverless Function compatibility.
// In-memory array cache used to prevent 'Read-Only File System' crashes.

class MockDB {
  data: any[] = [];
  
  exec(sql: string) {
    if (sql.toUpperCase().includes('DELETE') || sql.toUpperCase().includes('DROP')) {
      this.data = [];
    }
  }
  
  prepare(sql: string) {
    return {
      run: (...args: any[]) => {
        this.data.push({
          id: args[0],
          ticker: args[1],
          signal: args[2],
          entryTime: args[3],
          entryDate: args[4],
          entryPrice: args[5],
          peakPrice: args[6],
          peakPremium: args[7],
          entryPremium: args[8],
          maxGainPct: args[9],
          hitTarget: args[10],
          strength: args[11],
          reason: args[12]
        });
      },
      all: () => {
        return [...this.data].sort((a, b) => b.entryTime - a.entryTime);
      }
    };
  }
}

// Ensure the db persists across warm serverless invocations if possible
const globalForDb = globalThis as unknown as { __db: MockDB };
const db = globalForDb.__db || new MockDB();

if (process.env.NODE_ENV !== 'production') {
  globalForDb.__db = db;
}

export default db;
