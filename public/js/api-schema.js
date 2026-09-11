// structured outputs (output_config.format) に送る JSON Schema から、API が受け付けない制約を外す。
// 数の制約 (minimum/maximum/multipleOf など)・文字列の長さ・複雑な配列の制約があると 400 になる
// ("For 'number' type, properties maximum, minimum are not supported")。
// 元のスキーマはそのまま (model.js などの手元の検査が min/max を使う)。値の範囲は受け取った後に normalize で丸める。
const DROP = new Set(["minimum", "maximum", "exclusiveMinimum", "exclusiveMaximum", "multipleOf", "minLength", "maxLength", "maxItems", "uniqueItems", "minProperties", "maxProperties"]);
const MAPS = new Set(["properties", "$defs", "definitions", "patternProperties"]);

export function apiSchema(node) {
  if (Array.isArray(node)) return node.map(apiSchema);
  if (!node || typeof node !== "object") return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (DROP.has(key)) continue;
    if (key === "minItems" && value > 1) continue;   // 0 と 1 以外は受け付けない
    if (MAPS.has(key) && value && typeof value === "object") {
      out[key] = Object.fromEntries(Object.entries(value).map(([name, sub]) => [name, apiSchema(sub)]));   // 欄の名前はそのまま残す
    } else out[key] = apiSchema(value);
  }
  return out;
}
