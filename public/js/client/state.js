let settings = null;
let userName = "";
export function setSettings(next) {
    settings = next;
}
export function getSettings() {
    if (!settings)
        throw new Error("Settings have not been loaded yet");
    return settings;
}
export function scoopValue() {
    const { pricePerSale, scoopsPerSale } = getSettings();
    return pricePerSale / scoopsPerSale;
}
// Shillings have no cents, so decimals are only shown when an amount has them.
export function formatMoney(amount) {
    return `${getSettings().currency} ${amount.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;
}
// Short form such as "10K" for chart labels, where the full amount does not fit.
export function formatCompactMoney(amount) {
    return new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(amount);
}
export function setUserName(name) {
    userName = name.trim();
}
export function getUserName() {
    return userName || "Seller";
}
