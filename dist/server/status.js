// A flavor is "getting low" (orange) until it has twice its low threshold.
const ORANGE_MULTIPLIER = 2;
export function calculateStatus(stockScoops, lowThreshold) {
    if (stockScoops <= 0)
        return "sold-out";
    if (stockScoops <= lowThreshold)
        return "red";
    if (stockScoops <= lowThreshold * ORANGE_MULTIPLIER)
        return "orange";
    return "green";
}
