// ═══════════ 曲のライブラリ (ブラウザ内に複数の曲を保存・一覧・開く・複製・削除) ═══════════
// IndexedDB に 1 曲 = 1 レコードで保存する (localStorage の 5MB 制限を避ける)。
// IndexedDB が使えない環境では localStorage に退避する。

let DB = "bluegarage";
const STORE = "songs";
let LS_FALLBACK = "bluegarage:library:v1";
// アプリごとに別の保管庫を使う (ピアノは "vesper")
export function configureLibrary(name) { DB = name; LS_FALLBACK = `${name}:library:v1`; dbPromise = null; }

let dbPromise = null;
function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (!("indexedDB" in window)) return reject(new Error("no indexedDB"));
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => { const db = req.result; if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" }); };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((e) => { console.warn("[library] IndexedDB 不可 → localStorage", e.message); return null; });
  return dbPromise;
}
function tx(db, mode, fn) {
  return new Promise((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const store = t.objectStore(STORE);
    const req = fn(store);
    t.oncomplete = () => resolve(req?.result);
    t.onerror = () => reject(t.error);
    t.onabort = () => reject(t.error);
  });
}
function lsAll() { try { return JSON.parse(localStorage.getItem(LS_FALLBACK) || "[]"); } catch { return []; } }
function lsWrite(list) { try { localStorage.setItem(LS_FALLBACK, JSON.stringify(list)); } catch {} }

export const newId = () => `song_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;

function meta(rec) {
  const s = rec.song;
  return { id: rec.id, kind: s?.kind ?? "composed", title: s?.title ?? "(無題)", updatedAt: rec.updatedAt, tempo: s?.tempo, key: s?.key, tracks: s?.tracks?.length ?? 0, notes: (s?.tracks ?? []).reduce((a, t) => a + (t.notes?.length ?? 0), 0), bars: (s?.sections ?? []).reduce((a, x) => a + x.bars, 0) };
}

export async function listSongs() {
  const db = await openDb();
  let recs;
  if (db) recs = (await tx(db, "readonly", (s) => s.getAll())) ?? [];
  else recs = lsAll();
  return recs.map(meta).sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
}
export async function saveSong(id, song) {
  const rec = { id, song, updatedAt: Date.now() };
  const db = await openDb();
  if (db) await tx(db, "readwrite", (s) => s.put(rec));
  else { const list = lsAll().filter((r) => r.id !== id); list.push(rec); lsWrite(list); }
  return meta(rec);
}
export async function loadSong(id) {
  const db = await openDb();
  const rec = db ? await tx(db, "readonly", (s) => s.get(id)) : lsAll().find((r) => r.id === id);
  return rec?.song ?? null;
}
export async function deleteSong(id) {
  const db = await openDb();
  if (db) await tx(db, "readwrite", (s) => s.delete(id));
  else lsWrite(lsAll().filter((r) => r.id !== id));
}
export async function findByTitle(title) {
  const q = String(title ?? "").toLowerCase();
  const list = await listSongs();
  return list.find((m) => m.title.toLowerCase() === q) ?? list.find((m) => m.title.toLowerCase().includes(q)) ?? null;
}
