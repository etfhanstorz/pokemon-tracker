// Generic sortable + paginated item table renderer, shared by index.html and rarity.html.
function formatMoney(v) {
  if (v === null || v === undefined) return "—";
  return "$" + v.toFixed(2);
}

function syncHeaderHeight() {
  const header = document.querySelector("header.site-header");
  if (!header) return;
  const set = () => document.documentElement.style.setProperty("--header-height", `${header.offsetHeight}px`);
  set();
  if (window.ResizeObserver) {
    new ResizeObserver(set).observe(header);
  } else {
    window.addEventListener("resize", set);
  }
}
syncHeaderHeight();

function buyButton(url) {
  if (!url) return "";
  return `<a class="buy-btn" href="${url}" target="_blank" rel="noopener">Buy →</a>`;
}

function dealBadge(pct) {
  if (pct === null || pct === undefined) return '<span class="deal-neutral">—</span>';
  const sign = pct > 0 ? "+" : "";
  const cls = pct <= -8 ? "deal-good" : pct >= 8 ? "deal-bad" : "deal-neutral";
  return `<span class="${cls}">${sign}${pct.toFixed(1)}%</span>`;
}

function createItemTable(root, { columns, getRows, pageSize = 50, defaultSortKey, defaultSortDir = "asc" }) {
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
    setSort: (key, dir) => { sortKey = key; sortDir = dir; page = 0; render(); },
  };
}
