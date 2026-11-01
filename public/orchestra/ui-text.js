// ═══════════ VESPER ORCHESTRA の画面の文字 (この表 1 つにまとめる) ═══════════
// 決まり (docs/ORCHESTRA.md §0): 新しい日本語の文はここで作らない。
//   ・VESPER PIANO / BAND の画面にある文は、そのまま (1 字も変えずに) 使う → 下の「ピアノ・バンドと同じ」
//   ・まだ文が決まっていない所は [[…]] の印のまま置く → あとで文を書く人がこの表の値だけを入れ替える
//   ・英字の物 (楽器の略号・寄りの画面の名前・クレジット) は値のまま出す。変えるときもこの表だけを直す
// HTML 側は data-ui="キー" (文字) / data-ui-title="キー" (title) / data-ui-aria="キー" (aria-label) で引く。
// {name} のような所は t(key, {name}) で埋める。

export const UI = {
  "shot.piano-hands": "PIANO HANDS",
  "shot.piano-top": "PIANO TOP",
  "shot.piano-profile": "PIANO",
  "shot.piano-strings": "PIANO · STRINGS",
  "shot.conductor-piano": "CONDUCTOR · PIANO",
  "shot.trombones": "TROMBONES",
  "close.piano-hands": "ピアノ手元",
  "close.piano-top": "ピアノ真上",
  "close.piano-profile": "ピアノ横",
  "close.piano-strings": "ピアノと弦",
  "close.conductor-piano": "指揮者とピアノ",
  "close.trombones": "トロンボーン",
  "lane.hn34": "Hn 3/4",
  "lane.tb": "Tb",
  "lane.pianoR": "Pf R",
  "lane.pianoL": "Pf L",
  /* ── ピアノ・バンドと同じ (文はそのまま) ── */
  "transport.rew": "先頭へ (Home)",
  "transport.play": "再生/停止 (Space)",
  "transport.stop": "停止",
  "export.wav": "音声 (WAV) で保存",
  "credits.tip": "この楽器について",
  "credits.title": "この楽器について",
  "link.piano": "VESPER PIANO へ",
  "link.band": "VESPER BAND (シンセ + ドラム) へ",
  "vol.aria": "音量",
  "songs.button": "♪ 曲を選ぶ",
  "songs.tip": "曲を選ぶ",
  "songs.title": "曲を選ぶ",
  "songs.open": "選択",
  "close": "閉じる",
  "view.wide": "全体",
  "view.wide.tip": "全体 (ドラッグで回転・ホイールで寄り引き)",
  "view.top": "上",
  "view.top.tip": "上から",
  "fullscreen": "全画面",
  "fullscreen.tip": "全画面 (左: 全体 / 右: 手元)。Esc で戻る",
  "close.auto": "自動",
  "close.manual": "手動",
  "status.opened": "「{title}」を開きました。▶ で再生できます",
  "status.openFailed": "曲を開けませんでした: {message}",
  "load.bank": "音源読み込み中: {name}…",
  "load.samples": "音を読み込み中: {name} ({done}/{total})",
  "load.failed": "音源を読み込めませんでした ({count} 個)。電波の状態を確かめて、もう一度 ▶ を押してください",
  "audio.blocked": "音を出せませんでした。画面を一度タップしてから、もう一度 ▶ を押してください",
  "wav.prepare": "音源を準備中…",
  "wav.render": "レンダリング中… (曲の長さ分の計算を行います)",
  "wav.normalize": "ラウドネスを測って整えています…",
  "wav.done": "WAV: {file} ({mb}MB) / {lufs} LUFS",

  /* ── まだ文が決まっていない所 ── */
  "view.front": "正面",
  "view.front.tip": "客席から",
  "view.conductor": "指揮者",
  "view.conductor.tip": "指揮者を正面から",
  "close.strings": "弦楽器",
  "close.woodwinds": "木管楽器",
  "close.brass": "金管楽器",
  "close.timpani": "ティンパニ",
  "close.conductor": "指揮者",
  "close.aria": "クローズアップの対象",
  "stage.aria": "48体のロボットによるオーケストラの3D舞台",
  "lanes.aria": "クリックで再生位置を選べる総譜",
  "songs.head": "演奏できる曲",
  "credits.samples": "この作品の楽器の音には、Versilian Studios の VSCO 2: Community Edition を使っています。弦楽器、木管楽器、金管楽器、ティンパニの音は、Sam Gossner と Simon Dalzell が録音し、Elan Hickler (Soundemote) がサンプルを切り出したものです。CC0 1.0 で公開され、誰でも無料で、目的を問わず使えます。音を収録し、広く使えるように公開してくださった皆さんに、心より感謝します。",
  "credits.score": "楽譜データは、著作権の保護期間が満了した総譜をボランティアが電子化し、CC0 1.0で公開するOpenScore Orchestraからお借りしました。元の楽譜はMax Ungerが校訂したEulenburg No. 402 (1938)です。別の版であるMutopia Project (#941)ともパートごとに小節単位で照合し、97.9%の一致を確認しています。楽譜を誰もが使える形にしてくださった皆さんに感謝します。",
  "credits.robots": "音を録り、楽譜を整え、誰もが自由に使えるように公開してくださった皆さんのおかげで、ここにいる48体のロボットが演奏できます。音と楽譜を届けてくださった皆さん、そして演奏を聴いてくださる皆さん、ありがとうございます。",

  /* ── 英字の物 (値のまま出す) ── */
  "logo.sub": "48 ROBOTS · ORCHESTRA",
  "lane.fl": "Fl", "lane.ob": "Ob", "lane.cl": "Cl", "lane.bn": "Bn", "lane.hn": "Hn", "lane.tp": "Tp", "lane.timp": "Timp",
  "lane.vn1": "Vn I", "lane.vn2": "Vn II", "lane.va": "Va", "lane.vc": "Vc", "lane.cb": "Cb",
  // 寄りの画面の右下に出す、いま映している所の名前
  "shot.auto": "AUTO", "shot.manual": "MANUAL", "shot.tutti": "TUTTI", "shot.conductor": "CONDUCTOR",
  "shot.strings": "STRINGS", "shot.violins": "VIOLINS", "shot.violas": "VIOLAS", "shot.cellos": "CELLOS", "shot.basses": "BASSES", "shot.lowstrings": "CELLOS · BASSES",
  "shot.woodwinds": "WOODWINDS", "shot.flute": "FLUTES", "shot.oboe": "OBOES", "shot.clarinet": "CLARINETS", "shot.bassoon": "BASSOONS",
  "shot.frontwinds": "FLUTES · OBOES", "shot.backwinds": "CLARINETS · BASSOONS",
  "shot.brass": "BRASS", "shot.horns": "HORNS", "shot.trumpets": "TRUMPETS", "shot.timpani": "TIMPANI",
  "credits.line": "VSCO 2 Community Edition: Versilian Studios / Sam Gossner, Ivy Audio / Simon Dalzell (CC0 1.0), versilian-studios.com/vsco-community/; Beethoven, Symphony No. 5, Op. 67, I: OpenScore Orchestra (CC0 1.0; annotations removed), after Eulenburg No. 402 (ed. Max Unger, 1938); cross-checked with Mutopia #941 (Public Domain)",
};

/** 表の文を引く。{name} は vars で埋める。表に無いキーは [[キー]] を返す (抜けがすぐ見えるように) */
export function t(key, vars = null) {
  let s = UI[key];
  if (s == null) s = `[[${key}]]`;
  if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? String(vars[k]) : m));
  return s;
}

/** data-ui / data-ui-title / data-ui-aria の付いた要素に表の文を入れる */
export function applyText(root = document) {
  for (const el of root.querySelectorAll("[data-ui]")) el.textContent = t(el.dataset.ui);
  for (const el of root.querySelectorAll("[data-ui-title]")) el.title = t(el.dataset.uiTitle);
  for (const el of root.querySelectorAll("[data-ui-aria]")) el.setAttribute("aria-label", t(el.dataset.uiAria));
}

/** まだ文が入っていない ([[…]] のままの) キーの一覧 (確かめの道具が数える) */
export function pendingKeys() { return Object.keys(UI).filter((k) => /^\[\[.*\]\]$/.test(UI[k])); }
