// 椅子・シンセ・足鍵盤・ドラムの置き場所 (2026-11-03 さとるん「座り位置とか、シンセの位置とか僕が直せる UI」)。
// 値は、もとの置き場所からのずれ (m・ラジアン)。全部 0 = もとの置き場所。scene.js が読み、見た目と演奏の計算の両方に使う。
// 配置の画面 (chimp/layout_page/・http://localhost:8827/layout/) の「保存」で、手元のサーバーがこのファイルの SAVED を書きかえる。
// 保存前の配置は、ブラウザでは ?layoutDraft=1 のとき localStorage から、検査 (node) では環境変数 BAND_LAYOUT (JSON) から読む。
export const SAVED = {
  "seat": { "x": 0, "y": -0.325, "z": -0.22, "yaw": 0 },
  "synth": { "x": -0.09, "y": -0.35, "z": -0.01, "yaw": 0.46 },
  "pedal": { "x": -0.13, "z": -0.14 },
  "drums": { "x": 0.06, "y": -0.01, "z": 0.02, "spread": 0.95 },
  "kick": { "x": -0.08, "z": -0.055 }
};
export const DRAFT_KEY = "vesperBandLayoutDraft";

function merge(base, over) {
  const out = structuredClone(base);
  for (const [k, v] of Object.entries(over ?? {})) if (out[k]) for (const [a, x] of Object.entries(v ?? {})) if (a in out[k] && Number.isFinite(+x)) out[k][a] = +x;
  return out;
}
function draft() {
  try {
    const env = globalThis.process?.env?.BAND_LAYOUT;
    if (env) return JSON.parse(env);
    // ?layout=<JSON>: URL に書いた配置 (写真で確かめる用。配置の画面の下書きには触らない)
    const q = new URLSearchParams(globalThis.location?.search ?? "");
    if (q.has("layout")) return JSON.parse(q.get("layout"));
    if (q.has("layoutDraft")) return JSON.parse(globalThis.localStorage?.getItem(DRAFT_KEY) ?? "null");
  } catch {}
  return null;
}
export default merge(SAVED, draft());
