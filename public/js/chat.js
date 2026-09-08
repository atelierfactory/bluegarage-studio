// ═══════════ チャット (会話だけで曲を作る・直す・ミックスする・音色を作る・書き出す) ═══════════
// 会話履歴はブラウザが持つ。claude.js 経由で 1 往復ずつ Claude に投げ、返ってきた tool_use を
// ここ(ブラウザ)で実行して結果を返す、を tool_use が無くなるまで繰り返す。
// 道具の実体は main.js から `actions` として渡される。道具の定義は prompts.js (CHAT_TOOLS)。

import { streamMessage } from "./claude.js";
import { CHAT_TOOLS, SYSTEM_CHAT } from "./prompts.js";
import { t, getLang } from "./i18n.js";

const LS_KEY = "bluegarage:chat:v2";
const MAX_TURNS = 14;
const KEEP_MESSAGES = 40;

const $ = (sel) => document.querySelector(sel);
const esc = (s) => String(s ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

function md(text) {
  const lines = esc(text).split("\n");
  let html = "", inList = false;
  for (const raw of lines) {
    const line = raw.replace(/\*\*(.+?)\*\*/g, "<b>$1</b>").replace(/`([^`]+)`/g, "<code>$1</code>");
    const m = line.match(/^\s*[-・*]\s+(.*)$/);
    if (m) { if (!inList) { html += "<ul>"; inList = true; } html += `<li>${m[1]}</li>`; continue; }
    if (inList) { html += "</ul>"; inList = false; }
    if (line.trim()) html += `<p>${line}</p>`;
  }
  if (inList) html += "</ul>";
  return html;
}

const TOOL_LABEL = {
  ja: { create_blueprint: "設計図を作る", generate_tracks: "トラックを生成", update_song: "曲の設定を変更", update_track: "トラックを変更", add_track: "トラックを追加", remove_track: "トラックを削除", edit_notes: "ノートを編集", transport: "再生/停止", export_file: "書き出し", project: "プロジェクト", get_song_details: "曲の詳細を確認", auto_mix: "AI ミックス", set_mix: "ミックス設定", set_master: "マスター設定", design_sound: "音色を設計", set_synth: "シンセ設定", set_tempo_map: "テンポ変化", midi_out: "MIDI 出力", compose_piano: "ピアノ曲を作る", regenerate: "作り直し", set_pedal: "ペダル" },
  en: { create_blueprint: "Blueprint", generate_tracks: "Generate tracks", update_song: "Song settings", update_track: "Track settings", add_track: "Add track", remove_track: "Remove track", edit_notes: "Edit notes", transport: "Transport", export_file: "Export", project: "Project", get_song_details: "Song details", auto_mix: "AI mix", set_mix: "Mix", set_master: "Master", design_sound: "Sound design", set_synth: "Synth", set_tempo_map: "Tempo map", midi_out: "MIDI out", compose_piano: "Compose piano", regenerate: "Regenerate", set_pedal: "Pedal" },
};

export function initChat(actions, opts = {}) {
  const TOOLS = opts.tools ?? CHAT_TOOLS;
  const SYSTEM = opts.system ?? SYSTEM_CHAT;
  const KEY = opts.storageKey ?? LS_KEY;
  const logEl = $("#chat-log");
  const input = $("#chat-input");
  const sendBtn = $("#btn-chat-send");
  let messages = [];
  let busy = false;

  function persist() { try { localStorage.setItem(KEY, JSON.stringify(messages.slice(-KEEP_MESSAGES))); } catch {} }
  function restore() {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return;
      messages = trimHistory(JSON.parse(raw));
      for (const m of messages) {
        if (m.role === "user") { if (typeof m.content === "string") addBubble("user", m.content); }
        else for (const b of m.content) {
          if (b.type === "text" && b.text.trim()) addBubble("assistant", b.text);
          else if (b.type === "tool_use") addToolCard(b).done(resultTextFor(b.id) ?? "");
        }
      }
      scrollDown();
    } catch {}
  }
  function resultTextFor(toolUseId) {
    for (const m of messages) {
      if (m.role !== "user" || typeof m.content === "string") continue;
      const r = m.content.find((b) => b.type === "tool_result" && b.tool_use_id === toolUseId);
      if (r) return typeof r.content === "string" ? r.content : r.content?.map((c) => c.text).join("");
    }
    return null;
  }
  function trimHistory(list) {
    let arr = list.slice(-KEEP_MESSAGES);
    while (arr.length && !(arr[0].role === "user" && typeof arr[0].content === "string")) arr.shift();
    // 拡張思考ブロックは署名付きのものだけ戻せる (壊れたものが残っていると API が 400 を返す)
    return arr.map((m) => (m.role === "assistant" && Array.isArray(m.content))
      ? { ...m, content: m.content.filter((b) => b.type !== "thinking" || (b.thinking && b.signature)) }
      : m);
  }

  function scrollDown() { logEl.scrollTop = logEl.scrollHeight; }
  function addBubble(role, text) {
    const el = document.createElement("div");
    el.className = `msg ${role}`;
    el.innerHTML = role === "user" ? `<p>${esc(text).replace(/\n/g, "<br>")}</p>` : md(text);
    logEl.appendChild(el); scrollDown();
    return { el, set(tx) { el.innerHTML = md(tx); scrollDown(); } };
  }
  function addNote(text, cls = "") {
    const el = document.createElement("div");
    el.className = `msg note ${cls}`;
    el.textContent = text;
    logEl.appendChild(el); scrollDown();
    return el;
  }
  function addToolCard(block) {
    const el = document.createElement("div");
    el.className = "msg tool running";
    const args = Object.entries(block.input ?? {}).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => `${k}=${typeof v === "string" ? v : JSON.stringify(v)}`).join(", ");
    const label = (TOOL_LABEL[getLang()] ?? TOOL_LABEL.ja)[block.name] ?? block.name;
    el.innerHTML = `<div class="tool-head"><span class="spinner-sm"></span><b>${esc(label)}</b><span class="tool-args">${esc(args.slice(0, 160))}</span></div><div class="tool-body"></div>`;
    logEl.appendChild(el); scrollDown();
    const body = el.querySelector(".tool-body");
    return {
      el,
      progress(tx) { body.textContent = tx; scrollDown(); },
      done(tx, isErr = false) { el.classList.remove("running"); el.classList.toggle("err", isErr); body.textContent = tx; scrollDown(); },
    };
  }

  async function callChat(onText) {
    const langNote = getLang() === "en" ? "The user interface language is English. Reply in the language the user writes in." : "画面の言語は日本語。ユーザーが書いた言語で返す。";
    return streamMessage({
      system: [
        { type: "text", text: SYSTEM, cache_control: { type: "ephemeral" } },
        { type: "text", text: `# 現在の曲 (最新の状態。あなたがこれまでに道具で行った変更は反映済み)\n${actions.getSongState()}\n\n# 現在時刻\n${new Date().toLocaleString()}\n\n# 言語\n${langNote}` },
      ],
      tools: TOOLS,
      messages: trimHistory(messages),
      maxTokens: 4000,
      onText,
    });
  }

  async function runTool(block) {
    const card = addToolCard(block);
    const fn = actions[block.name];
    if (!fn) { card.done(`未対応の道具: ${block.name}`, true); return { ok: false, text: `未対応の道具: ${block.name}` }; }
    try {
      const text = await fn(block.input ?? {}, (p) => card.progress(p));
      card.done(text);
      return { ok: true, text };
    } catch (e) {
      console.error(e);
      card.done(`失敗: ${e.message}`, true);
      return { ok: false, text: `失敗: ${e.message}` };
    }
  }

  async function send(text) {
    if (busy) return;
    text = text.trim();
    if (!text) return;
    busy = true; sendBtn.disabled = true; input.value = "";
    addBubble("user", text);
    messages.push({ role: "user", content: text });
    persist();
    try {
      for (let turn = 0; turn < MAX_TURNS; turn++) {
        let bubble = null, acc = "";
        const r = await callChat((delta) => { acc += delta; if (!bubble) bubble = addBubble("assistant", ""); bubble.set(acc); });
        messages.push({ role: "assistant", content: r.content });
        persist();
        const toolUses = r.content.filter((b) => b.type === "tool_use");
        if (r.stop_reason !== "tool_use" || !toolUses.length) break;
        const results = [];
        for (const tu of toolUses) {
          const out = await runTool(tu);
          results.push({ type: "tool_result", tool_use_id: tu.id, content: out.text.slice(0, 8000), is_error: !out.ok });
        }
        messages.push({ role: "user", content: results });
        persist();
      }
    } catch (e) {
      console.error(e);
      addNote(`${getLang() === "en" ? "Error" : "エラー"}: ${e.message}`, "err");
      while (messages.length && !(messages[messages.length - 1].role === "user" && typeof messages[messages.length - 1].content === "string")) messages.pop();
      persist();
    } finally {
      busy = false; sendBtn.disabled = false; input.focus();
    }
  }

  sendBtn.addEventListener("click", () => send(input.value));
  input.addEventListener("keydown", (e) => { if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); send(input.value); } });
  $("#btn-chat-clear").addEventListener("click", () => {
    if (busy) return;
    messages = []; persist(); logEl.innerHTML = "";
    addNote(getLang() === "en" ? "Conversation cleared. The song is kept." : "会話をリセットしました。曲はそのまま残っています。");
  });

  restore();
  if (!messages.length) addNote(opts.welcome ?? t("welcome"));
  return { send, note: addNote, get busy() { return busy; } };
}
