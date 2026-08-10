(async function () {
  const tableRoot = document.getElementById("item-table-root");
  const searchInput = document.getElementById("search");
  const statTotal = document.getElementById("stat-total");
  const statAvg = document.getElementById("stat-avg");
  const statBestDeal = document.getElementById("stat-best-deal");
  const lastUpdatedEl = document.getElementById("last-updated");

  const tabs = document.querySelectorAll(".tabs button");
  let activeTab = "all"; // all | deals | card | sealed

  const columns = [
    {
      key: "name",
      label: "Item",
      sortable: true,
      render: (i) => `
        <div class="name-cell">
          ${i.image ? `<img class="thumb" src="${i.image}" loading="lazy" alt="">` : ""}
          <span>${i.name}</span>
        </div>`,
    },
    { key: "set", label: "Set", sortable: true, render: (i) => `<span class="set-tag">${i.set || ""}</span>` },
    { key: "type", label: "Type", sortable: true, render: (i) => `<span class="pill ${i.type}">${i.type}</span>` },
    { key: "rarity", label: "Rarity", sortable: true, render: (i) => i.rarity || "—" },
    { key: "market", label: "Price", sortable: true, defaultDir: "asc", render: (i) => formatMoney(i.market) },
    { key: "avg90d", label: "90d Avg", sortable: true, render: (i) => formatMoney(i.avg90d) },
    { key: "dealPct", label: "vs Avg", sortable: true, defaultDir: "asc", render: (i) => dealBadge(i.dealPct) },
    { key: "buy", label: "", sortable: false, render: (i) => buyButton(i.url) },
  ];

  let allItems = [];
  let table = null;

  function matchesTab(item) {
    if (activeTab === "all") return true;
    if (activeTab === "deals") {
      // Require a minimum price + history depth so near-worthless bulk items
      // (code cards, junk promos) with noisy/thin pricing don't dominate the
      // deals list with meaningless "-90%" swings on a few cents.
      return (
        item.dealPct !== null &&
        item.dealPct <= -8 &&
        item.historyPoints >= 3 &&
        item.market >= 1 &&
        item.avg90d >= 1
      );
    }
    return item.type === activeTab;
  }

  function currentRows() {
    const q = (searchInput.value || "").trim().toLowerCase();
    return allItems.filter((i) => {
      if (!matchesTab(i)) return false;
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
      const best = rows
        .filter((r) => r.dealPct !== null && r.historyPoints >= 3 && r.market >= 1)
        .sort((a, b) => a.dealPct - b.dealPct)[0];
      statBestDeal.textContent = best ? `${best.name} (${best.dealPct.toFixed(1)}%)` : "—";
    } else {
      statAvg.textContent = "—";
      statBestDeal.textContent = "—";
    }
  }

  function refresh() {
    updateStats();
    if (table) table.rerender();
  }

  tabs.forEach((btn) => {
    btn.addEventListener("click", () => {
      tabs.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      activeTab = btn.dataset.tab;
      if (table) table.setSort(activeTab === "deals" ? "dealPct" : "market", "asc");
      updateStats();
    });
  });

  searchInput.addEventListener("input", refresh);

  const [items, sets] = await Promise.all([DataLoader.loadItems(), DataLoader.loadSets()]);
  allItems = items;
  lastUpdatedEl.textContent = sets.lastUpdated ? `Data as of ${sets.lastUpdated}` : "";

  table = createItemTable(tableRoot, {
    columns,
    getRows: currentRows,
    defaultSortKey: "market",
    defaultSortDir: "asc",
  });
  updateStats();
})();
