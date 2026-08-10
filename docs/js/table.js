// Generic sortable + paginated item table renderer, shared by index.html and rarity.html.
function formatMoney(v) {
  if (v === null || v === undefined) return "—";
  return "$" + v.toFixed(2);
}

function buyButton(url) {
  if (!url) return "";
  return `<a class="buy-btn" href="${url}" target="_blank" rel="noopener">Buy →</a>`;
}

function pinButton(id) {
  const pinned = PinStore.isPinned(id);
  return `<button class="pin-btn ${pinned ? "pinned" : ""}" data-pin-id="${id}" title="${pinned ? "Unpin" : "Pin for price alerts"}">${pinned ? "★" : "☆"}</button>`;
}

// Deals this extreme are more likely a data glitch, a damaged/miscategorized
// listing, or - on other marketplaces - a scam, than a genuine steal. Flag
// them instead of just celebrating a big green number.
const DEAL_SANITY_THRESHOLD = -50;

function dealBadge(pct) {
  if (pct === null || pct === undefined) return '<span class="deal-neutral">—</span>';
  const sign = pct > 0 ? "+" : "";
  const cls = pct <= -8 ? "deal-good" : pct >= 8 ? "deal-bad" : "deal-neutral";
  const warning =
    pct <= DEAL_SANITY_THRESHOLD
      ? ` <span class="sanity-flag" title="This price is unusually far below its recent average. Double-check the listing (condition, seller, shipping) before buying - extreme discounts are sometimes pricing errors or scams.">⚠️</span>`
      : "";
  return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>${warning}`;
}

function createItemTable(root, { columns, getRows, pageSize = 50, defaultSortKey, defaultSortDir = "asc", onPinChange }) {
  let sortKey = defaultSortKey;
  let sortDir = defaultSortDir;
  let page = 0;

  const table = document.createElement("table");
  table.className = "item-table";
  const thead = document.createElement("thead");
  const headRow = document.createElement("tr");
  columns.forEach((col) => {
    const th = document.createElement("th");
    th.textContent = col.label;
    th.dataset.key = col.key;
    if (col.key === sortKey) th.classList.add("sorted", sortDir);
    th.addEventListener("click", () => {
      if (!col.sortable) return;
      if (sortKey === col.key) {
        sortDir = sortDir === "asc" ? "desc" : "asc";
      } else {
        sortKey = col.key;
        sortDir = col.defaultDir || "asc";
      }
      page = 0;
      render();
    });
    headRow.appendChild(th);
  });
  thead.appendChild(headRow);
  const tbody = document.createElement("tbody");
  table.appendChild(thead);
  table.appendChild(tbody);

  const pager = document.createElement("div");
  pager.className = "pagination";

  root.innerHTML = "";
  root.appendChild(table);
  root.appendChild(pager);

  tbody.addEventListener("click", (e) => {
    const btn = e.target.closest(".pin-btn");
    if (!btn) return;
    const id = Number(btn.dataset.pinId);
    const nowPinned = PinStore.toggle(id);
    btn.classList.toggle("pinned", nowPinned);
    btn.textContent = nowPinned ? "★" : "☆";
    btn.title = nowPinned ? "Unpin" : "Pin for price alerts";
    if (onPinChange) onPinChange();
  });

  function render() {
    columns.forEach((col) => {
      const th = headRow.querySelector(`th[data-key="${col.key}"]`);
      th.classList.toggle("sorted", col.key === sortKey);
      th.classList.toggle("asc", col.key === sortKey && sortDir === "asc");
    });

    let rows = getRows();
    if (sortKey) {
      const dir = sortDir === "asc" ? 1 : -1;
      rows = rows.slice().sort((a, b) => {
        let av = a[sortKey];
        let bv = b[sortKey];
        if (av === null || av === undefined) av = dir === 1 ? Infinity : -Infinity;
        if (bv === null || bv === undefined) bv = dir === 1 ? Infinity : -Infinity;
        if (typeof av === "string") return av.localeCompare(bv) * dir;
        return (av - bv) * dir;
      });
    }

    const totalPages = Math.max(1, Math.ceil(rows.length / pageSize));
    page = Math.min(page, totalPages - 1);
    const pageRows = rows.slice(page * pageSize, (page + 1) * pageSize);

    tbody.innerHTML = "";
    if (pageRows.length === 0) {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = columns.length;
      td.className = "empty-state";
      td.textContent = "No items match these filters.";
      tr.appendChild(td);
      tbody.appendChild(tr);
    } else {
      pageRows.forEach((item) => {
        const tr = document.createElement("tr");
        tr.innerHTML = columns.map((col) => `<td>${col.render(item)}</td>`).join("");
        tbody.appendChild(tr);
      });
    }

    pager.innerHTML = "";
    const prevBtn = document.createElement("button");
    prevBtn.textContent = "← Prev";
    prevBtn.disabled = page === 0;
    prevBtn.onclick = () => { page--; render(); };
    const info = document.createElement("span");
    info.className = "page-info";
    info.textContent = `Page ${page + 1} of ${totalPages} (${rows.length} items)`;
    const nextBtn = document.createElement("button");
    nextBtn.textContent = "Next →";
    nextBtn.disabled = page >= totalPages - 1;
    nextBtn.onclick = () => { page++; render(); };
    pager.appendChild(prevBtn);
    pager.appendChild(info);
    pager.appendChild(nextBtn);
  }

  render();
  return {
    rerender: () => { page = 0; render(); },
    refresh: () => render(),
    setSort: (key, dir) => { sortKey = key; sortDir = dir; page = 0; render(); },
  };
}
