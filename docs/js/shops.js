(function () {
  const useLocationBtn = document.getElementById("use-location");
  const manualInput = document.getElementById("manual-location");
  const searchManualBtn = document.getElementById("search-manual");
  const radiusSelect = document.getElementById("radius-select");
  const statusEl = document.getElementById("shop-status");
  const resultsEl = document.getElementById("shop-results");

  // Overpass API is a shared public service with per-server rate limits;
  // fall back to mirrors if the primary is busy/rate-limited.
  const OVERPASS_URLS = [
    "https://overpass-api.de/api/interpreter",
    "https://overpass.kumi.systems/api/interpreter",
    "https://overpass.osm.ch/api/interpreter",
  ];
  const NOMINATIM_URL = "https://nominatim.openstreetmap.org/search";

  function setStatus(text, show = true) {
    statusEl.style.display = show ? "" : "none";
    statusEl.textContent = text;
  }

  function haversineMiles(lat1, lon1, lat2, lon2) {
    const R = 3958.8; // Earth radius in miles
    const toRad = (d) => (d * Math.PI) / 180;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a =
      Math.sin(dLat / 2) ** 2 +
      Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function buildOverpassQuery(lat, lon, radiusMeters) {
    // Match on the indexed "shop" tag only - a free-text name~"card|game|..."
    // regex sounds more thorough but forces Overpass to scan every named
    // node in the radius, which reliably times out for city-sized areas.
    const shopTypes = "games|collector|hobby|anime|comic|toys";
    return `[out:json][timeout:24];
(
  node["shop"~"^(${shopTypes})$"](around:${radiusMeters},${lat},${lon});
  way["shop"~"^(${shopTypes})$"](around:${radiusMeters},${lat},${lon});
);
out center tags;`;
  }

  function formatAddress(tags) {
    const parts = [];
    const line1 = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
    if (line1) parts.push(line1);
    const line2 = [tags["addr:city"], tags["addr:state"], tags["addr:postcode"]].filter(Boolean).join(", ");
    if (line2) parts.push(line2);
    return parts.join(", ") || "Address not listed";
  }

  function renderResults(elements, userLat, userLon) {
    const seen = new Set();
    const shops = [];
    for (const el of elements) {
      if (!el.tags || !el.tags.name) continue;
      if (seen.has(el.tags.name + (el.tags["addr:street"] || ""))) continue;
      seen.add(el.tags.name + (el.tags["addr:street"] || ""));

      const lat = el.lat !== undefined ? el.lat : el.center && el.center.lat;
      const lon = el.lon !== undefined ? el.lon : el.center && el.center.lon;
      if (lat === undefined || lon === undefined) continue;

      shops.push({
        name: el.tags.name,
        address: formatAddress(el.tags),
        phone: el.tags.phone || el.tags["contact:phone"],
        website: el.tags.website || el.tags["contact:website"],
        shopType: el.tags.shop,
        lat,
        lon,
        distance: haversineMiles(userLat, userLon, lat, lon),
      });
    }

    shops.sort((a, b) => a.distance - b.distance);

    if (shops.length === 0) {
      setStatus("No game/hobby/collectible shops found in this area on OpenStreetMap. Try a larger radius.");
      resultsEl.innerHTML = "";
      return;
    }

    setStatus("", false);
    resultsEl.innerHTML = `
      <table class="item-table">
        <thead><tr><th>Shop</th><th>Type</th><th>Distance</th><th>Address</th><th>Contact</th><th></th></tr></thead>
        <tbody>
          ${shops
            .map(
              (s) => `
            <tr>
              <td>${s.name}</td>
              <td><span class="pill card">${s.shopType || "shop"}</span></td>
              <td>${s.distance.toFixed(1)} mi</td>
              <td class="set-tag">${s.address}</td>
              <td>
                ${s.phone ? `<a href="tel:${s.phone}">${s.phone}</a>` : ""}
                ${s.website ? `<br><a href="${s.website}" target="_blank" rel="noopener">Website</a>` : ""}
              </td>
              <td><a class="buy-btn" href="https://www.google.com/maps/search/?api=1&query=${s.lat},${s.lon}" target="_blank" rel="noopener">Directions →</a></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>`;
  }

  function queryOverpass(query, urlIndex = 0) {
    if (urlIndex >= OVERPASS_URLS.length) {
      return Promise.reject(new Error("All Overpass mirrors failed"));
    }
    return fetch(OVERPASS_URLS[urlIndex], { method: "POST", body: "data=" + encodeURIComponent(query) })
      .then((r) => {
        if (!r.ok) throw new Error(`Overpass API returned ${r.status}`);
        return r.json();
      })
      .then((data) => {
        // Overpass sometimes returns HTTP 200 with an empty result set and a
        // "remark" explaining it timed out server-side - that's a failure,
        // not "no shops found", so route it through the same retry path.
        if (data.remark) throw new Error(`Overpass remark: ${data.remark}`);
        return data;
      })
      .catch((err) => {
        console.warn(`Overpass mirror ${OVERPASS_URLS[urlIndex]} failed:`, err);
        return queryOverpass(query, urlIndex + 1);
      });
  }

  function search(lat, lon) {
    setStatus("Searching OpenStreetMap for nearby shops…");
    resultsEl.innerHTML = "";
    const radius = Number(radiusSelect.value);
    const query = buildOverpassQuery(lat, lon, radius);

    queryOverpass(query)
      .then((data) => renderResults(data.elements || [], lat, lon))
      .catch((err) => {
        setStatus(
          "Couldn't reach the shop search service right now (it's a shared public server and sometimes rate-limits or times out) - try again in a moment."
        );
        console.error(err);
      });
  }

  useLocationBtn.addEventListener("click", () => {
    if (!navigator.geolocation) {
      setStatus("Your browser doesn't support geolocation. Try typing a city or ZIP instead.");
      return;
    }
    setStatus("Getting your location…");
    navigator.geolocation.getCurrentPosition(
      (pos) => search(pos.coords.latitude, pos.coords.longitude),
      () => setStatus("Location access denied or unavailable. Try typing a city or ZIP instead.")
    );
  });

  function searchManual() {
    const query = manualInput.value.trim();
    if (!query) return;
    setStatus(`Looking up "${query}"…`);
    const url = `${NOMINATIM_URL}?format=json&limit=1&q=${encodeURIComponent(query)}`;
    fetch(url)
      .then((r) => r.json())
      .then((results) => {
        if (!results.length) {
          setStatus(`Couldn't find "${query}" - try being more specific (e.g. "Springfield, IL").`);
          return;
        }
        search(parseFloat(results[0].lat), parseFloat(results[0].lon));
      })
      .catch(() => setStatus("Location lookup failed - try again in a moment."));
  }

  searchManualBtn.addEventListener("click", searchManual);
  manualInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter") searchManual();
  });
})();
