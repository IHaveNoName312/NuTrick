import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const taco = JSON.parse(await readFile(new URL("../data/taco.json", import.meta.url), "utf8"));

const scriptStart = html.indexOf("<script>");
const scriptEnd = html.indexOf("</script>", scriptStart);
if (scriptStart < 0 || scriptEnd < 0) throw new Error("Could not locate inline app script");
new vm.Script(html.slice(scriptStart + "<script>".length, scriptEnd), { filename: "NuTrick-inline.js" });

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

const tacoFoods = taco.map(food => ({ ...food, base: food.basis, sourceStatus: "taco" }));
const testContext = vm.createContext({
  st: { foods: tacoFoods, portions: {} },
  fmt: value => Number(value || 0).toLocaleString("pt-BR", { maximumFractionDigits: 1 }),
});
const script = html.slice(scriptStart + "<script>".length, scriptEnd);
const extract = (start, end) => {
  const a = script.indexOf(start);
  const b = script.indexOf(end, a);
  if (a < 0 || b < 0) throw new Error(`Cannot extract test dependency: ${start}`);
  return script.slice(a, b);
};
const normalizeCode = extract("function normalizeText(value)", "async function loadTacoData()");
const portionCode = extract("function portionFor(food)", "function sum(items)");
const parserCode = extract("function parse(text)", "let pending=null;");
new vm.Script(normalizeCode + "\n" + portionCode + "\n" + parserCode + "\nthis.parseForTest = parse; this.calcForTest = calc; this.formatQuantityForTest = formatQuantity;").runInContext(testContext);
const parseForTest = testContext.parseForTest;

function assertFood(description, expectedId, expectedKcal) {
  const result = parseForTest(description);
  if (result.questions.length) throw new Error(`Unexpected clarification for "${description}": ${result.questions.join("; ")}`);
  const item = result.items.find(entry => entry.foodId === expectedId);
  if (!item) throw new Error(`Expected ${expectedId} for "${description}"`);
  if (expectedKcal !== undefined && Math.abs(item.kcal - expectedKcal) > 0.01) {
    throw new Error(`Unexpected calories for "${description}": expected ${expectedKcal}, got ${item.kcal}`);
  }
}
function assertNeedsClarification(description, expectedWord) {
  const result = parseForTest(description);
  if (!result.questions.some(question => question.toLowerCase().includes(expectedWord))) {
    throw new Error(`Expected clarification containing "${expectedWord}" for "${description}"`);
  }
  if (result.items.length === 0 && result.questions.length === 0) {
    throw new Error(`Expected a clarification for "${description}"`);
  }
}
assertFood("150 ml de café sem açúcar", "taco-471", 13.5);
assertFood("100 g de arroz branco cozido", "taco-003", 128);
assertFood("100 g de feijão carioca cozido", "taco-561", 76);
assertFood("100 g de batata frita", "taco-093", 267);
assertFood("100 g de queijo minas frescal", "taco-461", 264);
assertFood("100 g de cuscuz de milho cozido", "taco-533", 113);
assertFood("100 g de tapioca com manteiga", "taco-551", 348);
assertNeedsClarification("300 ml de leite integral", "leite");
assertNeedsClarification("duas fatias de pão de forma Wickbold", "pão");

const eggFood = tacoFoods.find(food => food.id === "taco-488");
const threeEggs = testContext.calcForTest(eggFood, 3, "un");
if (threeEggs.unit !== "un" || threeEggs.qty !== 3 || threeEggs.baseQuantity !== 150 || Math.abs(threeEggs.kcal - 219) > 0.01) {
  throw new Error("Three eggs should remain countable while calculating from an estimated 150 g edible portion");
}
if (testContext.formatQuantityForTest(threeEggs) !== "3 ovos") {
  throw new Error("Counted foods should be displayed with a plural unit label");
}
const manualPeanut = { id: "test-peanut", name: "Amendoim", base: 100, unit: "g", kcal: 600, protein: 25, carbs: 20, fat: 50, portionAmount: 1, portionName: "amendoim" };
const twelvePeanuts = testContext.calcForTest(manualPeanut, 12, "un");
if (Math.abs(twelvePeanuts.kcal - 72) > 0.01 || twelvePeanuts.baseQuantity !== 12) {
  throw new Error("Twelve counted peanuts should convert using the configured grams-per-unit value");
}

if (!html.includes("loadTacoData()") || !html.includes("searchOFFProducts") || !html.includes("lookupOFFBarcode")) {
  throw new Error("Nutrition data integrations are not wired into the app");
}
console.log(`NuTrick validation passed: JavaScript syntax OK; ${taco.length} TACO foods valid; 9 parser behavior checks and 2 count-unit conversion checks passed.`);
