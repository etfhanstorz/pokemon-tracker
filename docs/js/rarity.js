(async function () {
  const tableRoot = document.getElementById("item-table-root");
  const searchInput = document.getElementById("search");
  const raritySelect = document.getElementById("rarity-select");
  const setFilter = document.getElementById("set-filter");
  const minPriceInput = document.getElementById("min-price");
  const maxPriceInput = document.getElementById("max-price");
  const clearBtn = document.getElementById("clear-filters");
  const statTotal = document.getElementById("stat-total");
  const statAvg = document.getElementById("stat-avg");
  const statCheapest = document.getElementById("stat-cheapest");
  const lastUpdatedEl = document.getElementById("last-updated");

  const columns = [
    {
      key: "name",
      label: "Card",
      sortable: true,
      render: (i) => `
        <div class="name-cell">
          ${i.image ? `<img class="thumb" src="${i.image}" loading="lazy" alt="">` : ""}
          <span>${i.name}</span>
        </div>`,
    },
    { key: "set", label: "Set", sortable: true, render: (i) => `<span class="set-tag">${i.set || ""}</span>` },
    { key: "number", label: "#", sortable: true, render: (i) => i.number || "—" },
    { key: "market", label: "Price", sortable: true, defaultDir: "asc", render: (i) => formatMoney(i.market) },
    { key: "avg90d", label: "90d Avg", sortable: true, render: (i) => formatMoney(i.avg90d) },
    { key: "dealPct", label: "vs Avg", sortable: true, defaultDir: "asc", render: (i) => dealBadge(i.dealPct) },
    { key: "buy", label: "", sortable: false, render: (i) => buyButton(i.url) },
  ];

  let allItems = [];
  let table = null;

  function currentRows() {
    const q = (searchInput.value || "").trim().toLowerCase();
    const rarity = raritySelect.value;
    const min = parseFloat(minPriceInput.value);
    const max = parseFloat(maxPriceInput.value);
    return allItems.filter((i) => {
      if (i.type !== "card") return false;
      if (rarity !== "all" && i.rarity !== rarity) return false;
      if (setFilter.value !== "all" && String(i.setId) !== setFilter.value) return false;
      if (!isNaN(min) && (i.market === null || i.market < min)) return false;
      if (!isNaN(max) && (i.market === null || i.market > max)) return false;
      if (q && !(i.name.toLowerCase().includes(q) || (i.set || "").toLowerCase().includes(q))) return false;
      return true;
    });
  }

  function updateStats() {
    const rows = currentRows();
    statTotal.textContent = rows.length.toLocaleString();
    if (rows.length) {
      const avg = rows.reduce((s, r) => s + (r.market || 0), 0) / rows.length;
      statAvg.textContent = "$" + avg.toFixed(2);
      const cheapest = rows.slice().sort((a, b) => (a.market || 0) - (b.market || 0))[0];
      statCheapest.textContent = cheapest ? `${cheapest.name} — ${formatMoney(cheapest.market)}` : "—";
    } else {
      statAvg.textContent = "—";
      statCheapest.textContent = "—";
    }
  }

  function refresh() {
    updateStats();
    if (table) table.rerender();
  }

  [raritySelect, setFilter, searchInput, minPriceInput, maxPriceInput].forEach((el) => {
    el.addEventListener("input", refresh);
    el.addEventListener("change", refresh);
  });

  clearBtn.addEventListener("click", () => {
    searchInput.value = "";
    raritySelect.value = "all";
    setFilter.value = "all";
    minPriceInput.value = "";
    maxPriceInput.value = "";
    refresh();
  });

  const [items, sets] = await Promise.all([DataLoader.loadItems(), DataLoader.loadSets()]);
  allItems = items;
  lastUpdatedEl.textContent = sets.lastUpdated ? `Data as of ${sets.lastUpdated}` : "";

  const rarities = Array.from(
    new Set(allItems.filter((i) => i.type === "card" && i.rarity).map((i) => i.rarity))
  ).sort();
  raritySelect.innerHTML =
    `<option value="all">All rarities</option>` +
    rarities.map((r) => `<option value="${r}">${r}</option>`).join("");

  setFilter.innerHTML =
    `<option value="all">All sets</option>` +
    (sets.sets || []).map((s) => `<option value="${s.groupId}">${s.name}</option>`).join("");

  table = createItemTable(tableRoot, {
    columns,
    getRows: currentRows,
    defaultSortKey: "market",
    defaultSortDir: "asc",
  });
  updateStats();
})();
