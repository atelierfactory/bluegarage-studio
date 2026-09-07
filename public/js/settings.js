// ═══════════ 設定ダイアログ (API キー / モデル / 言語) ═══════════

import { settings, MODELS, probeServer, resetServerProbe, testConnection, resolveTransport } from "./claude.js";
import { t, setLang, detectLang } from "./i18n.js";

const $ = (s) => document.querySelector(s);

export function initSettings({ onLangChange, toast }) {
  const dlg = $("#dlg-settings");
  const keyInput = $("#set-key");
  const modelSel = $("#set-model");
  const langSel = $("#set-lang");
  const status = $("#set-status");
  modelSel.innerHTML = MODELS.map((m) => `<option value="${m.id}">${m.label}</option>`).join("");

  async function fill() {
    const s = settings.get();
    keyInput.value = s.apiKey ?? "";
    modelSel.value = s.model ?? MODELS[0].id;
    langSel.value = detectLang(s.lang);
    const info = await probeServer();
    $("#set-server-note").textContent = info.hasKey ? t("set.server") : info.embeddedKey ? t("set.embedded") : t("set.static");
    status.textContent = "";
  }
  $("#btn-settings").addEventListener("click", async () => { await fill(); dlg.showModal(); });
  $("#btn-set-save").addEventListener("click", async () => {
    settings.set({ apiKey: keyInput.value.trim(), model: modelSel.value, lang: langSel.value });
    setLang(langSel.value); onLangChange?.();
    resetServerProbe();
    const tr = await resolveTransport();
    $(".ai-badge").textContent = MODELS.find((m) => m.id === modelSel.value)?.label.split(" (")[0] ?? modelSel.value;
    toast?.(tr === "none" ? t("nokey") : "OK", tr === "none");
    dlg.close();
  });
  $("#btn-set-test").addEventListener("click", async () => {
    settings.set({ apiKey: keyInput.value.trim(), model: modelSel.value });
    resetServerProbe();
    status.textContent = "…";
    try { const r = await testConnection(); status.textContent = `✓ ${r}`; status.className = "ok"; }
    catch (e) { status.textContent = `✕ ${e.message}`; status.className = "err"; }
  });
  $("#btn-set-close").addEventListener("click", () => dlg.close());
  langSel.addEventListener("change", () => { setLang(langSel.value); onLangChange?.(); });

  return {
    async openIfNoKey() {
      const tr = await resolveTransport();
      if (tr === "none") { await fill(); dlg.showModal(); return true; }
      return false;
    },
  };
}
