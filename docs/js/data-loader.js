// Fetches docs/data/all_items.json once and caches it in memory for the session.
const DataLoader = (() => {
  let itemsPromise = null;
  let setsPromise = null;

  function loadItems() {
    if (!itemsPromise) {
      itemsPromise = fetch("data/all_items.json")
        .then((r) => r.json())
        .then((d) => d.items || []);
    }
    return itemsPromise;
  }

  function loadSets() {
    if (!setsPromise) {
      setsPromise = fetch("data/sets.json").then((r) => r.json());
    }
    return setsPromise;
  }

  return { loadItems, loadSets };
})();
