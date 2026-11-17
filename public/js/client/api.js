export class ApiRequestError extends Error {
    status;
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}
function isApiError(value) {
    return typeof value === "object" && value !== null && "error" in value && typeof value.error === "string";
}
async function request(method, path, body) {
    const response = await fetch(`/api${path}`, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data = await response.json().catch(() => null);
    if (!response.ok) {
        throw new ApiRequestError(response.status, isApiError(data) ? data.error : `Request failed (${response.status})`);
    }
    return data;
}
export const fetchSettings = () => request("GET", "/settings");
export const saveSettings = (settings) => request("PUT", "/settings", settings);
export function fetchFlavors(filters = {}) {
    const params = new URLSearchParams();
    if (filters.q)
        params.set("q", filters.q);
    if (filters.excludeAllergen)
        params.set("excludeAllergen", filters.excludeAllergen);
    if (filters.dietary)
        params.set("dietary", filters.dietary);
    if (filters.lowOnly)
        params.set("lowOnly", "true");
    if (filters.includeInactive)
        params.set("includeInactive", "true");
    const query = params.toString();
    return request("GET", `/flavors${query ? `?${query}` : ""}`);
}
export const createFlavor = (input) => request("POST", "/flavors", input);
export const updateFlavor = (id, input) => request("PUT", `/flavors/${id}`, input);
export const deactivateFlavor = (id) => request("PATCH", `/flavors/${id}/deactivate`);
export const fillFlavor = (id, by) => request("POST", `/flavors/${id}/fill`, { by });
export const adjustFlavor = (id, stockScoops, by) => request("POST", `/flavors/${id}/adjust`, { stockScoops, by });
export const sellServing = (sale) => request("POST", "/sales", sale);
export const fetchToday = () => request("GET", "/sales/today");
export const requestRefill = (flavorId, requestedBy, note) => request("POST", "/requests", { flavorId, requestedBy, note });
export const fetchRequests = (statuses) => request("GET", `/requests?status=${statuses.join(",")}`);
export const fulfilRequest = (id, handledBy) => request("PATCH", `/requests/${id}/fulfil`, { handledBy });
export const rejectRequest = (id, handledBy) => request("PATCH", `/requests/${id}/reject`, { handledBy });
export function fetchReport(name) {
    return request("GET", `/reports/${name}`);
}
export const explainQuery = (query) => request("GET", `/demo/explain?query=${query}`);
export const startRush = () => request("POST", "/demo/rush");
export const tryInvalidSales = () => request("POST", "/demo/invalid-sale");
export const resetDemo = () => request("POST", "/demo/reset");
