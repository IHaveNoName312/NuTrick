import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const taco = JSON.parse(await readFile(new URL("../data/taco.json", import.meta.url), "utf8"));

const scripts = [...html.matchAll(/<script>([\\s\\S]*?)<\\/script>/gi)];
if (scripts.length !== 1) throw new Error(`Expected one inline app script, found ${scripts.length}`);
new vm.Script(scripts[0][1], { filename: "NuTrick-inline.js" });

if (!Array.isArray(taco) || taco.length < 10) throw new Error("TACO dataset is missing or unexpectedly small");
const ids = new Set();
for (const food of taco) {
  if (!food.id || ids.has(food.id)) throw new Error(`Missing or duplicate food id: ${food.id}`);
  ids.add(food.id);
  for (const key of ["name", "source", "sourceUrl", "unit", "basis"]) {
    if (!food[key]) throw new Error(`Food ${food.id} is missing ${key}`);
  }
  for (const key of ["kcal", "protein", "carbs", "fat"]) {
    if (food[key] !== null && (typeof food[key] !== "number" || !Number.isFinite(food[key]))) {
      throw new Error(`Invalid ${key} value for ${food.id}`);
    }
  }
}
if (!html.includes("loadTacoData()") || !html.includes("searchOFFProducts") || !html.includes("lookupOFFBarcode")) {
  throw new Error("Nutrition data integrations are not wired into the app");
}
console.log(`NuTrick validation passed: JavaScript syntax OK; ${taco.length} TACO foods valid.`);
