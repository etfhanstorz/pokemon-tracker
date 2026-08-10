// Client-side "pin" list, stored per-browser in localStorage. Pinning here
// just marks items for quick access on this device (see alerts.html for
// turning pins into actual email alerts, since that requires a server-side
// check this static site can't do on its own).
const PinStore = (() => {
  const KEY = "pokemonWatchdogPins";

  function getPins() {
    try {
      return JSON.parse(localStorage.getItem(KEY) || "[]");
    } catch {
      return [];
    }
  }

  function isPinned(id) {
    return getPins().includes(id);
  }

  function toggle(id) {
    const pins = getPins();
    const idx = pins.indexOf(id);
    if (idx >= 0) {
      pins.splice(idx, 1);
    } else {
      pins.push(id);
    }
    localStorage.setItem(KEY, JSON.stringify(pins));
    return pins.includes(id);
  }

  return { getPins, isPinned, toggle };
})();
