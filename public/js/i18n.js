// ═══════════ 表示言語 (日本語 / English) ═══════════
// UI の文字列だけをここで切り替える。Claude との会話はユーザーが書いた言語に自動で合わせる。

const DICT = {
  ja: {
    "app.sub": "SANGENJAYA UNDERGROUND — AI SEQUENCER",
    "tr.rew": "先頭へ (Home)", "tr.play": "再生/停止 (Space)", "tr.stop": "停止", "tr.loop": "ループ再生", "tr.rec": "MIDI 鍵盤から録音 (R)", "tr.met": "メトロノーム (M)",
    "dlg.library": "曲の管理", "lib.saveas": "名前を付けて保存 (複製)", "lib.open": "開く", "lib.rename": "名前変更", "lib.delete": "削除", "lib.current": "開いている曲", "lib.empty": "保存された曲はまだありません。曲は自動で保存されます。", "lib.prompt.name": "曲の名前", "lib.confirm.delete": "「{name}」を消しますか?",
    "tr.bpm": "BPM", "tr.timesig": "拍子", "tr.key": "キー", "tr.snap": "スナップ", "tr.master": "MASTER",
    "btn.humanize": "人間味", "btn.humanize.t": "選択トラックをヒューマナイズ (タイミングと強さを少し揺らす)",
    "btn.quantize.t": "選択トラックをクオンタイズ (グリッドに揃える)",
    "btn.midi": "MIDI", "btn.midi.t": "Standard MIDI File (Type-1, テンポ変化・表情CC付き) を書き出し",
    "btn.wav": "WAV", "btn.wav.t": "曲全体をミックス済みオーディオ (WAV 16bit, ラウドネス調整あり) に書き出し",
    "btn.save": "保存", "btn.save.t": "ブラウザに保存", "btn.menu.t": "プロジェクト (新規 / JSON 読み書き / デモ)",
    "btn.mixer": "MIX", "btn.mixer.t": "マスター設定 (バスコンプ / リバーブ / 目標ラウドネス / MIDI 出力)",
    "btn.settings.t": "設定 (API キー / モデル / 言語)",
    "panel.tracks": "TRACKS", "btn.addtrack": "+ 追加",
    "strip.name": "トラック名", "strip.inst": "楽器", "strip.mute": "ミュート", "strip.solo": "ソロ", "strip.del": "削除",
    "strip.style.ph": "スタイル指示 (例: レッチリのFlea風スラップ)", "strip.fx": "FX", "strip.fx.t": "このトラックのミックス (ローカット / EQ / コンプ / リバーブ送り)",
    "strip.synth": "SYNTH", "strip.synth.t": "シンセの音色を編集",
    "strip.midi": "MIDI OUT", "strip.midi.t": "このトラックを外部 (DAW / 音源) に MIDI で送る",
    "fx.hpf": "LO-CUT", "fx.low": "LOW", "fx.mid": "MID", "fx.high": "HIGH", "fx.comp": "COMP", "fx.hall": "HALL", "fx.room": "ROOM",
    "proll.title": "PIANO ROLL",
    "proll.hint": "クリック=追加 / ドラッグ=移動 / 右端=長さ / ⌥クリック=削除 / ⌘ドラッグ=範囲選択 / ⌘A 全選択 / ⌘C ⌘X ⌘V コピー・切り取り・再生位置に貼る / ⌘D 直後に複製 / ←→↑↓ 移動 (Shift↑↓=オクターブ) / ホイール=スクロール / ⌘ホイール=ズーム / ノート上ホイール=ベロシティ",
    "ai.title": "AI SESSION", "ai.clear": "クリア", "ai.clear.t": "会話の履歴を消す (曲は残る)",
    "chat.ph": "例: ドラムはレッチリ、メロディはミスチルでガレージロック。BPM速めで作って", "chat.send": "送信", "chat.send.t": "送信 (Enter / 改行は Shift+Enter)",
    "dlg.project": "プロジェクト", "dlg.new": "新規プロジェクト", "dlg.exportjson": "プロジェクトをJSONで書き出し", "dlg.importjson": "JSONを読み込み", "dlg.demo": "デモ用サンプルを読み込み", "dlg.close": "閉じる",
    "dlg.settings": "設定", "set.key": "Anthropic API キー", "set.key.help": "キーはこのブラウザの中にだけ保存され、api.anthropic.com にしか送られません。料金はあなたの Anthropic アカウントに直接かかります。",
    "set.key.get": "キーを取得する (console.anthropic.com)", "set.model": "モデル", "set.lang": "表示言語", "set.test": "接続テスト", "set.save": "保存",
    "set.server": "このページを配っているサーバーにキーがあるので、そのまま使えます (自分のキーを入れると自分のキーが優先されます)。",
    "set.static": "自分の API キーを入れてください。",
    "set.embedded": "このサイトにはキーが用意されているので、そのまま使えます (自分のキーを入れると自分のキーが優先されます)。",
    "dlg.master": "マスター / ミックス", "mx.glue": "バスコンプ (glue)", "mx.hall": "ホール残響 (秒)", "mx.room": "ルーム残響 (秒)", "mx.lufs": "書き出しの目標ラウドネス (LUFS)", "mx.width": "ステレオ幅", "mx.automix": "AI にミックスさせる", "mx.reset": "既定に戻す",
    "mx.tempomap": "テンポの変化 (bar.beat=tempo を空白区切り 例: 33.0=104 36.0=80)", "mx.tempomap.apply": "適用",
    "dlg.synth": "シンセ音色", "syn.preset": "プリセット", "syn.ai": "言葉で作る (例: 80年代のぶ厚いブラス)", "syn.ai.go": "AI に設計させる", "syn.audition": "試聴", "syn.copy": "JSONをコピー",
    "dlg.midi": "MIDI 出力", "midi.port": "ポート", "midi.ch": "チャンネル", "midi.silent": "内蔵音源を鳴らさない (MIDI だけ送る)", "midi.none": "(送らない)", "midi.help": "DAW で受けるには macOS「Audio MIDI 設定」の IAC ドライバを有効にし、DAW 側のトラックでそのポートを入力にします。Windows は loopMIDI 等の仮想ポートを使います。",
    "toast.saved": "ブラウザに保存しました", "toast.midi": "MIDIファイルを書き出しました (Type-1 / 480tpq)", "toast.wav": "WAVを書き出しました",
    "toast.needtrack": "ノートのあるトラックを選択してください",
    "confirm.deltrack": "トラック「{name}」を削除しますか?", "confirm.new": "現在のプロジェクトを破棄して新規作成しますか?",
    "gen.blueprint": "設計図を考え中…", "gen.track": "生成中…", "gen.check": "検査中…", "gen.revise": "手直し中…", "gen.mix": "ミックスを考え中…", "gen.synth": "音色を設計中…",
    "rec.on": "録音待機: 再生すると鍵盤の演奏が選択トラックに記録されます", "rec.off": "録音をやめました",
    "welcome": "ここに話しかけると、曲を作る・直す・ミックスする・音色を作る・書き出す、を全部やります。例:「ドラムはレッチリ、メロディはミスチルでガレージロック。BPM速めで作って」「ベースをもっと動かして」「80年代のブラスの音にして」「WAVで書き出して」",
    "nokey": "API キーが未設定です。右上の ⚙ から Anthropic の API キーを入れてください。",
  },
  en: {
    "app.sub": "SANGENJAYA UNDERGROUND — AI SEQUENCER",
    "tr.rew": "Go to start (Home)", "tr.play": "Play/Stop (Space)", "tr.stop": "Stop", "tr.loop": "Loop", "tr.rec": "Record from MIDI keyboard (R)", "tr.met": "Metronome (M)",
    "dlg.library": "Songs", "lib.saveas": "Save as (duplicate)", "lib.open": "Open", "lib.rename": "Rename", "lib.delete": "Delete", "lib.current": "current", "lib.empty": "No saved songs yet. Songs are saved automatically.", "lib.prompt.name": "Song name", "lib.confirm.delete": "Delete \"{name}\"?",
    "tr.bpm": "BPM", "tr.timesig": "Time", "tr.key": "Key", "tr.snap": "Snap", "tr.master": "MASTER",
    "btn.humanize": "Humanize", "btn.humanize.t": "Humanize selected track (slight timing and velocity variation)",
    "btn.quantize.t": "Quantize selected track to the grid",
    "btn.midi": "MIDI", "btn.midi.t": "Export Standard MIDI File (Type-1, with tempo changes and expression CC)",
    "btn.wav": "WAV", "btn.wav.t": "Export the mixed song as audio (WAV 16-bit, loudness normalized)",
    "btn.save": "Save", "btn.save.t": "Save in this browser", "btn.menu.t": "Project (new / JSON import-export / demo)",
    "btn.mixer": "MIX", "btn.mixer.t": "Master settings (bus compressor / reverbs / target loudness / MIDI out)",
    "btn.settings.t": "Settings (API key / model / language)",
    "panel.tracks": "TRACKS", "btn.addtrack": "+ Add",
    "strip.name": "Track name", "strip.inst": "Instrument", "strip.mute": "Mute", "strip.solo": "Solo", "strip.del": "Delete",
    "strip.style.ph": "Style direction (e.g. Flea-style slap bass)", "strip.fx": "FX", "strip.fx.t": "Track mix (low-cut / EQ / compressor / reverb sends)",
    "strip.synth": "SYNTH", "strip.synth.t": "Edit the synth patch",
    "strip.midi": "MIDI OUT", "strip.midi.t": "Send this track to an external DAW / instrument via MIDI",
    "fx.hpf": "LO-CUT", "fx.low": "LOW", "fx.mid": "MID", "fx.high": "HIGH", "fx.comp": "COMP", "fx.hall": "HALL", "fx.room": "ROOM",
    "proll.title": "PIANO ROLL",
    "proll.hint": "Click=add / Drag=move / Right edge=length / ⌥click=delete / ⌘drag=box select / ⌘A all / ⌘C ⌘X ⌘V copy-cut-paste at playhead / ⌘D duplicate after / arrows move (Shift↑↓=octave) / Wheel=scroll / ⌘wheel=zoom / Wheel on note=velocity",
    "ai.title": "AI SESSION", "ai.clear": "Clear", "ai.clear.t": "Clear the conversation (the song stays)",
    "chat.ph": "e.g. Garage rock, drums like RHCP, melody like Mr.Children, fast tempo", "chat.send": "Send", "chat.send.t": "Send (Enter / Shift+Enter for newline)",
    "dlg.project": "Project", "dlg.new": "New project", "dlg.exportjson": "Export project as JSON", "dlg.importjson": "Import JSON", "dlg.demo": "Load demo song", "dlg.close": "Close",
    "dlg.settings": "Settings", "set.key": "Anthropic API key", "set.key.help": "The key is stored only in this browser and sent only to api.anthropic.com. Usage is billed to your own Anthropic account.",
    "set.key.get": "Get a key (console.anthropic.com)", "set.model": "Model", "set.lang": "Language", "set.test": "Test connection", "set.save": "Save",
    "set.server": "The server hosting this page has a key, so it works as is (your own key takes priority if you enter one).",
    "set.static": "Enter your own API key.",
    "set.embedded": "This site comes with a key, so it works as is (your own key takes priority if you enter one).",
    "dlg.master": "Master / Mix", "mx.glue": "Bus compressor (glue)", "mx.hall": "Hall reverb time (s)", "mx.room": "Room reverb time (s)", "mx.lufs": "Export target loudness (LUFS)", "mx.width": "Stereo width", "mx.automix": "Let AI mix it", "mx.reset": "Reset to defaults",
    "mx.tempomap": "Tempo changes (bar.beat=tempo, space separated, e.g. 33.0=104 36.0=80)", "mx.tempomap.apply": "Apply",
    "dlg.synth": "Synth patch", "syn.preset": "Preset", "syn.ai": "Describe it (e.g. thick 80s brass)", "syn.ai.go": "Design with AI", "syn.audition": "Audition", "syn.copy": "Copy JSON",
    "dlg.midi": "MIDI output", "midi.port": "Port", "midi.ch": "Channel", "midi.silent": "Silence the built-in sound (send MIDI only)", "midi.none": "(none)", "midi.help": "To receive in a DAW on macOS, enable the IAC Driver in Audio MIDI Setup and pick that port as the track input in your DAW. On Windows use a virtual port such as loopMIDI.",
    "toast.saved": "Saved in this browser", "toast.midi": "MIDI file exported (Type-1 / 480 tpq)", "toast.wav": "WAV exported",
    "toast.needtrack": "Select a track that has notes",
    "confirm.deltrack": "Delete track \"{name}\"?", "confirm.new": "Discard the current project and start a new one?",
    "gen.blueprint": "Designing the blueprint…", "gen.track": "Generating…", "gen.check": "Checking…", "gen.revise": "Revising…", "gen.mix": "Planning the mix…", "gen.synth": "Designing the sound…",
    "rec.on": "Record armed: press play and your MIDI keyboard is recorded into the selected track", "rec.off": "Recording disarmed",
    "welcome": "Talk here and the AI composes, edits, mixes, designs sounds and exports. Try: \"Garage rock, drums like RHCP, fast tempo\", \"Make the bass busier\", \"Give it an 80s brass sound\", \"Export as WAV\".",
    "nokey": "No API key yet. Open ⚙ (top right) and enter your Anthropic API key.",
  },
};

let lang = "ja";
export function detectLang(pref) {
  if (pref === "ja" || pref === "en") return pref;
  return (navigator.language || "").toLowerCase().startsWith("ja") ? "ja" : "en";
}
export function setLang(l) { lang = l === "en" ? "en" : "ja"; document.documentElement.lang = lang; applyDom(); }
export function getLang() { return lang; }
export function t(key, vars) {
  let s = DICT[lang]?.[key] ?? DICT.ja[key] ?? key;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.replace(`{${k}}`, v);
  return s;
}
export function applyDom(root = document) {
  root.querySelectorAll("[data-i18n]").forEach((el) => { el.textContent = t(el.dataset.i18n); });
  root.querySelectorAll("[data-i18n-title]").forEach((el) => { el.title = t(el.dataset.i18nTitle); });
  root.querySelectorAll("[data-i18n-ph]").forEach((el) => { el.placeholder = t(el.dataset.i18nPh); });
}
