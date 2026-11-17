import { formatMoney, getSettings } from "./state.js";
import { byId, escapeHtml, plural } from "./ui.js";
// The serving only lives in the browser until it is sold. Stock in the
// database is not touched while the seller is still building it.
let scoops = [];
function servingSize() {
    return getSettings().scoopsPerSale;
}
export function isServingFull() {
    return scoops.length >= servingSize();
}
export function isServingEmpty() {
    return scoops.length === 0;
}
export function scoopsOf(flavorId) {
    return scoops.filter((scoop) => scoop.flavorId === flavorId).length;
}
export function addScoop(flavor) {
    if (isServingFull() || scoopsOf(flavor._id) >= flavor.stockScoops)
        return;
    scoops.push({ flavorId: flavor._id, name: flavor.name, colorHex: flavor.colorHex });
}
export function removeScoopAt(index) {
    scoops.splice(index, 1);
}
export function removeExtraScoops(flavorId, keep) {
    let seen = 0;
    const before = scoops.length;
    scoops = scoops.filter((scoop) => scoop.flavorId !== flavorId || ++seen <= keep);
    return before - scoops.length;
}
export function servingFlavorIds() {
    return [...new Set(scoops.map((scoop) => scoop.flavorId))];
}
export function clearServing() {
    scoops = [];
}
function groupedScoops() {
    return servingFlavorIds().map((flavorId) => ({
        flavorId,
        name: scoops.find((scoop) => scoop.flavorId === flavorId)?.name ?? "",
        count: scoopsOf(flavorId),
    }));
}
export function servingItems() {
    return groupedScoops().map(({ flavorId, count }) => ({ flavorId, scoops: count }));
}
function slotHtml(scoop, index) {
    if (!scoop)
        return `<span class="slot" aria-hidden="true"></span>`;
    const name = escapeHtml(scoop.name);
    return `<button type="button" class="slot filled" style="--swatch: ${escapeHtml(scoop.colorHex)}"
    data-index="${index}" title="${name}, click to remove" aria-label="Remove one ${name} scoop"></button>`;
}
function sellButtonLabel(missing, selling) {
    if (selling)
        return "Selling...";
    if (missing > 0)
        return `Add ${plural(missing, "more scoop")}`;
    return `Sell serving (${formatMoney(getSettings().pricePerSale)})`;
}
export function renderServing(selling) {
    const size = servingSize();
    if (scoops.length > size)
        scoops = scoops.slice(0, size);
    const missing = size - scoops.length;
    const mix = groupedScoops().map(({ name, count }) => `${count} × ${escapeHtml(name)}`);
    byId("serving-slots", HTMLElement).innerHTML = Array.from({ length: size }, (_, index) => slotHtml(scoops[index], index)).join("");
    byId("serving-count", HTMLElement).textContent = `${scoops.length} of ${size} scoops`;
    byId("serving-mix", HTMLElement).innerHTML = mix.length > 0 ? mix.join(", ") : "Add scoops from the flavor cards.";
    byId("serving-price", HTMLElement).textContent = formatMoney(getSettings().pricePerSale);
    const sellButton = byId("serving-sell", HTMLButtonElement);
    sellButton.disabled = missing !== 0 || selling;
    sellButton.textContent = sellButtonLabel(missing, selling);
    byId("serving-clear", HTMLButtonElement).disabled = scoops.length === 0 || selling;
}
