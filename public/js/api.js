// ═══════════ backend API client (POST + SSE) ═══════════

export async function postSSE(url, body, onProgress) {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok && !res.headers.get("content-type")?.includes("event-stream")) {
    let msg = `HTTP ${res.status}`;
    try { msg = (await res.json()).error ?? msg; } catch { /* noop */ }
    throw new Error(msg);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  let result = null;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) >= 0) {
      const chunk = buf.slice(0, idx);
      buf = buf.slice(idx + 2);
      const line = chunk.split("\n").find((l) => l.startsWith("data: "));
      if (!line) continue;
      let ev;
      try { ev = JSON.parse(line.slice(6)); } catch { continue; }
      if (ev.type === "progress") onProgress?.(ev);
      else if (ev.type === "error") throw new Error(ev.message);
      else if (ev.type === "done") result = ev;
    }
  }
  if (!result) throw new Error("サーバーからの応答が途切れました");
  return result;
}
