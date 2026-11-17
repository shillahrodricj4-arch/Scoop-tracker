import { collections } from "../db.js";
import { HttpError, isDuplicateKeyError } from "../errors.js";
import { parseFlavorInput, parseStartingStock } from "../flavorValidation.js";
import { calculateStatus } from "../status.js";
import { findFlavorOrThrow } from "./stockService.js";
export function toFlavorResponse(flavor, refillPending = false) {
    return { ...flavor, status: calculateStatus(flavor.stockScoops, flavor.lowThreshold), refillPending };
}
function queryText(value) {
    return typeof value === "string" && value.trim() !== "" ? value.trim() : undefined;
}
function escapeRegex(text) {
    return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
export function buildFlavorFilter(query) {
    const filter = {};
    if (queryText(query.includeInactive) !== "true")
        filter.isActive = true;
    const search = queryText(query.q);
    if (search)
        filter.name = { $regex: escapeRegex(search), $options: "i" };
    const allergen = queryText(query.excludeAllergen);
    if (allergen)
        filter.allergens = { $ne: allergen };
    const dietary = queryText(query.dietary);
    if (dietary)
        filter.dietary = dietary;
    // $expr compares two fields of the same document, because every flavor has
    // its own low threshold.
    if (queryText(query.lowOnly) === "true")
        filter.$expr = { $lte: ["$stockScoops", "$lowThreshold"] };
    return filter;
}
export async function listFlavors(query) {
    const pipeline = [
        { $match: buildFlavorFilter(query) },
        {
            $lookup: {
                from: "restock_requests",
                localField: "_id",
                foreignField: "flavorId",
                pipeline: [{ $match: { status: "pending" } }, { $project: { _id: 1 } }],
                as: "pendingRequests",
            },
        },
        { $addFields: { refillPending: { $gt: [{ $size: "$pendingRequests" }, 0] } } },
        { $project: { pendingRequests: 0 } },
        { $sort: { name: 1 } },
    ];
    const flavors = await collections.flavors().aggregate(pipeline).toArray();
    return flavors.map((flavor) => toFlavorResponse(flavor, flavor.refillPending));
}
async function saveWithUniqueName(name, save) {
    try {
        return await save();
    }
    catch (error) {
        if (isDuplicateKeyError(error))
            throw new HttpError(409, `A flavor called ${name} already exists`);
        throw error;
    }
}
export async function createFlavor(input) {
    const { changes } = parseFlavorInput(input);
    const now = new Date();
    const flavor = {
        ...changes,
        stockScoops: parseStartingStock(input, changes.capacityScoops),
        createdAt: now,
        updatedAt: now,
    };
    const result = await saveWithUniqueName(flavor.name, () => collections.flavors().insertOne(flavor));
    return toFlavorResponse({ ...flavor, _id: result.insertedId });
}
function unsetDocument(fields) {
    return Object.fromEntries(fields.map((field) => [field, ""]));
}
export async function updateFlavor(flavorId, input) {
    const { changes, emptyFields } = parseFlavorInput(input);
    const current = await findFlavorOrThrow(flavorId);
    if (changes.capacityScoops < current.stockScoops) {
        throw new HttpError(400, `Capacity cannot be below the current stock of ${current.stockScoops} scoops`);
    }
    const updated = await saveWithUniqueName(changes.name, () => collections
        .flavors()
        .findOneAndUpdate({ _id: flavorId }, { $set: { ...changes, updatedAt: new Date() }, $unset: unsetDocument(emptyFields) }, { returnDocument: "after" }));
    if (!updated)
        throw new HttpError(404, "Flavor not found");
    return toFlavorResponse(updated);
}
export async function deactivateFlavor(flavorId) {
    const updated = await collections
        .flavors()
        .findOneAndUpdate({ _id: flavorId }, { $set: { isActive: false, updatedAt: new Date() } }, { returnDocument: "after" });
    if (!updated)
        throw new HttpError(404, "Flavor not found");
    return toFlavorResponse(updated);
}
