# BLUE GARAGE STUDIO

An AI-native MIDI sequencer from a basement live house in Sangenjaya, Tokyo.
Describe a song in plain language ("drums like RHCP, melody like Mr.Children") and get a pro-grade multitrack MIDI arrangement plus a mixed, loudness-normalized audio render.
**Free, open, runs on your own Anthropic API key** — it can be hosted as a plain static site, no server needed.

## Run it

### A. Hosted / static (your own key)
1. Put `public/` (including `public/samples/`, about 160 MB of instrument samples) on any static host (GitHub Pages, Netlify, your own server).
2. Open it, click **⚙** (top right) and paste your Anthropic API key. The key lives only in that browser's localStorage and is sent only to `api.anthropic.com`.
3. Talk to the chat on the right.

### B. Local with a server key
```bash
# put ANTHROPIC_API_KEY=sk-ant-... in .env
node server.js        # → http://localhost:5173
```
When the server has a key the browser calls Claude through `/api/proxy`. A key entered in ⚙ takes priority.

### C. Command line
```bash
node tools/compose.mjs --prompt "song idea" --name my-song   # blueprint → all tracks (with checks) → public/presets/my-song.json
```

## What you can say

| You say | What happens |
|---|---|
| "Garage rock, drums like RHCP, fast tempo" | Blueprint (form, chords, instrumentation, tempo changes) → every track generated → automatic mix |
| "Make the bass busier", "Redo the chorus only" | Regenerates just that track / range |
| "Piano 3 dB down", "Guitar to the right", "Tempo 120", "Mute track 2" | Immediate |
| "Transpose the chorus up a semitone", "Humanize", "Swell the strings" | Note edits |
| "Mix it", "Make it drier", "Drums more upfront" | An AI mix engineer sets volume, pan, low-cut, EQ, compression, reverb sends and master settings |
| "Give it a thick 80s brass sound", "Make it a Reese bass" | Designs a synth patch from words (editable by hand in the SYNTH panel) |
| "Slow down over the last two bars" | Tempo map (playback, WAV and MIDI all follow it) |
| "Send this track to my DAW over MIDI" | Web MIDI out to hardware or a DAW hosting your VST/AU plugins |
| "Export WAV", "Export MIDI" | Mixed, loudness-normalized WAV / Type-1 SMF with tempo changes and expression CC |

Manual tools: piano roll editing, ⌘Z, Humanize / Quantize, ♩ metronome, ● REC (record from a MIDI keyboard), MIDI OUT.

Center tabs: **PIANO ROLL** / **RACK** (the selected track's instrument as a hardware-style panel: every synth knob, or sample-library info with an audition keyboard; the channel strip and master are on the same page) / **MIXER** (faders, pan, sends and level meters for every track).

Songs are saved automatically to a browser-side library (IndexedDB). Open ☰ to list, open, rename, duplicate or delete them; the chat can do the same ("list songs", "open the previous song", "save as").

## VESPER PIANO (a robot pianist)

`public/piano/` is a **piano-only** tool built from the same parts. The left two thirds are a single-track piano roll; the right side is the chat, and when you press ▶ it becomes a 3D stage where the robot pianist VESPER-01 (three.js) plays a grand piano.
Claude composes with **a hand (L/R), a finger (1-5) and sustain-pedal segments for every note**; `analyzePiano` in `critic.js` checks playability (max 5 notes per hand, duplicate fingers, spans over a 9th, hand crossing, finger order) and sends problems back for revision. The pedal is consistent across playback (notes sustain), MIDI (CC64) and the stage (right foot). In the piano roll the right hand is blue, the left hand orange, finger numbers are drawn on notes, and a PEDAL lane runs along the bottom. Keys 1-5 set the finger, L/R the hand and P toggles a pedal segment for the selection.
The UI is black, white and silver; only things that are "lit" (sounding notes, the playhead, the pedal) turn gold. The upper view is VESPER's own eyes, the lower view a close-up of the hands, and a small inset shows the pedal and right foot. The piano is a generic concert grand built down to every string, hammer, damper, the cast-iron plate and a plaque (no manufacturer's design is copied).
**JAM**: endless improvisation from a "hand" of stock progressions, left-hand patterns and right-hand motifs. Claude writes the hand once (cached in the browser); the mixing happens locally, so it plays for hours without API calls.
**Repertoire** (♪): public-domain classics (The Entertainer, Für Elise, Clair de Lune, Chopin's Trois Nouvelles Études No. 1 — Mutopia Project public-domain editions) and your own MIDI files, with hands and fingers assigned automatically. Copyrighted works are neither bundled nor generated.
**♥**: the story of, and thanks to, the Salamander Grand Piano.
Live: https://atelierfactory.github.io/bluegarage-studio/piano/

## How it gets the music right (v2)

1. **Real scores as context** — when generating a track, the actual notes of the tracks already written are passed as a compact per-bar score (`D2@0(1) A2@1.5!`), so bass locks to the kick and melodies avoid the inner voices.
2. **Check and revise** — `critic.js` inspects every result: empty output, out-of-range, register, overlapping notes, chords on monophonic instruments, long notes clashing with the chord on strong beats, density too thin for the role, flat velocity. Mechanical problems are fixed in place; musical ones are sent back to Claude as an "editor" pass. An empty track can no longer pass as "done".
3. **Expression (v2)** — a note can carry an end velocity, so sustained strings, winds and pads swell or fade. Exported as CC11 ramps in MIDI.
4. **Tempo map** — ritardando etc., consistent across playback, WAV and MIDI.
5. **Section-wise generation** — long songs are generated in chunks of ≤24 bars, each continuing from the previous chunk.
6. **Mixing** — every track: low-cut → 3-band EQ → compressor → volume/pan, with hall and room send reverbs; master: stereo width → bus compressor → limiter. WAV export measures BS.1770 K-weighted loudness and normalizes to the target LUFS (default -14).
7. **Synth** — subtractive (3 OSC + sub + noise → filter → LFO → drive / chorus / delay / reverb), 20 presets, or patches designed by Claude from a description. Patches are stored as JSON in the project.

## Instruments (all free and redistributable, served locally)

Multi-layer SFZ libraries converted to Opus + `index.json`, played by the built-in sampler (`sampler.js`: velocity layers, round robin, release samples, choke groups, loops, articulation switching, v2 expression).

| Instrument | Library | License |
|---|---|---|
| Piano | Salamander Grand Piano V3 (Yamaha C5), 8 layers + release | CC-BY 3.0 |
| Electric piano | Greg Sullivan E-Pianos: Wurlitzer EP200 | CC-BY 3.0 |
| Drums | Naked Drums (Wilkinson Audio, kinwie SFZ port), GM kit, 5 layers × 6 RR | CC-BY 4.0 |
| Electric bass | Karoryfer Black And Blue Basses | CC0 |
| Electric guitar / mute | Blue Jeans and Moonbeams (Strat) + amp-style processing | MIT |
| Acoustic guitar | Ella Gitauru | MIT |
| Strings / trumpet / flute | VSCO 2 Community Edition | CC0 |
| Saxophone | Karoryfer Weresax | CC0 |
| Organ | synthesized in Tone.js (drawbars + Leslie) | — |
| synth / synth-lead / synth-pad / synth-bass | built-in synth (patches) | — |

Rebuild the samples with `samples_src/fetch.sh` then `tools/build-samples.sh`. Any SFZ: `node tools/sfz-import.mjs --name <instrument> --sfz <file.sfz>`.

## Plugins (VST / AU / CLAP)

A browser cannot load VST/AU/CLAP directly. Instead:
- **MIDI OUT** (Web MIDI): choose a port and channel per track and drive a DAW (Logic, Ableton, Cubase…) or hardware. On macOS enable the IAC Driver in Audio MIDI Setup; on Windows use loopMIDI. Host any plugin in the DAW and this sequencer plays it. "Silence the built-in sound" sends MIDI only.
- **SMF export**: Type-1 with tempo map, CC11 expression, CC7/CC10.
- Planned: Web Audio Modules (WAM) plugin support in the browser, and a desktop build hosting VST3/CLAP.

## Layout

```
server.js            local only: static files + /api/proxy (server key) + export saving + API for compose.mjs
public/js/
  prompts.js         prompts, JSON Schemas, tool definitions, chord parsing, score text (shared with the server)
  claude.js          Claude API client (direct / proxy, SSE, retries, settings)
  critic.js          result inspection and auto-fix
  state.js           song model, undo, autosave, tempo map (beats ⇄ seconds)
  audio.js           playback engine (instrument selection, scheduling, offline render)
  mix.js / ir.js     mix bus (insert FX, send reverbs, master) / impulse response generation
  loudness.js        BS.1770 loudness meter, normalization, simple limiter
  synth.js           subtractive synth (patch → Tone.js nodes) + presets
  sampler.js         multi-layer sampler (plays index.json, v2 expression)
  midiio.js          Web MIDI in/out
  midi.js            SMF Type-1 writer (tempo map, CC11)
  chat.js            conversation loop (tool_use executed in the browser)
  main.js            UI and tool implementations (generation pipeline, mix, sounds, recording)
  rack.js / mixer.js / knob.js   hardware-style panels, mixer, knob widgets
  library.js         song library (IndexedDB)
  synthpanel.js / settings.js / i18n.js
  pianoroll.js / arrange.js
public/piano/        VESPER PIANO (piano.js = app, scene.js = 3D stage and robot)
public/vendor/three/ three.js 0.170 (bundled)
public/samples/      converted samples (kept in git for distribution; rebuild with build-samples.sh)
public/presets/      demo songs
tools/               compose.mjs (CLI), sfz-import.mjs, wav-dir-sfz.mjs, build-samples.sh
```

## License

Code: MIT. Samples: see the table above (all redistributable). Claude API usage is billed to your own Anthropic account.
