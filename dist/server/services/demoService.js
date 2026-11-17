import { setTimeout as delay } from "node:timers/promises";
import { collections } from "../db.js";
import { HttpError } from "../errors.js";
import { STARTING_FLAVORS } from "../seedData.js";
import { createSale } from "./salesService.js";
import { getSettings, resetSettings } from "./settingsService.js";
import { writeStockLogs } from "./stockService.js";
const RUSH_SECONDS = 15;
const RUSH_INTERVAL_MS = 1000;
const RUSH_SELLER = "Rush demo";
const MAX_FLAVORS_PER_RUSH_SERVING = 3;
const MS_PER_DAY = 24 * 60 * 60 * 1000;
let rushRunning = false;
function toFlavorDoc(seed, now) {
    const { seasonDays, ...fields } = seed;
    return {
        ...fields,
        isActive: true,
        availableUntil: seasonDays ? new Date(now.getTime() + seasonDays * MS_PER_DAY) : undefined,
        createdAt: now,
        updatedAt: now,
    };
}
// replaceOne keeps each flavor's _id but throws away any edits, so the demo
// always starts from the same documents.
export async function restoreStartingFlavors(by) {
    const now = new Date();
    for (const seed of STARTING_FLAVORS) {
        await collections.flavors().replaceOne({ name: seed.name }, toFlavorDoc(seed, now), { upsert: true });
    }
    const names = STARTING_FLAVORS.map((seed) => seed.name);
    const flavors = await collections.flavors().find({ name: { $in: names } }).toArray();
    const logs = flavors.map((flavor) => ({
        flavorId: flavor._id,
        flavorName: flavor.name,
        type: "reset",
        change: flavor.stockScoops,
        balanceAfter: flavor.stockScoops,
        at: now,
        by,
    }));
    await writeStockLogs(logs);
}
export async function resetDemoData() {
    await Promise.all([
        collections.sales().deleteMany({}),
        collections.requests().deleteMany({}),
        collections.stockLogs().deleteMany({}),
        collections.counters().deleteMany({}),
    ]);
    await resetSettings();
    await restoreStartingFlavors("Demo reset");
}
function randomInt(min, max) {
    return min + Math.floor(Math.random() * (max - min + 1));
}
function shuffle(items) {
    return [...items].sort(() => Math.random() - 0.5);
}
// Picks a few flavors and spreads the scoops over them, never taking more
// scoops of a flavor than are left in its tub.
export function randomServing(flavors, size) {
    const remaining = new Map(flavors.map((flavor) => [flavor._id.toHexString(), flavor.stockScoops]));
    const totalLeft = [...remaining.values()].reduce((sum, scoops) => sum + scoops, 0);
    if (totalLeft < size)
        return null;
    const order = shuffle([...remaining.keys()]);
    const chosen = order.slice(0, randomInt(1, MAX_FLAVORS_PER_RUSH_SERVING));
    const counts = new Map();
    for (let scoop = 0; scoop < size; scoop++) {
        let options = chosen.filter((id) => (remaining.get(id) ?? 0) > 0);
        if (options.length === 0) {
            const extra = order.find((id) => !chosen.includes(id) && (remaining.get(id) ?? 0) > 0);
            if (!extra)
                return null;
            chosen.push(extra);
            options = [extra];
        }
        const id = options[randomInt(0, options.length - 1)];
        remaining.set(id, (remaining.get(id) ?? 0) - 1);
        counts.set(id, (counts.get(id) ?? 0) + 1);
    }
    return [...counts].map(([flavorId, scoops]) => ({ flavorId, scoops }));
}
async function sellRandomServing() {
    const settings = await getSettings();
    const flavors = await collections.flavors().find({ isActive: true, stockScoops: { $gt: 0 } }).toArray();
    const items = randomServing(flavors, settings.scoopsPerSale);
    if (!items)
        return false;
    try {
        await createSale({ items, soldBy: RUSH_SELLER });
    }
    catch (error) {
        // Another seller may have taken the last scoops first. Skip this second.
        if (!(error instanceof HttpError))
            throw error;
    }
    return true;
}
async function runRush() {
    try {
        for (let second = 0; second < RUSH_SECONDS; second++) {
            if (!(await sellRandomServing()))
                break;
            await delay(RUSH_INTERVAL_MS);
        }
    }
    finally {
        rushRunning = false;
    }
}
export function startRush() {
    if (rushRunning)
        throw new HttpError(409, "A rush is already running");
    rushRunning = true;
    runRush().catch((error) => console.error("Rush stopped:", error));
    return RUSH_SECONDS;
}
// Newer MongoDB versions wrap the plan in "queryPlan", older ones do not.
function planStages(plan) {
    if (typeof plan !== "object" || plan === null)
        return [];
    const node = plan;
    if (node.queryPlan)
        return planStages(node.queryPlan);
    const own = typeof node.stage === "string" ? [node.stage] : [];
    return [...planStages(node.inputStage), ...own];
}
function readExplain(explain) {
    const stats = explain.executionStats;
    return {
        stage: planStages(explain.queryPlanner?.winningPlan).join(" → "),
        keysExamined: stats.totalKeysExamined,
        docsExamined: stats.totalDocsExamined,
        returned: stats.nReturned,
        timeMs: stats.executionTimeMillis,
    };
}
async function explainSalesQuery(description, filter, index, indexName) {
    const sales = collections.sales();
    // hint({ $natural: 1 }) forces a full collection scan, which is what MongoDB
    // would have to do if the index did not exist.
    const [withIndex, withoutIndex, totalDocuments] = await Promise.all([
        sales.find(filter).hint(index).explain("executionStats"),
        sales.find(filter).hint({ $natural: 1 }).explain("executionStats"),
        sales.countDocuments(),
    ]);
    return {
        description,
        filter,
        indexName,
        totalDocuments,
        withIndex: readExplain(withIndex),
        withoutIndex: readExplain(withoutIndex),
    };
}
export async function explainQuery(queryName) {
    if (queryName === "flavor") {
        const flavor = await collections.flavors().findOne({}, { sort: { name: 1 } });
        if (!flavor)
            throw new HttpError(400, "There are no flavors yet. Run the seed first.");
        return explainSalesQuery(`Sales that contain ${flavor.name}`, { "items.flavorId": flavor._id }, { "items.flavorId": 1 }, "items.flavorId_1 (multikey)");
    }
    const since = new Date(Date.now() - MS_PER_DAY);
    return explainSalesQuery("Sales in the last 24 hours", { soldAt: { $gte: since } }, { soldAt: 1 }, "soldAt_1");
}
async function errorMessage(response) {
    const body = await response.json();
    if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "string") {
        return body.error;
    }
    return "Unexpected response";
}
// Sends real HTTP requests to our own POST /api/sales, so the rejection comes
// from exactly the same validation a browser would hit.
export async function runInvalidSales(baseUrl) {
    const { scoopsPerSale } = await getSettings();
    const [first, second] = await collections.flavors().find({ isActive: true }).limit(2).toArray();
    if (!first)
        throw new HttpError(400, "There are no active flavors to test with");
    const otherId = (second ?? first)._id.toHexString();
    const firstId = first._id.toHexString();
    const attempts = [
        {
            label: `${scoopsPerSale - 1} scoops (one too few)`,
            payload: { soldBy: "Invalid sale demo", items: [{ flavorId: firstId, scoops: scoopsPerSale - 2 }, { flavorId: otherId, scoops: 1 }] },
        },
        {
            label: `${scoopsPerSale + 1} scoops (one too many)`,
            payload: { soldBy: "Invalid sale demo", items: [{ flavorId: firstId, scoops: scoopsPerSale - 1 }, { flavorId: otherId, scoops: 2 }] },
        },
    ];
    return Promise.all(attempts.map(async ({ label, payload }) => {
        const response = await fetch(`${baseUrl}/api/sales`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
        });
        return { label, payload, status: response.status, error: await errorMessage(response) };
    }));
}
