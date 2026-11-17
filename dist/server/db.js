import { MongoClient } from "mongodb";
const DEFAULT_URI = "mongodb://127.0.0.1:27017";
const DEFAULT_DB_NAME = "scoop_tracker";
let client = null;
let database = null;
export async function connectToDatabase() {
    if (database)
        return database;
    const uri = process.env.MONGODB_URI ?? DEFAULT_URI;
    // ignoreUndefined skips optional fields that are not set, instead of saving
    // them as null, so documents only contain the fields they really have.
    client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000, ignoreUndefined: true });
    await client.connect();
    database = client.db(process.env.DB_NAME ?? DEFAULT_DB_NAME);
    return database;
}
export async function closeDatabase() {
    await client?.close();
    client = null;
    database = null;
}
function getDb() {
    if (!database)
        throw new Error("Database is not connected yet");
    return database;
}
export const collections = {
    settings: () => getDb().collection("settings"),
    flavors: () => getDb().collection("flavors"),
    sales: () => getDb().collection("sales"),
    requests: () => getDb().collection("restock_requests"),
    stockLogs: () => getDb().collection("stock_logs"),
    counters: () => getDb().collection("counters"),
};
export async function ensureIndexes() {
    await Promise.all([
        // Flavor names must be unique so the seller never sees two "Mango" cards.
        collections.flavors().createIndex({ name: 1 }, { unique: true }),
        // Supports the "only low flavors" filter and range queries on stock.
        collections.flavors().createIndex({ stockScoops: 1 }),
        // The manager inbox always filters by status and sorts by newest first,
        // so one compound index serves both the match and the sort.
        collections.requests().createIndex({ status: 1, requestedAt: -1 }),
        // Only one pending request per flavor. A partial unique index lets the
        // database enforce this even when two sellers click at the same moment.
        collections.requests().createIndex({ flavorId: 1 }, { unique: true, partialFilterExpression: { status: "pending" }, name: "one_pending_per_flavor" }),
        // Daily totals and reports filter sales by date.
        collections.sales().createIndex({ soldAt: 1 }),
        // items is an array, so this becomes a multikey index: one entry per
        // flavor inside each serving, which makes "sales containing Mango" fast.
        collections.sales().createIndex({ "items.flavorId": 1 }),
        // The audit trail is read per flavor, newest first.
        collections.stockLogs().createIndex({ flavorId: 1, at: -1 }),
    ]);
}
