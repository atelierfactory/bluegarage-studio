// File validation is shared by the page and tools/band-check.mjs. No DOM/audio.
import { DRUM_KEYS, KICK, KEY_OF_DRUM } from "./prompts.js";
import { KNOBS, SYNTH2_PATCH_SCHEMA } from "../js/synth2.js";

export function partsFromSong(song) {
  const get = (role) => song.tracks.find((t) => t.role === role);
  return { synth: get("keys").notes, pedal: get("pedal").notes,
    drums: get("drums").notes.filter((n) => n.p !== KICK).map((n) => ({ ...n, k: n.k ?? KEY_OF_DRUM[n.p] })),
    kick: get("drums").notes.filter((n) => n.p === KICK), knobs: get("keys").knobs ?? [] };
}

export function validateBandSong(song) {
  const errors = [];
  const fail = (path, text) => errors.push(`${path}: ${text}`);
  const number = (x, lo, hi) => typeof x === "number" && Number.isFinite(x) && x >= lo && x <= hi;
  const schema = (value, rule, path) => {
    if (rule.type === "object") {
      if (!value || typeof value !== "object" || Array.isArray(value)) { fail(path, "object required"); return; }
      for (const key of rule.required ?? []) if (!(key in value)) fail(`${path}.${key}`, "required");
      for (const [key, child] of Object.entries(rule.properties)) if (key in value) schema(value[key], child, `${path}.${key}`);
    } else if (rule.type === "array") {
      if (!Array.isArray(value)) { fail(path, "array required"); return; }
      value.forEach((x, i) => schema(x, rule.items, `${path}[${i}]`));
    } else if (rule.type === "number" || rule.type === "integer") {
      if (!number(value, rule.minimum ?? -Infinity, rule.maximum ?? Infinity) || (rule.type === "integer" && !Number.isInteger(value))) fail(path, "invalid number");
    } else if (typeof value !== rule.type) fail(path, `${rule.type} required`);
    if (rule.enum && !rule.enum.includes(value)) fail(path, "unknown value");
  };
  if (!song || typeof song !== "object") return ["song: 曲がありません"];
  if (typeof song.title !== "string" || !song.title.trim()) fail("title", "曲名がありません");
  if (!number(song.tempo, 30, 300)) fail("tempo", "30〜300");
  if (![3, 4].includes(song.timeSig)) fail("timeSig", "3 または 4");
  if (!Array.isArray(song.sections) || !song.sections.length || song.sections.some((s) => !Number.isInteger(s?.bars) || s.bars < 1 || s.bars > 512)) fail("sections", "小節数が不正です");
  const end = (Array.isArray(song.sections) ? song.sections : []).reduce((sum, s) => sum + (Number(s?.bars) || 0), 0) * song.timeSig;
  if (!number(end, 1, 4096)) fail("sections", "曲が長すぎます");
  if (!Array.isArray(song.tempoMap ?? [])) fail("tempoMap", "array required");
  else {
    let previous = -1;
    for (const p of song.tempoMap ?? []) {
      if (!number(p?.beat, 0, end) || p.beat <= previous || !number(p?.tempo, 30, 300)) fail("tempoMap", "拍または速さが不正です");
      previous = p?.beat;
    }
  }
  if (!song.master || typeof song.master !== "object") fail("master", "音量設定がありません");
  else for (const [key, lo, hi] of [["volume", -60, 6], ["hallDecay", 0.1, 12], ["roomDecay", 0.1, 12], ["glue", 0, 1], ["width", 0, 2], ["targetLufs", -40, 0]]) if (!number(song.master[key], lo, hi)) fail(`master.${key}`, "invalid number");
  if (!Array.isArray(song.tracks) || song.tracks.length !== 3) return [...errors, "tracks: 右手・足鍵盤・ドラムの3つが必要です"];
  const ids = new Set(), roles = new Set(); let count = 0;
  for (const t of song.tracks) {
    if (!t || typeof t !== "object") { fail("track", "object required"); continue; }
    const expected = { keys: "synth", pedal: "synth-bass", drums: "drums" }[t.role];
    if (!expected || roles.has(t.role) || t.instrument !== expected) fail("track.role", "楽器の組み合わせが不正です");
    roles.add(t.role);
    if (typeof t.id !== "string" || ids.has(t.id)) fail("track.id", "識別名が不正・重複しています");
    ids.add(t.id);
    if (!number(t.volume, -60, 6) || !number(t.pan, -1, 1)) fail(t.role, "音量・左右位置が不正です");
    if(t.drumSampleGains!=null){
      if(typeof t.drumSampleGains!=="object"||Array.isArray(t.drumSampleGains))fail("drumSampleGains","object required");
      else for(const[key,db]of Object.entries(t.drumSampleGains))if(!Number.isInteger(+key)||!number(+key,0,127)||!number(db,-24,24))fail("drumSampleGains","音量補正が不正です");
    }
    if (t.role !== "drums") {
      schema(t.synth2, SYNTH2_PATCH_SCHEMA, `${t.role}.synth2`);
      if (!Array.isArray(t.synth2?.osc) || t.synth2.osc.length < 1 || t.synth2.osc.length > 3) fail(t.role, "発音部は1〜3個です");
    }
    if (!Array.isArray(t.notes)) { fail(t.role, "notes required"); continue; }
    count += t.notes.length;
    const noteIds = new Set(); let previous = -1;
    for (const n of t.notes) {
      if (!n || typeof n !== "object") { fail(t.role, "音符が不正です"); continue; }
      const range = t.role === "keys" ? [48, 84] : t.role === "pedal" ? [24, 36] : [0, 127];
      if (!Number.isInteger(n.p) || !number(n.p, ...range) || !number(n.s, 0, end - 0.00001) || !number(n.d, 0.00001, end - n.s + 0.00001) || !Number.isInteger(n.v) || !number(n.v, 1, 127)) fail(`${t.role}@${n.s}`, "音程・拍・長さ・強さが不正です");
      if (n.s < previous) fail(t.role, "音符が拍順ではありません"); previous = n.s;
      if (typeof n.id !== "string" || noteIds.has(n.id)) fail(t.role, "音符の識別名が不正・重複しています"); noteIds.add(n.id);
      if (t.role === "keys" && (!Number.isInteger(n.f) || !number(n.f, 1, 5))) fail(`keys@${n.s}`, "指は1〜5です");
      if (t.role === "drums" && n.p !== KICK && (!KEY_OF_DRUM[n.p] || (n.k != null && DRUM_KEYS[n.k] !== n.p))) fail(`drums@${n.s}`, "太鼓の種類が不正です");
    }
    if (t.role === "keys") {
      if (!Array.isArray(t.knobs)) fail("knobs", "array required");
      else { let prev = -1; for (const k of t.knobs) {
        if (!k || !KNOBS.some((q) => q.id === k.param) || !number(k.s, 0, end) || !number(k.d, 0.00001, end - k.s + 0.00001) || !number(k.to, 0, 1) || k.s < prev) fail("knobs", "つまみの種類・拍・長さ・位置が不正です");
        prev = k?.s;
      } }
    }
  }
  if (count > 100000) fail("notes", "音符が多すぎます");
  return errors;
}
