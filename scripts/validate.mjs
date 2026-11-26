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

const verifiedSodium = new Map([
  ["1", 1],
  ["3", 1],
  ["370", 52],
  ["410", 50],
  ["461", 31],
  ["551", 158],
]);
for (const [code, expected] of verifiedSodium) {
  const food = taco.find(entry => entry.sourceCode === code);
  if (!food || food.sodium !== expected) {
    throw new Error(`Unexpected TACO sodium value for code ${code}: expected ${expected}, got ${food?.sodium}`);
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
const offCode = extract("function offNumber(value)", "async function searchOFFProducts(term)");
const portionCode = extract("function portionFor(food)", "function todayMeals()");
const parserCode = extract("function parse(text)", "let pending=null;");
new vm.Script(normalizeCode + "\n" + offCode + "\n" + portionCode + "\n" + parserCode + "\nthis.parseForTest = parse; this.calcForTest = calc; this.formatQuantityForTest = formatQuantity; this.mapOFFForTest = mapOFFProduct; this.mapOFFResponseForTest = mapOFFResponse; this.sumForTest = sum; this.formatNutrientTotalForTest = formatNutrientTotal; this.formatGoalTotalForTest = formatGoalTotal;").runInContext(testContext);
const parseForTest = testContext.parseForTest;
const mapOFFForTest = testContext.mapOFFForTest;
const mapOFFResponseForTest = testContext.mapOFFResponseForTest;
const sumForTest = testContext.sumForTest;
const formatNutrientTotalForTest = testContext.formatNutrientTotalForTest;
const formatGoalTotalForTest = testContext.formatGoalTotalForTest;

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

const partialTotals = sumForTest([
  { kcal: 100, protein: 10, carbs: 20, fat: 4, fiber: null, sodium: null },
  { kcal: null, protein: 5, carbs: 10, fat: 2, fiber: 3, sodium: 1 },
]);
if (partialTotals.kcal !== 100 || partialTotals.kcalMissing !== 1) {
  throw new Error("A missing calorie value must not be treated as zero or hidden in the total");
}
if (partialTotals.protein !== 15 || partialTotals.proteinMissing !== 0) {
  throw new Error("Complete protein values should still sum normally even when another nutrient is missing");
}
if (formatNutrientTotalForTest(partialTotals, "kcal", "kcal") !== "≥ 100 kcal (parcial)") {
  throw new Error("Partial totals should be marked as a known subtotal");
}
if (formatGoalTotalForTest(partialTotals, "protein", 120) !== "15 / 120 g") {
  throw new Error("Complete macro totals should retain their normal goal display");
}
if (formatNutrientTotalForTest(partialTotals, "fiber", "g") !== "≥ 3 g (parcial)") {
  throw new Error("Fiber totals should track missing values independently");
}
const unknownTotals = sumForTest([{ kcal: null, protein: undefined, carbs: "", fat: "not-a-number", fiber: null, sodium: null }]);
if (unknownTotals.kcal !== null || formatNutrientTotalForTest(unknownTotals, "kcal", "kcal") !== "Não informado") {
  throw new Error("A nutrient with no known values should be displayed as not informed");
}
const genuineZero = sumForTest([{ kcal: 0, protein: 0, carbs: 0, fat: 0, fiber: 0, sodium: 0 }]);
if (genuineZero.kcal !== 0 || genuineZero.kcalMissing !== 0 || formatNutrientTotalForTest(genuineZero, "kcal", "kcal") !== "0 kcal") {
  throw new Error("A genuine zero must remain distinct from an unknown value");
}
const emptyTotals = sumForTest([]);
if (emptyTotals.kcal !== 0 || emptyTotals.kcalMissing !== 0) {
  throw new Error("An empty diary should continue to show zero consumption");
}

const standardLiquid = mapOFFForTest({
  code: "7890000000000",
  product_name: "Leite integral de teste",
  quantity: "1 L",
  product_quantity_unit: "ml",
  nutriments: {
    "energy-kj_100g": 418.4,
    "proteins_100g": "3.2",
    "carbohydrates_100g": 4.8,
    "fat_100g": 3,
    "fiber_100g": 0,
    "sodium_100g": 0.04
  }
});
if (!standardLiquid.complete || standardLiquid.unit !== "ml" || Math.abs(standardLiquid.kcal - 100) > 0.01 || Math.abs(standardLiquid.sodium - 40) > 0.01) {
  throw new Error("Open Food Facts normalized fields should keep the liquid unit, convert kJ to kcal and sodium grams to mg");
}
const legacyLiquid = mapOFFForTest({
  code: "7890000000001",
  product_name: "Bebida de teste",
  product_quantity_unit: "ml",
  nutriments: {
    "energy-kcal_100ml": 25,
    "proteins_100ml": 1,
    "carbohydrates_100ml": 5,
    "fat_100ml": 0.2,
    "salt_100ml": 0.2
  }
});
if (!legacyLiquid.complete || legacyLiquid.unit !== "ml" || Math.abs(legacyLiquid.sodium - 80) > 0.01) {
  throw new Error("Legacy 100ml fields and salt-to-sodium conversion should be supported");
}
const v3BarcodeProduct = mapOFFResponseForTest({
  status: "success",
  product: {
    code: "7890000000003",
    product_name: "Produto com resposta v3",
    nutriments: {
      "energy-kcal_100g": 120,
      "proteins_100g": 6,
      "carbohydrates_100g": 15,
      "fat_100g": 4
    }
  }
}, "0000000000000");
if (v3BarcodeProduct.code !== "7890000000003" || !v3BarcodeProduct.complete) {
  throw new Error("Open Food Facts v3 string success status should accept barcode product responses");
}
const legacyBarcodeProduct = mapOFFResponseForTest({
  status: 1,
  product: {
    product_name: "Produto com resposta legada",
    nutriments: {
      "energy-kcal_100g": 100,
      "proteins_100g": 5,
      "carbohydrates_100g": 10,
      "fat_100g": 2
    }
  }
}, "7890000000004");
if (legacyBarcodeProduct.code !== "7890000000004" || !legacyBarcodeProduct.complete) {
  throw new Error("Legacy numeric success status should remain supported");
}
let rejectedBarcodeStatus = false;
try {
  mapOFFResponseForTest({ status: "failure", product: { product_name: "Produto inválido", nutriments: {} } }, "7890000000005");
} catch {
  rejectedBarcodeStatus = true;
}
if (!rejectedBarcodeStatus) throw new Error("Failed Open Food Facts responses must be rejected");

const mixedBasis = mapOFFForTest({
  code: "7890000000002",
  product_name: "Produto incompleto",
  nutriments: {
    "energy-kcal_100g": 180,
    "proteins_100g": 9,
    "fat_100g": 5,
    "carbohydrates_100ml": 20
  }
});
if (mixedBasis.complete || mixedBasis.carbs !== null || !mixedBasis.missing.includes("carboidratos")) {
  throw new Error("Open Food Facts must not combine nutrients from different reference bases");
}

if (!html.includes("loadTacoData()") || !html.includes("searchOFFProducts") || !html.includes("lookupOFFBarcode")) {
  throw new Error("Nutrition data integrations are not wired into the app");
}
console.log(`NuTrick validation passed: JavaScript syntax OK; ${taco.length} TACO foods valid; 6 verified TACO sodium values; partial/zero nutrient totals; parser, count-unit, Open Food Facts mapping and v3/legacy barcode response checks passed.`);
