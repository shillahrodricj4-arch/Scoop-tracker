import { fetchSettings } from "./api.js";
import { updatePendingBadge } from "./badge.js";
import { demoView } from "./demo.js";
import { managerView } from "./manager.js";
import { reportsView } from "./reports.js";
import { sellView } from "./sell.js";
import { setSettings, setUserName } from "./state.js";
import { byId, errorMessage, showToast } from "./ui.js";
const POLL_INTERVAL_MS = 3000;
const views = {
    sell: sellView,
    manager: managerView,
    reports: reportsView,
    demo: demoView,
};
let currentView = "sell";
function viewFromHash() {
    const name = location.hash.slice(1);
    return name in views ? name : "sell";
}
function setLive(online) {
    const live = byId("live", HTMLElement);
    live.classList.toggle("is-offline", !online);
    live.textContent = online ? "Live" : "Offline";
}
async function showView(name) {
    currentView = name;
    for (const viewName of Object.keys(views)) {
        byId(`view-${viewName}`, HTMLElement).hidden = viewName !== name;
    }
    document.querySelectorAll("[data-view]").forEach((link) => {
        if (link.dataset.view === name)
            link.setAttribute("aria-current", "page");
        else
            link.removeAttribute("aria-current");
    });
    try {
        await views[name].show();
    }
    catch (error) {
        showToast(errorMessage(error), "error");
    }
}
// setTimeout instead of setInterval, so a slow request never overlaps the next poll.
async function poll() {
    try {
        const [settings] = await Promise.all([fetchSettings(), updatePendingBadge()]);
        setSettings(settings);
        const view = views[currentView];
        await view.refresh?.();
        setLive(true);
    }
    catch {
        setLive(false);
    }
    finally {
        setTimeout(() => void poll(), POLL_INTERVAL_MS);
    }
}
async function waitForServer() {
    let warned = false;
    for (;;) {
        try {
            setSettings(await fetchSettings());
            setLive(true);
            return;
        }
        catch {
            setLive(false);
            if (!warned)
                showToast("Cannot reach the server. Retrying every few seconds.", "error");
            warned = true;
            await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS));
        }
    }
}
async function start() {
    const nameInput = byId("user-name", HTMLInputElement);
    setUserName(nameInput.value);
    nameInput.addEventListener("input", () => setUserName(nameInput.value));
    await waitForServer();
    window.addEventListener("hashchange", () => void showView(viewFromHash()));
    await Promise.all([showView(viewFromHash()), updatePendingBadge().catch(() => undefined)]);
    setTimeout(() => void poll(), POLL_INTERVAL_MS);
}
void start();
