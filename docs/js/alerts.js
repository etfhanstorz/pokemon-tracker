(async function () {
  const listRoot = document.getElementById("pinned-list");
  const lastUpdatedEl = document.getElementById("last-updated");
  const TARGETS_KEY = "pokemonWatchdogTargets";

  function getTargets() {
    try {
      return JSON.parse(localStorage.getItem(TARGETS_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function setTarget(id, value) {
    const targets = getTargets();
    if (value === "" || value === null || isNaN(value)) {
      delete targets[id];
    } else {
      targets[id] = value;
    }
    localStorage.setItem(TARGETS_KEY, JSON.stringify(targets));
  }

  // Derive the GitHub owner/repo from the Pages URL (https://OWNER.github.io/REPO/...)
  // so this keeps working if the repo is renamed or forked.
  function githubEditUrl() {
    const host = window.location.hostname; // e.g. etfhanstorz.github.io
    const owner = host.split(".")[0];
    const repo = window.location.pathname.split("/").filter(Boolean)[0] || "";
    return `https://github.com/${owner}/${repo}/edit/main/docs/data/watchlist.json`;
  }

  function buildWatchlistJson(items, targets) {
    return JSON.stringify(
      {
        items: items.map((i) => ({
          id: i.id,
          name: i.name,
          set: i.set,
          targetPrice: targets[i.id] !== undefined ? targets[i.id] : null,
        })),
      },
      null,
      2
    );
  }

  function render(allItems) {
    const pins = PinStore.getPins();
    const targets = getTargets();
    const pinnedItems = pins
      .map((id) => allItems.find((i) => i.id === id))
      .filter(Boolean);

    if (pinnedItems.length === 0) {
      listRoot.innerHTML = `<div class="empty-state">No pinned cards yet. Go pin some from the <a href="index.html">Prices &amp; Deals</a> page.</div>`;
      return;
    }

    const rows = pinnedItems
      .map((i) => {
        const target = targets[i.id];
        return `
        <tr data-id="${i.id}">
          <td>
            <div class="name-cell">
              ${i.image ? `<img class="thumb" src="${i.image}" loading="lazy" alt="">` : ""}
              <span>${i.name}</span>
            </div>
          </td>
          <td><span class="set-tag">${i.set || ""}</span></td>
          <td>${formatMoney(i.market)}</td>
          <td>${formatMoney(i.avg90d)}</td>
          <td>${dealBadge(i.dealPct)}</td>
          <td><input type="number" class="target-input" min="0" step="0.5" placeholder="Auto (-15%)" value="${target !== undefined ? target : ""}" data-id="${i.id}"></td>
          <td><button class="pin-btn pinned" data-pin-id="${i.id}" title="Unpin">★</button></td>
        </tr>`;
      })
      .join("");

    listRoot.innerHTML = `
      <div class="toolbar">
        <button id="copy-watchlist" type="button">Copy watchlist.json</button>
        <a id="github-edit-link" class="buy-btn" href="${githubEditUrl()}" target="_blank" rel="noopener">Edit watchlist.json on GitHub →</a>
        <span id="copy-status" class="set-tag"></span>
      </div>
      <table class="item-table">
        <thead>
          <tr>
            <th>Card</th><th>Set</th><th>Price</th><th>90d Avg</th><th>vs Avg</th><th>Target price</th><th></th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>`;

    listRoot.querySelectorAll(".target-input").forEach((input) => {
      input.addEventListener("change", () => {
        setTarget(Number(input.dataset.id), parseFloat(input.value));
      });
    });

    listRoot.querySelectorAll(".pin-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        PinStore.toggle(Number(btn.dataset.pinId));
        render(allItems);
      });
    });

    document.getElementById("copy-watchlist").addEventListener("click", () => {
      const json = buildWatchlistJson(pinnedItems, getTargets());
      const status = document.getElementById("copy-status");

      const fallbackCopy = () => {
        const textarea = document.createElement("textarea");
        textarea.value = json;
        textarea.style.position = "fixed";
        textarea.style.opacity = "0";
        document.body.appendChild(textarea);
        textarea.select();
        try {
          document.execCommand("copy");
          status.textContent = "Copied!";
        } catch {
          status.textContent = "Couldn't auto-copy - select the text below and copy manually.";
          const pre = document.createElement("pre");
          pre.textContent = json;
          pre.style.userSelect = "all";
          listRoot.appendChild(pre);
        }
        document.body.removeChild(textarea);
        setTimeout(() => (status.textContent = ""), 3000);
      };

      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(json).then(
          () => {
            status.textContent = "Copied!";
            setTimeout(() => (status.textContent = ""), 2000);
          },
          fallbackCopy
        );
      } else {
        fallbackCopy();
      }
    });
  }

  const [items, sets] = await Promise.all([DataLoader.loadItems(), DataLoader.loadSets()]);
  lastUpdatedEl.textContent = sets.lastUpdated ? `Data as of ${sets.lastUpdated}` : "";
  render(items);
})();
