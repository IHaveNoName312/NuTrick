import { readFile } from "node:fs/promises";
import vm from "node:vm";

const html = await readFile(new URL("../index.html", import.meta.url), "utf8");
const taco = JSON.parse(await readFile(new URL("../data/taco.json", import.meta.url), "utf8"));
const serviceWorker = await readFile(new URL("../sw.js", import.meta.url), "utf8");

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
const fakeStorage = {
  data: new Map(),
  failKey: null,
  failSetKey: null,
  getItem(key) {
    if (this.failKey === key) throw new Error("Simulated storage read failure");
    return this.data.has(key) ? this.data.get(key) : null;
  },
  setItem(key, value) {
    if (this.failKey === key || this.failSetKey === key) throw new Error("Simulated storage write failure");
    this.data.set(key, String(value));
  },
  removeItem(key) {
    if (this.failKey === key) throw new Error("Simulated storage remove failure");
    this.data.delete(key);
  },
};
const testContext = vm.createContext({
  st: { foods: tacoFoods, portions: {} },
  localStorage: fakeStorage,
  toast: () => {},
  updateRecoveryNotice: () => {},
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
const rescaleCode = extract("function rescaleMealItemSnapshot(", "function saveMealEdits()");
const findMealFoodCode = extract("function findFoodForMealItem(item)", "function renderMealEditorItems()");
const diaryCode = extract("function formatDiaryDate", "function todayMeals()");
const backupCode = extract("function isRecord(value)", "function load()");
const loadCode = extract("function load()", "function rollbackUnsavedState()");
const saveCode = extract("function rollbackUnsavedState()", "let tacoReady=false;");
const parserCode = extract("function parse(text)", "let pending=null;");
new vm.Script("const seed=[]; const BACKUP_FORMAT_VERSION=1; const CURRENT_SCHEMA_VERSION=1; const STORAGE_KEY='nutrick-v1'; const RECOVERY_PREFIX='nutrick-recovery-v1-'; const RECOVERY_POINTER_KEY='nutrick-recovery-latest-v1'; const PREIMPORT_KEY='nutrick-pre-import-v1'; const PREIMPORT_ALT_KEY='nutrick-pre-import-alt-v1'; const PREMIGRATION_KEY='nutrick-pre-migration-v1'; let storageWriteBlocked=false; let recoveryRaw=null; let migrationBackupRaw=null; let storageRecoveryMessage=''; let tacoCatalog=[]; let lastSavedRaw=JSON.stringify(st); let lastStorageRaw=null;\n" + backupCode + "\n" + loadCode + "\n" + saveCode + "\n" + normalizeCode + "\n" + offCode + "\n" + portionCode + "\n" + diaryCode + "\n" + rescaleCode + "\n" + findMealFoodCode + "\n" + parserCode + "\nthis.parseForTest = parse; this.calcForTest = calc; this.rescaleMealItemSnapshotForTest = rescaleMealItemSnapshot; this.findFoodForMealItemForTest = findFoodForMealItem; this.formatQuantityForTest = formatQuantity; this.mapOFFForTest = mapOFFProduct; this.mapOFFResponseForTest = mapOFFResponse; this.sumForTest = sum; this.formatNutrientTotalForTest = formatNutrientTotal; this.formatGoalTotalForTest = formatGoalTotal; this.validateStateForTest = validateStateShape; this.unwrapBackupForTest = unwrapAndValidateBackup; this.commitImportForTest = commitImportedBackup; this.restorePreImportForTest = restorePreImportBackup; this.loadStateForTest = load; this.getRollbackRawForTest = getPreImportBackupRaw; this.getRecoveryRawForTest = () => recoveryRaw; this.saveForTest = save; this.setStorageProtectionForTest = value => { storageWriteBlocked=value; }; this.setStorageSnapshotForTest = value => { lastStorageRaw=value; }; this.createDefaultStateForTest = createDefaultState; this.setTacoCatalogForTest = value => { tacoCatalog=value; }; this.refreshSavedSnapshotForTest = () => { lastSavedRaw=JSON.stringify(persistedState(st)); }; this.persistedStateForTest = persistedState; this.getMigrationBackupForTest = () => migrationBackupRaw; this.isStorageBlockedForTest = () => storageWriteBlocked; this.groupMealsByDateForTest = groupMealsByDate; this.sortRecordsByDateNewestFirstForTest = sortRecordsByDateNewestFirst; this.removeMealByIdForTest = removeMealById; this.formatDiaryDateForTest = formatDiaryDate; this.createRecordIdForTest = createRecordId;").runInContext(testContext);
const parseForTest = testContext.parseForTest;
const rescaleMealItemSnapshotForTest = testContext.rescaleMealItemSnapshotForTest;
const findFoodForMealItemForTest = testContext.findFoodForMealItemForTest;
const mapOFFForTest = testContext.mapOFFForTest;
const mapOFFResponseForTest = testContext.mapOFFResponseForTest;
const sumForTest = testContext.sumForTest;
const formatNutrientTotalForTest = testContext.formatNutrientTotalForTest;
const formatGoalTotalForTest = testContext.formatGoalTotalForTest;
const validateStateForTest = testContext.validateStateForTest;
const unwrapBackupForTest = testContext.unwrapBackupForTest;
const commitImportForTest = testContext.commitImportForTest;
const restorePreImportForTest = testContext.restorePreImportForTest;
const loadStateForTest = testContext.loadStateForTest;
const getRollbackRawForTest = testContext.getRollbackRawForTest;
const getRecoveryRawForTest = testContext.getRecoveryRawForTest;
const saveForTest = testContext.saveForTest;
const setStorageProtectionForTest = testContext.setStorageProtectionForTest;
const setStorageSnapshotForTest = testContext.setStorageSnapshotForTest;
const createDefaultStateForTest = testContext.createDefaultStateForTest;
const refreshSavedSnapshotForTest = testContext.refreshSavedSnapshotForTest;
const setTacoCatalogForTest = testContext.setTacoCatalogForTest;
const persistedStateForTest = testContext.persistedStateForTest;
const getMigrationBackupForTest = testContext.getMigrationBackupForTest;
const isStorageBlockedForTest = testContext.isStorageBlockedForTest;
const groupMealsByDateForTest = testContext.groupMealsByDateForTest;
const sortRecordsByDateNewestFirstForTest = testContext.sortRecordsByDateNewestFirstForTest;
const removeMealByIdForTest = testContext.removeMealByIdForTest;
const formatDiaryDateForTest = testContext.formatDiaryDateForTest;
const createRecordIdForTest = testContext.createRecordIdForTest;

const groupedHistory = groupMealsByDateForTest([
  { id: "older-lunch", date: "2026-11-25", items: [] },
  { id: "newer-breakfast", date: "2026-11-26", items: [] },
  { id: "newer-lunch", date: "2026-11-26", items: [] }
]);
if (groupedHistory.length !== 2 || groupedHistory[0].date !== "2026-11-26" ||
    groupedHistory[0].meals.length !== 2 || groupedHistory[1].date !== "2026-11-25") {
  throw new Error("Diary history should group meals by date and order days newest first");
}
const sortedMeasures = sortRecordsByDateNewestFirstForTest([
  { date: "2026-11-24" }, { date: "2026-11-26" }, { date: "2026-11-25" }
]);
if (sortedMeasures.map(record => record.date).join(",") !== "2026-11-26,2026-11-25,2026-11-24") {
  throw new Error("Measurement history should be sorted by date, not by import order");
}
const remainingAfterLegacyDelete = removeMealByIdForTest([
  { id: 1790000000000, date: "2026-11-25" }, { id: "meal-current", date: "2026-11-26" }
], "1790000000000");
if (remainingAfterLegacyDelete.length !== 1 || remainingAfterLegacyDelete[0].id !== "meal-current") {
  throw new Error("Deleting a legacy numeric meal ID should work when the UI supplies a string ID");
}
const formattedHistoryDate = formatDiaryDateForTest("2026-11-26");
if (!formattedHistoryDate.includes("26") || !formattedHistoryDate.includes("2026")) {
  throw new Error("Diary date labels should preserve the intended calendar date");
}
if (createRecordIdForTest("meal", [{ id: "meal-123" }], 123) !== "meal-123-1") {
  throw new Error("New records should avoid ID collisions when timestamps repeat");
}

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

const historicalRiceSnapshot = {
  foodId: "taco-003",
  name: "Arroz cozido",
  qty: 100,
  unit: "g",
  baseUnit: "g",
  baseQuantity: 100,
  kcal: 120,
  protein: 2.1,
  carbs: 25.5,
  fat: 0.3,
  fiber: null,
  sodium: 2,
  source: "TACO antiga",
  sourceStatus: "taco"
};
const doubledHistoricalRice = rescaleMealItemSnapshotForTest(historicalRiceSnapshot, 200, null, null);
if (doubledHistoricalRice.kcal !== 240 || doubledHistoricalRice.protein !== 4.2 ||
    doubledHistoricalRice.carbs !== 51 || doubledHistoricalRice.fiber !== null ||
    doubledHistoricalRice.baseQuantity !== 200 || doubledHistoricalRice.source !== "TACO antiga") {
  throw new Error("Changing the amount of a historical food must scale its saved nutrient snapshot, not recalculate from today's catalog");
}
const adjustedCountSnapshot = rescaleMealItemSnapshotForTest({
  foodId: "taco-488", name: "Ovo", qty: 2, unit: "un",
  portionAmount: 50, portionName: "ovo", baseUnit: "g", baseQuantity: 100,
  kcal: 292, protein: 25.2, carbs: 2.2, fat: 19.4, fiber: null, sodium: 140
}, 3, 60, "ovo");
if (Math.abs(adjustedCountSnapshot.baseQuantity - 180) > 0.001 ||
    Math.abs(adjustedCountSnapshot.kcal - 525.6) > 0.001 ||
    adjustedCountSnapshot.portionAmount !== 60 || adjustedCountSnapshot.portionName !== "ovo" ||
    adjustedCountSnapshot.fiber !== null) {
  throw new Error("Changing counted portions must scale the original nutrient snapshot by the new edible amount");
}
const unchangedCountSnapshot = rescaleMealItemSnapshotForTest({
  foodId: "test", name: "Castanha", qty: 2, unit: "un",
  portionAmount: 5, portionName: "castanha", baseQuantity: 10,
  kcal: 60, protein: 2, carbs: 2, fat: 5, fiber: null, sodium: 0
}, 4, 5, "castanha");
if (unchangedCountSnapshot.kcal !== 120 || unchangedCountSnapshot.baseQuantity !== 20) {
  throw new Error("Changing only the count must preserve the saved nutrient density");
}
const exactResolvedFood = findFoodForMealItemForTest({ foodId: tacoFoods[0].id, name: "Nome histórico diferente", unit: tacoFoods[0].unit });
const wrongResolvedFood = findFoodForMealItemForTest({ foodId: "retired-food-id", name: tacoFoods[0].name, unit: tacoFoods[0].unit });
if (exactResolvedFood !== tacoFoods[0] || wrongResolvedFood !== null) {
  throw new Error("Historical items must resolve catalog foods by exact ID only, never by a potentially misleading name match");
}
const manualPeanut = { id: "test-peanut", name: "Amendoim", base: 100, unit: "g", kcal: 600, protein: 25, carbs: 20, fat: 50, portionAmount: 1, portionName: "amendoim" };
const twelvePeanuts = testContext.calcForTest(manualPeanut, 12, "un");
if (Math.abs(twelvePeanuts.kcal - 72) > 0.01 || twelvePeanuts.baseQuantity !== 12) {
  throw new Error("Twelve counted peanuts should convert using the configured grams-per-unit value");
}

const validBackupState = {
  goals: { kcal: 2250, protein: 160, carbs: 265, fat: 60, fiber: 30, water: 2700 },
  foods: tacoFoods,
  meals: [{
    id: "meal-20261126",
    date: "2026-11-26",
    type: "Almoço",
    raw: "100 g de arroz",
    items: [{
      foodId: "taco-003",
      name: "Arroz, tipo 1, cozido",
      qty: 100,
      unit: "g",
      baseUnit: "g",
      baseQuantity: 100,
      kcal: 128,
      protein: 2.5,
      carbs: 28.1,
      fat: 0.2,
      fiber: 1.6,
      sodium: 1
    }]
  }],
  measures: [{ date: "2026-11-26", weight: 75, waist: null }],
  water: [{ date: "2026-11-26", ml: 500 }],
  portions: { "taco-488": { amount: 50, name: "ovo" } }
};
if (validateStateForTest(validBackupState) !== null) {
  throw new Error("A valid current NuTrick state should pass backup validation");
}
const legacyBackup = { ...validBackupState };
delete legacyBackup.portions;
const numericLegacyMeal = { ...validBackupState, meals: [{ ...validBackupState.meals[0], id: 1790000000000 }] };
if (validateStateForTest(numericLegacyMeal) !== null) {
  throw new Error("Legacy numeric meal identifiers should remain importable");
}
const preparedLegacy = unwrapBackupForTest(legacyBackup);
if (!preparedLegacy.legacy || !preparedLegacy.state.portions || Object.keys(preparedLegacy.state.portions).length !== 0 || preparedLegacy.state.schemaVersion !== 1) {
  throw new Error("Legacy backups without custom portions should be accepted and normalized");
}
const envelopeBackup = unwrapBackupForTest({
  app: "NuTrick",
  formatVersion: 1,
  exportedAt: "2026-11-26T20:00:00.000Z",
  data: validBackupState
});
if (envelopeBackup.legacy || envelopeBackup.state.meals.length !== 1 || envelopeBackup.state.schemaVersion !== 1) {
  throw new Error("Versioned NuTrick backup envelopes should be accepted");
}
const currentRaw = JSON.stringify(legacyBackup);
const historicalMeal = {
  ...validBackupState.meals[0],
  id: "meal-2026-11-24",
  date: "2026-11-24",
  items: [{ ...validBackupState.meals[0].items[0], foodId: "taco-retired-999", name: "Alimento fora do catálogo" }]
};
const incomingState = {
  ...validBackupState,
  meals: [...validBackupState.meals, historicalMeal],
  measures: [
    { date: "2026-11-24", weight: 75, waist: 82 },
    { date: "2026-11-26", weight: 76, waist: 80 }
  ],
  water: [
    { date: "2026-11-24", ml: 1800 },
    { date: "2026-11-26", ml: 500 }
  ]
};
const incomingEnvelope = { app: "NuTrick", formatVersion: 1, exportedAt: "2026-11-26T20:00:00.000Z", data: incomingState };
fakeStorage.data = new Map([["nutrick-v1", currentRaw]]);
fakeStorage.failKey = null;
setStorageSnapshotForTest(currentRaw);
const imported = commitImportForTest(incomingEnvelope);
if (imported.legacy || fakeStorage.getItem("nutrick-pre-import-v1") !== currentRaw) {
  throw new Error("Import should save the old state as a restore point before replacing it");
}
const importedState = JSON.parse(fakeStorage.getItem("nutrick-v1"));
if (importedState.measures.length !== 2 || importedState.meals.length !== 2 ||
    importedState.water.length !== 2 || importedState.schemaVersion !== 1 ||
    importedState.meals.find(meal => meal.id === "meal-2026-11-24")?.items[0]?.name !== "Alimento fora do catálogo") {
  throw new Error("Validated import should persist the new state");
}
const importedRaw = fakeStorage.getItem("nutrick-v1");
const beforeFailedImportState = testContext.st;
fakeStorage.failSetKey = "nutrick-v1";
let mainWriteRejected = false;
try { commitImportForTest(incomingEnvelope); } catch { mainWriteRejected = true; }
fakeStorage.failSetKey = null;
if (!mainWriteRejected || fakeStorage.getItem("nutrick-v1") !== importedRaw || testContext.st !== beforeFailedImportState) {
  throw new Error("A failed main storage write must leave the current state unchanged");
}
fakeStorage.failSetKey = "nutrick-pre-import-alt-v1";
let snapshotWriteRejected = false;
try { commitImportForTest(incomingEnvelope); } catch { snapshotWriteRejected = true; }
fakeStorage.failSetKey = null;
if (!snapshotWriteRejected || fakeStorage.getItem("nutrick-v1") !== importedRaw) {
  throw new Error("A failed restore-point write must abort import before replacing current data");
}
fakeStorage.failSetKey = "nutrick-v1";
let importMainWriteRejected = false;
try { commitImportForTest(incomingEnvelope); } catch { importMainWriteRejected = true; }
fakeStorage.failSetKey = null;
if (!importMainWriteRejected || fakeStorage.getItem("nutrick-v1") !== importedRaw ||
    getRollbackRawForTest() !== currentRaw) {
  throw new Error("A failed main import write must preserve current data and the previous restore point");
}
fakeStorage.failKey = null;
fakeStorage.data = new Map([
  ["nutrick-v1", importedRaw],
  ["nutrick-pre-import-v1", currentRaw]
]);
restorePreImportForTest();
const restoredState = JSON.parse(fakeStorage.getItem("nutrick-v1"));
const alternateState = JSON.parse(fakeStorage.getItem("nutrick-pre-import-v1"));
if (restoredState.measures.length !== 1 || restoredState.measures[0].weight !== 75 ||
    restoredState.meals.length !== 1 || restoredState.water.length !== 1 ||
    alternateState.measures.length !== 2 || alternateState.measures[1].weight !== 76 ||
    alternateState.meals.length !== 2 || alternateState.water.length !== 2) {
  throw new Error("Restoring a previous backup should preserve the replaced state as the next restore point");
}
restorePreImportForTest();
const toggledState = JSON.parse(fakeStorage.getItem("nutrick-v1"));
if (toggledState.measures.length !== 2 || toggledState.measures[1].weight !== 76 ||
    toggledState.meals.length !== 2 || toggledState.water.length !== 2 ||
    toggledState.meals.find(meal => meal.id === "meal-2026-11-24")?.items[0]?.foodId !== "taco-retired-999") {
  throw new Error("The restore point should be reversible without losing either state");
}

const beforeRestoreFailureRaw = fakeStorage.getItem("nutrick-v1");
const restorePointBeforeFailure = getRollbackRawForTest();
fakeStorage.failSetKey = "nutrick-v1";
let restoreMainWriteRejected = false;
try { restorePreImportForTest(); } catch { restoreMainWriteRejected = true; }
fakeStorage.failSetKey = null;
if (!restoreMainWriteRejected || fakeStorage.getItem("nutrick-v1") !== beforeRestoreFailureRaw ||
    getRollbackRawForTest() !== restorePointBeforeFailure) {
  throw new Error("A failed restore write must preserve both the active data and its previous restore point");
}
fakeStorage.failSetKey = "nutrick-pre-import-v1";
restorePreImportForTest();
fakeStorage.failSetKey = null;
if (JSON.parse(fakeStorage.getItem("nutrick-v1")).measures[0].weight !== 75 ||
    getRollbackRawForTest() !== beforeRestoreFailureRaw) {
  throw new Error("If the canonical restore-point write fails, the staged alternate must remain recoverable");
}
restorePreImportForTest();
if (JSON.parse(fakeStorage.getItem("nutrick-v1")).measures.length !== 2 ||
    JSON.parse(fakeStorage.getItem("nutrick-v1")).meals.length !== 2 ||
    JSON.parse(fakeStorage.getItem("nutrick-v1")).water.length !== 2) {
  throw new Error("A restore must remain reversible after a failure while finalizing its restore point");
}

const stableStorageRaw = fakeStorage.getItem("nutrick-v1");
const externalState = JSON.parse(stableStorageRaw);
externalState.goals = { ...externalState.goals, protein: externalState.goals.protein + 1 };
const externalStorageRaw = JSON.stringify(externalState);
fakeStorage.data.set("nutrick-v1", externalStorageRaw);
let staleImportRejected = false;
try { commitImportForTest(incomingEnvelope); } catch { staleImportRejected = true; }
if (!staleImportRejected || fakeStorage.getItem("nutrick-v1") !== externalStorageRaw || !isStorageBlockedForTest()) {
  throw new Error("An import from a stale tab must not overwrite a newer external state");
}
setStorageProtectionForTest(false);
let staleRestoreRejected = false;
try { restorePreImportForTest(); } catch { staleRestoreRejected = true; }
if (!staleRestoreRejected || fakeStorage.getItem("nutrick-v1") !== externalStorageRaw || !isStorageBlockedForTest()) {
  throw new Error("A restore from a stale tab must not overwrite a newer external state");
}
setStorageProtectionForTest(false);
fakeStorage.data.set("nutrick-v1", stableStorageRaw);
setStorageSnapshotForTest(stableStorageRaw);

const beforeInvalidImportRaw = fakeStorage.getItem("nutrick-v1");
const beforeInvalidImportState = testContext.st;
let incompleteBackupRejected = false;
try {
  commitImportForTest({ app: "NuTrick", formatVersion: 1, data: { ...incomingState, water: undefined } });
} catch { incompleteBackupRejected = true; }
if (!incompleteBackupRejected || fakeStorage.getItem("nutrick-v1") !== beforeInvalidImportRaw || testContext.st !== beforeInvalidImportState) {
  throw new Error("An incomplete backup must be rejected without changing current data or memory state");
}
let corruptItemBackupRejected = false;
try {
  const corruptState = { ...incomingState, meals: [{ ...incomingState.meals[0], items: [{ ...incomingState.meals[0].items[0], qty: -1 }] }] };
  commitImportForTest({ app: "NuTrick", formatVersion: 1, data: corruptState });
} catch { corruptItemBackupRejected = true; }
if (!corruptItemBackupRejected || fakeStorage.getItem("nutrick-v1") !== beforeInvalidImportRaw) {
  throw new Error("A backup with a corrupt nested meal item must not replace valid user data");
}

fakeStorage.data = new Map();
testContext.st = createDefaultStateForTest();
setTacoCatalogForTest([]);
refreshSavedSnapshotForTest();
setStorageSnapshotForTest(null);
testContext.st.goals.kcal = 2300;
if (saveForTest() !== true || JSON.parse(fakeStorage.getItem("nutrick-v1")).goals.kcal !== 2300) {
  throw new Error("A fresh installation with no existing storage key must allow its first successful save");
}
const userFood = {
  id: "u-personal-food",
  name: "Alimento pessoal",
  base: 100,
  unit: "g",
  kcal: 200,
  protein: 10,
  carbs: 20,
  fat: 5,
  fiber: null,
  sodium: null,
  source: "Cadastro manual",
  sourceStatus: "manual"
};
const durableState = {
  ...validBackupState,
  foods: [...tacoFoods, userFood],
  goals: { ...validBackupState.goals }
};
testContext.st = JSON.parse(JSON.stringify(durableState));
setTacoCatalogForTest(tacoFoods);
refreshSavedSnapshotForTest();
const persistedCatalogCheck = persistedStateForTest(testContext.st);
if (persistedCatalogCheck.foods.some(food => food.id.startsWith("taco-")) ||
    !persistedCatalogCheck.foods.some(food => food.id === userFood.id)) {
  throw new Error("Static TACO foods must stay out of localStorage while personal foods remain persisted");
}
const durableRaw = JSON.stringify(persistedStateForTest(testContext.st));
fakeStorage.data = new Map([["nutrick-v1", durableRaw]]);
setStorageSnapshotForTest(durableRaw);
fakeStorage.failKey = "nutrick-v1";
testContext.st.goals.protein = 999;
if (saveForTest() !== false || testContext.st.goals.protein !== 160 || fakeStorage.data.get("nutrick-v1") !== durableRaw) {
  throw new Error("Failed storage writes must roll back in-memory changes and preserve the last committed data");
}
fakeStorage.failKey = null;
const externalTabRaw = JSON.stringify({ ...testContext.st, goals: { ...testContext.st.goals, protein: 145 } });
fakeStorage.data.set("nutrick-v1", externalTabRaw);
testContext.st.goals.protein = 149;
if (saveForTest() !== false || testContext.st.goals.protein !== 160 || fakeStorage.data.get("nutrick-v1") !== externalTabRaw || !isStorageBlockedForTest()) {
  throw new Error("A stale tab must detect a newer external storage state, block saving and preserve the newer data");
}
setStorageProtectionForTest(false);
fakeStorage.data.set("nutrick-v1", durableRaw);
testContext.st.goals.protein = 150;
fakeStorage.failKey = null;

if (saveForTest() !== true || JSON.parse(fakeStorage.data.get("nutrick-v1")).goals.protein !== 150) {
  throw new Error("Successful storage writes should commit the new state and update the rollback snapshot");
}
const persistedAfterSave = JSON.parse(fakeStorage.data.get("nutrick-v1"));
if (persistedAfterSave.foods.some(food => food.id.startsWith("taco-")) ||
    !persistedAfterSave.foods.some(food => food.id === userFood.id)) {
  throw new Error("A successful save must persist personal food only, not the static TACO catalog");
}
const validBeforeInvalidMutation = fakeStorage.data.get("nutrick-v1");
testContext.st.meals[0].items[0].qty = -100;
if (saveForTest() !== false || testContext.st.meals[0].items[0].qty !== 100 ||
    fakeStorage.data.get("nutrick-v1") !== validBeforeInvalidMutation) {
  throw new Error("The save layer must validate internal state and roll back invalid mutations before writing");
}
setStorageProtectionForTest(true);
testContext.st.goals.protein = 140;
if (saveForTest() !== false || testContext.st.goals.protein !== 150) {
  throw new Error("Storage protection mode must reject writes and restore the last committed state");
}
setStorageProtectionForTest(false);

fakeStorage.data = new Map([["nutrick-v1", "{corrupted json"]]);
fakeStorage.failKey = null;
const recoveredDefault = loadStateForTest();
if (!Array.isArray(recoveredDefault.foods) || fakeStorage.getItem("nutrick-v1") !== "{corrupted json" ||
    ![...fakeStorage.data.keys()].some(key => key.startsWith("nutrick-recovery-v1-")) ||
    fakeStorage.getItem("nutrick-recovery-latest-v1")===null) {
  throw new Error("Malformed local data should be preserved and indexed before the app falls back to a default state");
}
fakeStorage.data.set("nutrick-v1", JSON.stringify({
  goals: { kcal: 2250, protein: 160, carbs: 265, fat: 60, fiber: 30, water: 2700 },
  foods: [], meals: [], measures: [], water: [], portions: {}
}));
loadStateForTest();
if (getRecoveryRawForTest() !== "{corrupted json") {
  throw new Error("A saved recovery copy should remain discoverable after an application reload");
}
function assertBackupRejected(payload, label) {
  let rejected = false;
  try { unwrapBackupForTest(payload); } catch { rejected = true; }
  if (!rejected) throw new Error("Backup validator should reject: " + label);
}
assertBackupRejected({ ...validBackupState, goals: { ...validBackupState.goals, protein: -1 } }, "negative nutrition goal");
assertBackupRejected({ ...validBackupState, meals: [{ ...validBackupState.meals[0], date: "2026-02-30" }] }, "impossible meal date");
assertBackupRejected({ ...validBackupState, foods: [{ ...tacoFoods[0], base: 0 }] }, "zero food reference basis");
assertBackupRejected({ ...validBackupState, water: [{ date: "2026-11-26", ml: 0 }] }, "zero water entry");
assertBackupRejected({ ...validBackupState, measures: [{ date: "26/11/2026", weight: 75, waist: null }] }, "non-ISO measure date");
assertBackupRejected({ ...validBackupState, meals: [{ ...validBackupState.meals[0], items: [{ ...validBackupState.meals[0].items[0], qty: -100 }] }] }, "negative consumed quantity");
assertBackupRejected({ ...validBackupState, meals: [{ ...validBackupState.meals[0], items: [{ ...validBackupState.meals[0].items[0], unit: "kg" }] }] }, "unsupported meal item unit");
assertBackupRejected({ app: "NuTrick", formatVersion: 99, data: validBackupState }, "unknown future backup version");
assertBackupRejected({ ...validBackupState, schemaVersion: 99 }, "unknown future data schema version");
assertBackupRejected({ ...validBackupState, foods: [tacoFoods[0], tacoFoods[0]] }, "duplicate food id");

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
const multiDayState = {
  ...validBackupState,
  meals: [
    { ...validBackupState.meals[0], id: "older-day-meal", date: "2026-11-24" },
    { ...validBackupState.meals[0], id: "newer-day-meal", date: "2026-11-26" }
  ],
  measures: [
    { date: "2026-11-24", weight: 75, waist: 82 },
    { date: "2026-11-26", weight: 74.8, waist: 81 }
  ],
  water: [
    { date: "2026-11-24", ml: 1500 },
    { date: "2026-11-26", ml: 2000 }
  ]
};
fakeStorage.failKey = null;
fakeStorage.data = new Map([["nutrick-v1", JSON.stringify(multiDayState)]]);
const reloadedMultiDayState = loadStateForTest();
if (reloadedMultiDayState.meals.length !== 2 ||
    reloadedMultiDayState.meals[0].date !== "2026-11-24" ||
    reloadedMultiDayState.meals[1].date !== "2026-11-26" ||
    reloadedMultiDayState.measures.length !== 2 ||
    reloadedMultiDayState.water.length !== 2) {
  throw new Error("Reloading local storage must preserve every meal, measure and water entry across historical dates");
}
const migratedStoredState = JSON.parse(fakeStorage.getItem("nutrick-v1"));
const originalMultiDayRaw = JSON.stringify(multiDayState);
if (migratedStoredState.schemaVersion !== 1 ||
    fakeStorage.getItem("nutrick-pre-migration-v1") !== originalMultiDayRaw ||
    getMigrationBackupForTest() !== originalMultiDayRaw ||
    migratedStoredState.meals.length !== 2 || migratedStoredState.measures.length !== 2 ||
    migratedStoredState.water.length !== 2) {
  throw new Error("Legacy local state should migrate only after preserving its exact original JSON");
}
const currentSchemaRaw = fakeStorage.getItem("nutrick-v1");
loadStateForTest();
if (fakeStorage.getItem("nutrick-v1") !== currentSchemaRaw) {
  throw new Error("Loading current schema data must not trigger another migration or rewrite");
}
fakeStorage.data = new Map([["nutrick-v1", originalMultiDayRaw]]);
fakeStorage.failSetKey = "nutrick-pre-migration-v1";
const blockedSnapshotMigration = loadStateForTest();
fakeStorage.failSetKey = null;
if (fakeStorage.getItem("nutrick-v1") !== originalMultiDayRaw ||
    !isStorageBlockedForTest() || blockedSnapshotMigration.meals.length !== 2 || getMigrationBackupForTest() !== originalMultiDayRaw) {
  throw new Error("Migration must abort without touching source data when the safety snapshot cannot be written");
}
setStorageProtectionForTest(false);
fakeStorage.data = new Map([["nutrick-v1", originalMultiDayRaw]]);
fakeStorage.failSetKey = "nutrick-v1";
const blockedMainMigration = loadStateForTest();
fakeStorage.failSetKey = null;
if (fakeStorage.getItem("nutrick-v1") !== originalMultiDayRaw ||
    fakeStorage.getItem("nutrick-pre-migration-v1") !== originalMultiDayRaw ||
    !isStorageBlockedForTest() || blockedMainMigration.meals.length !== 2) {
  throw new Error("A failed migrated-state write must leave source data intact and retain the staged snapshot");
}
setStorageProtectionForTest(false);
const futureSchemaRaw = JSON.stringify({ ...multiDayState, schemaVersion: 99 });
fakeStorage.data = new Map([["nutrick-v1", futureSchemaRaw]]);
fakeStorage.failKey = null;
loadStateForTest();
if (fakeStorage.getItem("nutrick-v1") !== futureSchemaRaw || !isStorageBlockedForTest() ||
    getRecoveryRawForTest() !== futureSchemaRaw) {
  throw new Error("A newer schema must be preserved and place an older application in read-only protection mode");
}
setStorageProtectionForTest(false);

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

const userMutationSaveCalls = (html.match(/if\(!save\(\)\)/g) || []).length;
if (userMutationSaveCalls < 10) throw new Error("Expected user-facing mutations to check save() success before confirming changes");
if (!html.includes("if(!save()){render();return}") || !html.includes("if(!save()){renderFoodResults")) {
  throw new Error("A failed save must stop success-side effects and restore the visible UI");
}

if (!html.includes("currentRaw!==lastStorageRaw") || (html.match(/currentRaw!==lastStorageRaw/g) || []).length < 3 || !html.includes("window.addEventListener('storage'")) {
  throw new Error("Cross-tab conflict detection and stale-tab protection must remain wired into the app");
}

if (!html.includes("groupMealsByDate(st.meals)") ||
    !html.includes("id:createRecordId('meal',st.meals)") ||
    !html.includes("st.meals=removeMealById(st.meals,del.dataset.delete)")) {
  throw new Error("Date-grouped history, collision-safe meal IDs and legacy-compatible deletion must remain wired into the app");
}
if (!html.includes("loadTacoData()") || !html.includes("searchOFFProducts") || !html.includes("lookupOFFBarcode")) {
  throw new Error("Nutrition data integrations are not wired into the app");
}
if (!html.includes("function rescaleMealItemSnapshot(") ||
    !html.includes("if(draft.baseItem)") ||
    !html.includes("rescaleMealItemSnapshot(draft.baseItem,qty,portionAmount,draft.portionName)") ||
    !html.includes("return st.foods.find(f=>f.id===item.foodId) || null")) {
  throw new Error("Editing an existing meal must preserve its nutrient snapshot and resolve food references by exact ID");
}
if (!html.includes("const validationError=validateStateShape(st)") ||
    !html.includes("Reabra o NuTrick para importar ou restaurar com segurança")) {
  throw new Error("Backup export validation and stale-tab protection for import/restore must remain wired into the app");
}
if (!html.includes('id="connectionStatus"') ||
    !html.includes("function updateConnectionStatus()") ||
    !html.includes("const offline=!navigator.onLine") ||
    !html.includes("updateConnectionStatus();") ||
    !html.includes("window.addEventListener('offline'") ||
    !html.includes("window.addEventListener('online'")) {
  throw new Error("The app must show persistent offline status both on launch without internet and after a disconnect");
}

const workerListeners = new Map();
const appScope = "https://example.github.io/NuTrick/";
const workerCacheData = new Map();
const cacheResponse = (body, status = 200, type = "basic") => ({
  body, status, ok: status >= 200 && status < 300, type,
  clone() { return cacheResponse(body, status, type); }
});
const workerCacheKey = request => typeof request === "string" ? new URL(request, appScope).href : request.url;
let failWorkerCachePut = false;
const workerCaches = {
  async open(name) {
    if (!workerCacheData.has(name)) workerCacheData.set(name, new Map());
    const entries = workerCacheData.get(name);
    return {
      async addAll(urls) {
        for (const url of urls) entries.set(workerCacheKey(url), cacheResponse("precache:" + workerCacheKey(url)));
      },
      async put(request, response) {
        if (failWorkerCachePut) throw new Error("Simulated cache quota failure");
        entries.set(workerCacheKey(request), response);
      },
      async match(request) { return entries.get(workerCacheKey(request)) || null; }
    };
  },
  async keys() { return [...workerCacheData.keys()]; },
  async delete(name) { return workerCacheData.delete(name); }
};
let skipWaitingCalled = false;
let clientsClaimCalled = false;
let workerFetch = async () => cacheResponse("network response");
const workerSelf = {
  registration: { scope: appScope },
  location: { origin: "https://example.github.io" },
  clients: { async claim() { clientsClaimCalled = true; } },
  async skipWaiting() { skipWaitingCalled = true; },
  addEventListener(type, callback) { workerListeners.set(type, callback); }
};
const workerContext = vm.createContext({
  self: workerSelf,
  caches: workerCaches,
  URL,
  Response,
  fetch: request => workerFetch(request)
});
new vm.Script(serviceWorker, { filename: "NuTrick-service-worker.js" }).runInContext(workerContext);
if (!serviceWorker.includes('nutrick-v0.6.6-cache')) {
  throw new Error("Service worker cache version must be bumped when the app shell changes");
}
let installWait = null;
workerListeners.get("install")({ waitUntil(promise) { installWait = promise; } });
await installWait;
if (!skipWaitingCalled || !workerCacheData.has("nutrick-v0.6.6-cache")) {
  throw new Error("Service worker install must precache the app shell before activation");
}
const installedEntries = workerCacheData.get("nutrick-v0.6.6-cache");
for (const path of ["index.html", "manifest.webmanifest", "data/taco.json"]) {
  if (![...installedEntries.keys()].some(key => key.endsWith("/" + path))) {
    throw new Error("Offline app shell is missing a required asset: " + path);
  }
}
workerCacheData.set("nutrick-v0.6.4-cache", new Map());
workerCacheData.set("another-app-cache", new Map());
let activateWait = null;
workerListeners.get("activate")({ waitUntil(promise) { activateWait = promise; } });
await activateWait;
if (workerCacheData.has("nutrick-v0.6.4-cache") ||
    !workerCacheData.has("another-app-cache") || !clientsClaimCalled) {
  throw new Error("Activation must remove only obsolete NuTrick caches and preserve other apps' caches");
}
async function dispatchWorkerFetch(request) {
  let responsePromise = null;
  workerListeners.get("fetch")({
    request,
    respondWith(promise) { responsePromise = Promise.resolve(promise); }
  });
  return responsePromise;
}
const appRequest = { method: "GET", url: appScope + "index.html", mode: "navigate" };
const onlineResponse = await dispatchWorkerFetch(appRequest);
if (!onlineResponse || onlineResponse.body !== "network response" ||
    (await workerCaches.open("nutrick-v0.6.6-cache")).match(appRequest) === null) {
  throw new Error("Successful online responses must be cached for later offline use");
}
workerFetch = async () => { throw new Error("Simulated offline network"); };
const cachedOfflineResponse = await dispatchWorkerFetch(appRequest);
if (!cachedOfflineResponse || cachedOfflineResponse.body !== "network response") {
  throw new Error("Offline requests must return their cached resource");
}
const uncachedNavigation = { method: "GET", url: appScope + "deep-link", mode: "navigate" };
const fallbackResponse = await dispatchWorkerFetch(uncachedNavigation);
if (!fallbackResponse || fallbackResponse.body !== "network response") {
  throw new Error("Offline navigation must fall back to the cached app shell");
}
const unavailableAsset = { method: "GET", url: appScope + "missing-resource.json", mode: "cors" };
const unavailableResponse = await dispatchWorkerFetch(unavailableAsset);
if (!unavailableResponse || unavailableResponse.status !== 503) {
  throw new Error("An uncached offline resource must return an explicit 503 response");
}
failWorkerCachePut = true;
workerFetch = async () => cacheResponse("network despite cache failure");
const cacheQuotaResponse = await dispatchWorkerFetch({ method: "GET", url: appScope + "new-asset.js", mode: "cors" });
if (!cacheQuotaResponse || cacheQuotaResponse.body !== "network despite cache failure") {
  throw new Error("A cache quota failure must not break a successful network response");
}
failWorkerCachePut = false;
let externalFetchCalled = false;
workerFetch = async () => { externalFetchCalled = true; return cacheResponse("external"); };
const externalResponse = await dispatchWorkerFetch({ method: "GET", url: "https://example.com/external.json", mode: "cors" });
const postResponse = await dispatchWorkerFetch({ method: "POST", url: appScope + "submit", mode: "cors" });
if (externalResponse !== null || postResponse !== null || externalFetchCalled) {
  throw new Error("The service worker must not intercept cross-origin requests or non-GET methods");
}
if (!html.includes("updateViaCache:'none'") ||
    !html.includes("registration.update()") ||
    !html.includes("document.visibilityState==='visible'")) {
  throw new Error("The PWA must bypass worker-script HTTP cache and check for updates when returning to foreground");
}
if (!html.includes("window.addEventListener('offline'") || !html.includes("window.addEventListener('online'")) {
  throw new Error("The app should inform users when connectivity changes");
}

console.log(`NuTrick validation passed: JavaScript syntax OK; ${taco.length} TACO foods valid; schema v0-to-v1 migration, original snapshot preservation, migration failure rollback, future-schema protection, legacy/versioned backup migration; date-grouped history and multi-day reload; parser, count-unit and Open Food Facts checks passed.`);
