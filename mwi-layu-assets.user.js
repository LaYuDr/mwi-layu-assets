// ==UserScript==
// @name         银河奶牛资产助手
// @namespace    https://www.milkywayidle.com/mwi-layu-assets
// @version      0.1.1
// @author       柆雨
// @description  按游戏原生市场价格统计库存、装备、挂单与房屋资产，保存历史、分项变化和本地备份
// @name:zh-CN   银河奶牛资产助手
// @homepageURL  https://github.com/LaYuDr/mwi-layu-assets
// @supportURL   https://github.com/LaYuDr/mwi-layu-assets/issues
// @updateURL    https://update.greasyfork.org/scripts/600009/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E8%B5%84%E4%BA%A7%E5%8A%A9%E6%89%8B.meta.js
// @downloadURL  https://update.greasyfork.org/scripts/600009/%E9%93%B6%E6%B2%B3%E5%A5%B6%E7%89%9B%E8%B5%84%E4%BA%A7%E5%8A%A9%E6%89%8B.user.js
// @match        https://www.milkywayidle.com/*
// @match        https://milkywayidle.com/*
// @match        https://www.milkywayidlecn.com/*
// @match        https://milkywayidlecn.com/*
// @match        https://test.milkywayidle.com/*
// @match        https://test.milkywayidlecn.com/*
// @run-at       document-start
// @grant        GM_addElement
// @license      MIT
// ==/UserScript==
// MWI_LAYU_ASSETS_RUNTIME
/*
# 第三方代码与许可证

资产模块、只读桥接与页签协调逻辑从柆雨强化助手迁移，MIT，Copyright (c) LaYuDr。未包含强化公式、交易或上报模块。

### lz-string

```text
MIT License

Copyright (c) 2013 pieroxy

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```


测试专用物品 sprite 来自游戏官方素材，仅在本地夹具使用，不打包发布。

*/
// ---- source/assets/core.js ----
(function initAssetCore(root) {
  "use strict";
  // This namespace and protocol deliberately survive an enhancement-plugin split.
  const api = root.MWILayuAssets = root.MWILayuAssets || {};
  const protocol = "mwi-assets", version = 2;
  const coin = "/items/coin", inventory = "/item_locations/inventory";
  const validItem = value => /^\/items\/[a-z0-9_]+$/.test(value || "");
  const amount = value => typeof value === "number" && Number.isFinite(value) && value >= 0 && value <= Number.MAX_SAFE_INTEGER ? value : null;
  const count = value => Number.isSafeInteger(value) && value >= 0 ? value : null;
  const text = value => typeof value === "string" ? value.slice(0, 200) : "";
  const key = row => `${row.itemHrid}:${row.enhancementLevel}`;
  function scope(value) {
    if (!/^api(?:-test)?\.milkywayidle(?:cn)?\.com$/.test(value?.server || "") || !Number.isSafeInteger(value.characterId) || value.characterId <= 0) throw new Error("资产角色标识无效");
    return { server: value.server, characterId: value.characterId };
  }
  function item(value) {
    if (!validItem(value?.itemHrid) || !Number.isSafeInteger(value.enhancementLevel ?? 0) || (value.enhancementLevel ?? 0) < 0 || (value.enhancementLevel ?? 0) > 20) throw new Error("资产物品数据无效");
    return { itemHrid: value.itemHrid, enhancementLevel: value.enhancementLevel ?? 0 };
  }
  function rows(value, transform, limit = 20000) {
    if (value == null) return null;
    if (!Array.isArray(value) || value.length > limit) throw new Error("资产明细格式或数量无效");
    return value.map(transform);
  }
  function normalize(value) {
    if (![1, 2].includes(value?.schema) || amount(value.observedAt) == null || value.observedAt > Date.now() + 60000 || !/^[a-f0-9]{64}$/.test(value.rulesId || "")) throw new Error("不支持的资产版本、配置或采集时间");
    const result = { schema: value.schema, ...scope(value), observedAt: value.observedAt, source: "game-state", rulesId: value.rulesId,
      items: rows(value.items, row => ({ ...item(row), stackKey: text(row.stackKey), id: count(row.id),
        itemLocationHrid: /^\/item_locations\/[a-z0-9_]+$/.test(row.itemLocationHrid || "") ? row.itemLocationHrid : null, count: count(row.count) })),
      rooms: rows(value.rooms, row => {
        if (!/^\/house_rooms\/[a-z0-9_]+$/.test(row?.houseRoomHrid || "")) throw new Error("房屋标识无效");
        return { houseRoomHrid: row.houseRoomHrid, level: count(row.level) != null && row.level <= 100 ? row.level : null };
      }, 500),
      listings: rows(value.listings, row => {
        if (!Number.isSafeInteger(row.id) || row.id <= 0) throw new Error("订单标识无效");
        return { ...item(row), id: row.id, isSell: typeof row.isSell === "boolean" ? row.isSell : null,
          status: text(row.status), price: amount(row.price), workingPrice: amount(row.workingPrice), coinsAvailable: amount(row.coinsAvailable),
          orderQuantity: count(row.orderQuantity), filledQuantity: count(row.filledQuantity), unclaimedItemCount: count(row.unclaimedItemCount),
          unclaimedCoinCount: amount(row.unclaimedCoinCount), createdTimestamp: text(row.createdTimestamp), updatedAt: text(row.updatedAt) };
      }), quotes: {} };
    for (const [id, quote] of Object.entries(value.quotes || {})) {
      if (!/^\/items\/[a-z0-9_]+:(?:[0-9]|1[0-9]|20)$/.test(id)) throw new Error("行情标识无效");
      result.quotes[id] = { ask: amount(quote.ask), bid: amount(quote.bid), at: amount(quote.at), source: text(quote.source), stale: quote.stale === true };
    }
    if (value.schema === 2) {
      const native = value.nativeMarket;
      result.nativeMarket = { version: Number.isSafeInteger(native?.version) && native.version > 0 ? native.version : null,
        observedAt: amount(native?.observedAt), source: text(native?.source) };
      for (const id of Object.keys(result.quotes)) result.quotes[id].native = amount(value.quotes[id].native);
    }
    if (Object.keys(result.quotes).length > 30000) throw new Error("行情数量超出限制");
    result.items?.sort((a, b) => `${a.stackKey}:${key(a)}:${a.itemLocationHrid}`.localeCompare(`${b.stackKey}:${key(b)}:${b.itemLocationHrid}`));
    result.rooms?.sort((a, b) => a.houseRoomHrid.localeCompare(b.houseRoomHrid));
    result.listings?.sort((a, b) => a.id - b.id);
    return result;
  }
  function rules(value) {
    const result = { schema: 1, gameVersion: text(String(value?.versionTimestamp ?? value?.gameVersion ?? "")), items: {}, rooms: {} };
    for (const [hrid, detail] of Object.entries(value?.itemDetailMap || value?.items || {})) {
      if (!validItem(hrid)) continue;
      result.items[hrid] = { name: text(detail.name), isTradable: typeof detail.isTradable === "boolean" ? detail.isTradable : null,
        categoryHrid: text(detail.categoryHrid), sellPrice: amount(detail.sellPrice), equipment: Boolean(detail.equipmentDetail || detail.equipment) };
    }
    for (const [hrid, detail] of Object.entries(value?.houseRoomDetailMap || value?.rooms || {})) {
      if (!/^\/house_rooms\/[a-z0-9_]+$/.test(hrid)) continue;
      const costs = {};
      for (const [level, inputs] of Object.entries(detail.upgradeCostsMap || {})) {
        if (!/^[1-9]\d?$|^100$/.test(level)) continue;
        costs[level] = rows(inputs, row => ({ ...item(row), count: count(row.count) }), 1000);
      }
      result.rooms[hrid] = { name: text(detail.name), upgradeCostsMap: costs };
    }
    if (Object.keys(result.items).length > 20000 || Object.keys(result.rooms).length > 500) throw new Error("配置数量超出限制");
    return result;
  }
  function canonical(value) {
    if (value === null || typeof value !== "object") return JSON.stringify(value);
    if (Array.isArray(value)) return `[${value.map(canonical).join(",")}]`;
    return `{${Object.keys(value).sort().map(k => `${JSON.stringify(k)}:${canonical(value[k])}`).join(",")}}`;
  }
  async function digest(value) {
    const bytes = await root.crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical(value)));
    return [...new Uint8Array(bytes)].map(b => b.toString(16).padStart(2, "0")).join("");
  }
  function houseMaterials(room, config) {
    const detail = config.rooms[room.houseRoomHrid], missingLevels = [], levels = [], merged = new Map();
    if (room.level == null) return { materials: [], levels, missingLevels: ["等级未知"] };
    for (let level = 1; level <= room.level; level += 1) {
      const inputs = detail?.upgradeCostsMap?.[level];
      if (!Array.isArray(inputs)) { missingLevels.push(level); continue; }
      levels.push({ level, materials: inputs });
      for (const row of inputs) {
        const id = key(row), previous = merged.get(id);
        merged.set(id, { ...row, count: row.count == null || previous?.count === null ? null : amount((previous?.count || 0) + row.count) });
      }
    }
    return { materials: [...merged.values()], levels, missingLevels };
  }
  function references(snapshot, config) {
    const found = new Map();
    for (const row of [...(snapshot.items || []), ...(snapshot.listings || []), ...(snapshot.rooms || []).flatMap(room => houseMaterials(room, config).materials)]) found.set(key(row), item(row));
    return [...found.values()];
  }
  function evaluate(snapshot, config, policy = snapshot.schema === 2 ? "native" : "ask") {
    if (!["native", "ask", "bid"].includes(policy)) throw new Error("估值口径无效");
    const lines = [], houses = [], issues = [], totals = { cash: 0, inventory: 0, equipped: 0, other: 0, market: 0, houses: 0 };
    const categoryComplete = Object.fromEntries(Object.keys(totals).map(id => [id, true]));
    const unknownItems = () => { for (const id of ["cash", "inventory", "equipped", "other"]) categoryComplete[id] = false; };
    function value(row, category, location, extra = {}) {
      if (row.count === 0) return null;
      const quote = snapshot.quotes[key(row)] || null, definition = config.items[row.itemHrid];
      const price = row.itemHrid === coin ? 1 : definition?.isTradable === false ? null : (policy !== "native" || snapshot.schema === 2 && snapshot.nativeMarket?.version > 0) && quote?.[policy] > 0 ? quote[policy] : null;
      const subtotal = row.count != null && price != null ? amount(row.count * price) : null;
      const line = { ...row, category, location, name: definition?.name || row.itemHrid, price, subtotal, quote,
        reason: row.count == null ? "数量未知" : definition?.isTradable === false && row.itemHrid !== coin ? "不可交易，未估值" : price == null ? "缺少报价" : subtotal == null ? "数值超出安全范围" : "", ...extra };
      lines.push(line);
      if (subtotal != null) totals[category] += subtotal;
      else categoryComplete[category] = false;
      return line;
    }
    if (!snapshot.items) { issues.push("尚未读取完整物品清单"); unknownItems(); }
    if (!snapshot.listings) { issues.push("尚未读取完整挂单清单"); categoryComplete.market = false; }
    if (!snapshot.rooms) { issues.push("尚未读取完整房屋清单"); categoryComplete.houses = false; }
    const seen = new Set();
    for (const row of snapshot.items || []) {
      const id = row.stackKey || `${key(row)}:${row.itemLocationHrid}`;
      if (seen.has(id)) { issues.push("物品清单包含重复记录，已跳过重复项"); unknownItems(); continue; } seen.add(id);
      const equipped = config.items[row.itemHrid]?.equipment;
      const category = row.itemHrid === coin ? "cash" : row.itemLocationHrid === inventory ? "inventory" : equipped ? "equipped" : "other";
      if (!row.itemLocationHrid) { issues.push("存在位置未知的物品"); unknownItems(); }
      value(row, category, row.itemLocationHrid || "位置未知");
    }
    const seenOrders = new Set();
    for (const row of snapshot.listings || []) {
      if (seenOrders.has(row.id)) { issues.push("存在重复订单，已跳过重复项"); categoryComplete.market = false; continue; } seenOrders.add(row.id);
      if (row.status === "/market_listing_status/active") {
        if (row.isSell === true) {
          const remaining = row.orderQuantity != null && row.filledQuantity != null && row.orderQuantity >= row.filledQuantity ? row.orderQuantity - row.filledQuantity : null;
          value({ ...item(row), count: remaining }, "market", "出售中", { listingId: row.id });
        } else if (row.isSell === false) value({ itemHrid: coin, enhancementLevel: 0, count: row.coinsAvailable }, "market", "买单冻结", { listingId: row.id });
        else { issues.push(`订单 ${row.id} 方向未知`); categoryComplete.market = false; }
      } else if (!["/market_listing_status/filled", "/market_listing_status/cancelled", "/market_listing_status/expired"].includes(row.status)) { issues.push(`订单 ${row.id} 状态未知`); categoryComplete.market = false; }
      value({ ...item(row), count: row.unclaimedItemCount }, "market", "待领取物品", { listingId: row.id });
      value({ itemHrid: coin, enhancementLevel: 0, count: row.unclaimedCoinCount }, "market", "待领取金币", { listingId: row.id });
    }
    const seenRooms = new Set();
    for (const room of snapshot.rooms || []) {
      if (seenRooms.has(room.houseRoomHrid)) { issues.push("存在重复房屋，已跳过重复项"); categoryComplete.houses = false; continue; } seenRooms.add(room.houseRoomHrid);
      if (room.level === 0) continue;
      const costs = houseMaterials(room, config), materials = [];
      for (const row of costs.materials.filter(row => row.count !== 0)) materials.push(value(row, "houses", room.houseRoomHrid, { houseRoomHrid: room.houseRoomHrid }));
      const missing = costs.missingLevels.length || materials.some(line => line?.subtotal == null);
      if (missing) categoryComplete.houses = false;
      const known = materials.reduce((sum, line) => sum + (line?.subtotal || 0), 0);
      houses.push({ ...room, ...costs, name: config.rooms[room.houseRoomHrid]?.name || room.houseRoomHrid, lines: materials.filter(Boolean), known, complete: !missing });
      if (costs.missingLevels.length) issues.push(`${room.houseRoomHrid} 缺少建造配置：${costs.missingLevels.join("、")}`);
    }
    const unpriced = lines.filter(line => line.subtotal == null).length;
    const total = Object.values(totals).reduce((a, b) => a + b, 0);
    if (amount(total) == null) issues.push("资产总额超出安全数值范围");
    for (const id of Object.keys(totals)) if (amount(totals[id]) == null) categoryComplete[id] = false;
    return { policy, lines, houses, totals, categoryComplete, knownTotal: amount(total), unpriced, issues: [...new Set(issues)],
      stale: lines.filter(line => line.itemHrid !== coin && line.quote?.stale).length, complete: !issues.length && !unpriced };
  }
  api.core = Object.freeze({ protocol, version, coin, inventory, amount, scope, key, normalize, rules, canonical, digest, houseMaterials, references, evaluate });
})(globalThis);


// ---- source/assets/history.js ----
(function initAssetHistory(root) {
  "use strict";
  const api = root.MWILayuAssets, core = api.core;
  const dayMs = 86400000, offset = 8 * 3600000;
  const categories = Object.freeze({ total: "总资产", cash: "金币", inventory: "库存", equipped: "穿戴装备", other: "其他位置", market: "市场资产", houses: "房屋" });
  const dayNumber = at => Math.floor((at + offset) / dayMs);
  const dayKey = at => new Date(dayNumber(at) * dayMs).toISOString().slice(0, 10);
  const newer = (a, b) => !b || a.observedAt > b.observedAt || a.observedAt === b.observedAt && (a.id || "") > (b.id || "");
  function summarize(snapshot, config, policy = "native") {
    const valuation = core.evaluate(snapshot, config, policy);
    const values = { total: valuation.complete ? valuation.knownTotal : null };
    for (const id of Object.keys(valuation.totals)) values[id] = valuation.categoryComplete[id] ? valuation.totals[id] : null;
    return { id: snapshot.id, at: snapshot.observedAt, day: dayKey(snapshot.observedAt), values,
      knownTotal: valuation.knownTotal, unpriced: valuation.unpriced, stale: valuation.stale, valuation, snapshot, config };
  }
  function change(current, previous) {
    if (typeof current !== "number" || typeof previous !== "number" || !Number.isFinite(current) || !Number.isFinite(previous)) return { amount: null, percent: null };
    const amount = current - previous;
    return { amount, percent: previous === 0 ? current === 0 ? 0 : null : amount / previous * 100 };
  }
  function build(entries, currentEntry, policy = "native", firstEntry = null) {
    const owner = currentEntry?.snapshot;
    const sameOwner = entry => entry?.snapshot.server === owner?.server && entry?.snapshot.characterId === owner?.characterId && (policy !== "native" || entry.snapshot.schema === 2);
    const byDay = new Map();
    for (const entry of entries || []) {
      if (!sameOwner(entry) || !entry.config || entry.snapshot.observedAt > owner.observedAt) continue;
      const day = dayKey(entry.snapshot.observedAt);
      if (newer(entry.snapshot, byDay.get(day)?.snapshot)) byDay.set(day, entry);
    }
    if (currentEntry?.config) byDay.set(dayKey(owner.observedAt), currentEntry);
    const points = [...byDay.values()].sort((a, b) => a.snapshot.observedAt - b.snapshot.observedAt).map(entry => summarize(entry.snapshot, entry.config, policy));
    const current = currentEntry?.config ? summarize(owner, currentEntry.config, policy) : null;
    const first = sameOwner(firstEntry) && firstEntry.config && firstEntry.snapshot.observedAt <= owner.observedAt ? summarize(firstEntry.snapshot, firstEntry.config, policy) : points[0] || null;
    const baseline = points.filter(point => point.day < current?.day).at(-1) || (first?.at < current?.at ? first : null);
    const daily = points.map((point, index) => {
      const previous = points[index - 1], adjacent = previous && dayNumber(point.at) - dayNumber(previous.at) === 1;
      return { ...point, delta: adjacent ? change(point.values.total, previous.values.total).amount : null };
    });
    const today = daily.at(-1)?.delta ?? null;
    const recent = daily.filter(point => current && dayNumber(point.at) > dayNumber(current.at) - 7 && point.delta != null);
    return { points, current, first, baseline, daily, today, average: recent.length ? recent.reduce((sum, point) => sum + point.delta, 0) / recent.length : null, averageDays: recent.length };
  }
  function comparison(current, baseline) {
    return Object.keys(categories).map(id => ({ id, current: current?.values[id] ?? null, previous: baseline?.values[id] ?? null,
      ...change(current?.values[id], baseline?.values[id]) }));
  }
  function itemChanges(current, baseline, category) {
    if (!current || !baseline || !current.valuation.categoryComplete[category] || !baseline.valuation.categoryComplete[category]) return null;
    function aggregate(point) {
      const map = new Map();
      for (const row of point.valuation.lines.filter(row => row.category === category)) {
        const id = `${core.key(row)}:${row.houseRoomHrid || ""}`;
        const previous = map.get(id);
        map.set(id, { ...row, count: (previous?.count || 0) + row.count, value: (previous?.value || 0) + row.subtotal });
      }
      return map;
    }
    const now = aggregate(current), before = aggregate(baseline);
    return [...new Set([...now.keys(), ...before.keys()])].map(id => {
      const a = now.get(id), b = before.get(id);
      return { ...(a || b), currentCount: a?.count || 0, previousCount: b?.count || 0, current: a?.value || 0, previous: b?.value || 0,
        ...change(a?.value || 0, b?.value || 0) };
    }).filter(row => row.amount !== 0 || row.currentCount !== row.previousCount).sort((a, b) => Math.abs(b.amount) - Math.abs(a.amount));
  }
  function range(points, days, endAt = points.at(-1)?.at) {
    if (days === "all") return points;
    return points.filter(point => dayNumber(point.at) >= dayNumber(endAt) - Number(days) + 1);
  }
  api.history = Object.freeze({ categories, dayMs, dayNumber, dayKey, newer, summarize, change, build, comparison, itemChanges, range });
})(globalThis);


// ---- source/assets/store.js ----
(function initAssetStore(root) {
  "use strict";
  const api = root.MWILayuAssets, core = api.core;
  const databaseName = "mwi-assets", channelName = "mwi-assets:changed:v1";
  const dbVersion = 1, stores = ["rules", "snapshots", "heads", "leases"];
  function open(indexedDB = root.indexedDB) {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(databaseName, dbVersion);
      request.onupgradeneeded = () => {
        const db = request.result;
        db.createObjectStore("rules", { keyPath: "id" });
        db.createObjectStore("snapshots", { keyPath: "id" }).createIndex("scope", ["server", "characterId"]);
        db.createObjectStore("heads", { keyPath: ["server", "characterId"] });
        db.createObjectStore("leases", { keyPath: "id" });
      };
      request.onsuccess = () => { const db = request.result; db.onversionchange = () => db.close(); resolve(db); };
      request.onerror = () => reject(request.error);
      request.onblocked = () => reject(new Error("资产数据库升级被其他页签占用，请关闭旧页签后重试"));
    });
  }
  function transaction(db, names, mode, run) {
    return new Promise((resolve, reject) => {
      const tx = db.transaction(names, mode); let result;
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => {}; // onabort owns failure; never report an uncommitted write as saved.
      tx.onabort = () => reject(tx.error || new Error("资产数据事务中止"));
      try { run(tx, value => { result = value; }); } catch (error) { tx.abort(); reject(error); }
    });
  }
  async function prepare(snapshot, config) {
    const cleanRules = core.rules(config), rulesId = await core.digest(cleanRules);
    const clean = core.normalize({ ...snapshot, rulesId });
    const fingerprint = await core.digest({ ...clean, observedAt: 0 });
    const id = await core.digest(clean);
    return { record: { ...clean, id, fingerprint }, config: { id: rulesId, data: cleanRules } };
  }
  function savePrepared(db, prepared, importing = false) {
    return transaction(db, ["rules", "snapshots", "heads"], "readwrite", (tx, done) => {
      const { record, config } = prepared;
      const heads = tx.objectStore("heads"), snapshots = tx.objectStore("snapshots");
      const request = heads.get([record.server, record.characterId]);
      request.onsuccess = () => {
        const previous = request.result;
        const newer = !previous || record.observedAt > previous.observedAt || record.observedAt === previous.observedAt && record.id > previous.snapshotId;
        const changed = !previous || previous.fingerprint !== record.fingerprint;
        const checkpoint = !previous || record.observedAt - previous.checkpointAt >= 300000;
        // Imports preserve history; live stale observations never replace a newer head.
        const write = importing || newer && (changed || checkpoint);
        if (write) { tx.objectStore("rules").put(config); snapshots.put(record); }
        if (newer) heads.put({ server: record.server, characterId: record.characterId,
          snapshotId: write ? record.id : previous.snapshotId, fingerprint: record.fingerprint,
          observedAt: record.observedAt, checkpointAt: write ? record.observedAt : previous.checkpointAt });
        done({ saved: write, latest: newer, id: write ? record.id : previous?.snapshotId });
      };
    });
  }
  async function readLatest(db, owner) {
    core.scope(owner);
    return transaction(db, ["heads", "snapshots", "rules"], "readonly", (tx, done) => {
      const head = tx.objectStore("heads").get([owner.server, owner.characterId]);
      head.onsuccess = () => {
        if (!head.result) return done(null);
        const snapshot = tx.objectStore("snapshots").get(head.result.snapshotId);
        snapshot.onsuccess = () => {
          if (!snapshot.result) return done(null);
          const config = tx.objectStore("rules").get(snapshot.result.rulesId);
          config.onsuccess = () => done(config.result ? { snapshot: snapshot.result, config: config.result.data, observedAt: head.result.observedAt } : null);
        };
      };
    });
  }
  function readHistory(db, owner) {
    core.scope(owner);
    // Stream records, retaining only the last observation per Shanghai calendar day.
    // No schema upgrade: future standalone clients retain v1 access and full raw snapshots.
    return transaction(db, ["snapshots", "rules"], "readonly", (tx, done) => {
      const days = new Map(); let first = null, count = 0, legacyCount = 0;
      const request = tx.objectStore("snapshots").index("scope").openCursor([owner.server, owner.characterId]);
      request.onsuccess = () => {
        const cursor = request.result;
        if (cursor) {
          const row = cursor.value; count++;
          if (row.schema !== 2) { legacyCount++; cursor.continue(); return; }
          const day = api.history.dayKey(row.observedAt);
          if (api.history.newer(row, days.get(day))) days.set(day, row);
          if (!first || row.observedAt < first.observedAt || row.observedAt === first.observedAt && row.id < first.id) first = row;
          cursor.continue(); return;
        }
        const selected = [...days.values()].sort((a, b) => a.observedAt - b.observedAt), configs = new Map();
        const ids = [...new Set([...selected, ...(first ? [first] : [])].map(row => row.rulesId))];
        const finish = () => done({ count, legacyCount, entries: selected.map(snapshot => ({ snapshot, config: configs.get(snapshot.rulesId) || null })),
          first: first ? { snapshot: first, config: configs.get(first.rulesId) || null } : null });
        if (!ids.length) return finish();
        for (const id of ids) {
          const rule = tx.objectStore("rules").get(id);
          rule.onsuccess = () => { configs.set(id, rule.result?.data || null); if (configs.size === ids.length) finish(); };
        }
      };
    });
  }
  function lease(db, owner, scope, now = Date.now(), release = false) {
    return transaction(db, ["leases"], "readwrite", (tx, done) => {
      core.scope(scope);
      const id = `collector:v1:${scope.server}:${scope.characterId}`;
      const store = tx.objectStore("leases"), request = store.get(id);
      request.onsuccess = () => {
        const prior = request.result;
        const allowed = !prior || prior.owner === owner || prior.until <= now || prior.until > now + 30000;
        if (allowed) store.put({ id, owner, until: release ? 0 : now + 12000 });
        done(allowed);
      };
    });
  }
  async function exportData(db, owner) {
    core.scope(owner);
    return transaction(db, ["snapshots", "rules"], "readonly", (tx, done) => {
      const records = tx.objectStore("snapshots").index("scope").getAll([owner.server, owner.characterId], 10001);
      records.onsuccess = () => {
        if (records.result.length > 10000) { tx.abort(); return; }
        const configs = [], ids = [...new Set(records.result.map(row => row.rulesId))];
        const finish = () => done({ protocol: core.protocol, version: core.version, scope: core.scope(owner), exportedAt: Date.now(), rules: configs, snapshots: records.result });
        if (!ids.length) return finish();
        for (const id of ids) { const request = tx.objectStore("rules").get(id); request.onsuccess = () => { configs.push(request.result); if (configs.length === ids.length) finish(); }; }
      };
    });
  }
  async function validateImport(data) {
    if (data?.protocol !== core.protocol || ![1, 2].includes(data.version) || !Array.isArray(data.rules) || data.rules.length > 1000 || !Array.isArray(data.snapshots) || data.snapshots.length > 10000) throw new Error("不支持的资产备份格式或版本");
    const owner = core.scope(data.scope), configs = new Map(), prepared = [];
    for (const rule of data.rules) {
      if (rule?.data?.schema !== 1) throw new Error("不支持的资产配置版本");
      const clean = core.rules(rule.data), id = await core.digest(clean);
      if (id !== rule.id) throw new Error("资产配置校验失败");
      configs.set(id, clean);
    }
    for (const snapshot of data.snapshots) {
      if (snapshot.schema > data.version) throw new Error("备份与快照版本不一致");
      if (snapshot.server !== owner.server || snapshot.characterId !== owner.characterId || !configs.has(snapshot.rulesId)) throw new Error("备份角色或配置引用不一致");
      const entry = await prepare(snapshot, configs.get(snapshot.rulesId));
      if (entry.record.id !== snapshot.id || entry.record.fingerprint !== snapshot.fingerprint) throw new Error("资产快照校验失败");
      prepared.push(entry);
    }
    return { owner, prepared };
  }
  async function importData(db, data) {
    const { owner, prepared } = await validateImport(data);
    // One atomic merge: failed import cannot leave half a history or a broken head.
    await transaction(db, ["rules", "snapshots", "heads"], "readwrite", (tx, done) => {
      const request = tx.objectStore("heads").get([owner.server, owner.characterId]);
      request.onsuccess = () => {
        let head = request.result;
        for (const { record, config } of prepared) {
          tx.objectStore("rules").put(config); tx.objectStore("snapshots").put(record);
          if (!head || record.observedAt > head.observedAt || record.observedAt === head.observedAt && record.id > head.snapshotId) head = {
            ...owner, snapshotId: record.id, fingerprint: record.fingerprint, observedAt: record.observedAt, checkpointAt: record.observedAt };
        }
        if (head) tx.objectStore("heads").put(head);
        done(prepared.length);
      };
    });
    return { owner, count: prepared.length };
  }
  function connect(onChange = () => {}) {
    let channel = typeof root.BroadcastChannel === "function" ? new root.BroadcastChannel(channelName) : null;
    const receive = () => onChange(); // Hints carry no trusted records. Always reread IndexedDB.
    if (channel) channel.onmessage = receive;
    root.document?.addEventListener(channelName, receive);
    return {
      announce() { channel?.postMessage({ version: 1 }); root.document?.dispatchEvent(new root.CustomEvent(channelName)); },
      close() { channel?.close(); channel = null; root.document?.removeEventListener(channelName, receive); }
    };
  }
  api.store = Object.freeze({ databaseName, dbVersion, stores, channelName, open, prepare, savePrepared, readLatest, readHistory, lease, exportData, validateImport, importData, connect });
})(globalThis);


// ---- source/assets/native-prices.js ----
(function initNativeAssetPrices(root) {
  "use strict";
  const api = root.MWILayuAssets;
  function normalize(data, expanded = false) {
    if (!Number.isSafeInteger(data?.marketValuesVersion) || data.marketValuesVersion <= 0 || !data.marketItemValues || typeof data.marketItemValues !== "object" || Array.isArray(data.marketItemValues)) throw new Error("官方市场价格格式无效");
    const values = {};
    for (const [slug, levels] of Object.entries(data.marketItemValues)) {
      const hrid = expanded ? slug : `/items/${slug}`;
      if (!/^\/items\/[a-z0-9_]+$/.test(hrid) || (expanded ? !levels || typeof levels !== "object" || Array.isArray(levels) : !Array.isArray(levels))) throw new Error("官方物品价格结构无效");
      for (const [level, price] of Object.entries(levels)) {
        if (!/^(?:[0-9]|1[0-9]|20)$/.test(level)) continue;
        if (typeof price === "number" && Number.isFinite(price) && price > 0 && price <= Number.MAX_SAFE_INTEGER) (values[hrid] ||= {})[level] = price;
      }
    }
    return { marketValuesVersion: data.marketValuesVersion, marketItemValues: values };
  }
  function create({ storage = root.localStorage, decompress, fetch = root.fetch.bind(root), hostname = root.location.hostname, now = Date.now, onChange = () => {} } = {}) {
    if (!/^(?:www\.|test\.)?milkywayidle(?:cn)?\.com$/.test(hostname)) throw new Error("不支持的官方游戏域名");
    let data = null, observedAt = null, source = "", error = "", pending = null, rawCache = null, stopped = false;
    const url = `https://${hostname}/game_data/market_values.json`;
    function accept(next, origin) {
      if (data && next.marketValuesVersion < data.marketValuesVersion) return false;
      data = next; observedAt = now(); source = origin; error = ""; onChange(); return true;
    }
    function readGameCache() {
      try {
        const raw = storage.getItem("marketItemValues");
        if (!raw || raw === rawCache) return;
        const parsed = JSON.parse(raw.trimStart().startsWith("{") ? raw : decompress?.(raw) || raw);
        const next = normalize(parsed, true);
        rawCache = raw; accept(next, "游戏原生缓存");
      } catch (_) { /* A malformed game cache must not replace the last validated API response. */ }
    }
    async function refresh() {
      if (stopped) return false;
      if (pending) return pending;
      readGameCache();
      const controller = new AbortController();
      const timeout = root.setTimeout(() => controller.abort(), 15000);
      pending = (async () => {
        try {
          const response = await fetch(url, { cache: "no-cache", credentials: "omit", signal: controller.signal });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const next = normalize(await response.json());
          if (!stopped && !accept(next, "游戏原生 API")) throw new Error("接口版本落后，保留较新价格");
          return !stopped;
        } catch (cause) { if (!stopped) { error = cause.message; onChange(); } return false; }
        finally { root.clearTimeout(timeout); pending = null; }
      })();
      return pending;
    }
    return { refresh, readGameCache, quote: item => data?.marketItemValues[item.itemHrid]?.[String(item.enhancementLevel || 0)] ?? null,
      state: () => ({ version: data?.marketValuesVersion ?? null, observedAt, source, error }), destroy() { stopped = true; } };
  }
  api.nativePrices = Object.freeze({ normalize, create });
})(globalThis);


// ---- source/vendor/lz-string.js ----
// Vendored dependency; provenance and license: docs/THIRD_PARTY_NOTICES.md
(function (root) {
  const module = { exports: {} };
  const exports = module.exports;
  const define = undefined;
var LZString=function(){var r=String.fromCharCode,o="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=",n="ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+-$",e={};function t(r,o){if(!e[r]){e[r]={};for(var n=0;n<r.length;n++)e[r][r.charAt(n)]=n}return e[r][o]}var i={compressToBase64:function(r){if(null==r)return"";var n=i._compress(r,6,function(r){return o.charAt(r)});switch(n.length%4){default:case 0:return n;case 1:return n+"===";case 2:return n+"==";case 3:return n+"="}},decompressFromBase64:function(r){return null==r?"":""==r?null:i._decompress(r.length,32,function(n){return t(o,r.charAt(n))})},compressToUTF16:function(o){return null==o?"":i._compress(o,15,function(o){return r(o+32)})+" "},decompressFromUTF16:function(r){return null==r?"":""==r?null:i._decompress(r.length,16384,function(o){return r.charCodeAt(o)-32})},compressToUint8Array:function(r){for(var o=i.compress(r),n=new Uint8Array(2*o.length),e=0,t=o.length;e<t;e++){var s=o.charCodeAt(e);n[2*e]=s>>>8,n[2*e+1]=s%256}return n},decompressFromUint8Array:function(o){if(null==o)return i.decompress(o);for(var n=new Array(o.length/2),e=0,t=n.length;e<t;e++)n[e]=256*o[2*e]+o[2*e+1];var s=[];return n.forEach(function(o){s.push(r(o))}),i.decompress(s.join(""))},compressToEncodedURIComponent:function(r){return null==r?"":i._compress(r,6,function(r){return n.charAt(r)})},decompressFromEncodedURIComponent:function(r){return null==r?"":""==r?null:(r=r.replace(/ /g,"+"),i._decompress(r.length,32,function(o){return t(n,r.charAt(o))}))},compress:function(o){return i._compress(o,16,function(o){return r(o)})},_compress:function(r,o,n){if(null==r)return"";var e,t,i,s={},u={},a="",p="",c="",l=2,f=3,h=2,d=[],m=0,v=0;for(i=0;i<r.length;i+=1)if(a=r.charAt(i),Object.prototype.hasOwnProperty.call(s,a)||(s[a]=f++,u[a]=!0),p=c+a,Object.prototype.hasOwnProperty.call(s,p))c=p;else{if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++),s[p]=f++,c=String(a)}if(""!==c){if(Object.prototype.hasOwnProperty.call(u,c)){if(c.charCodeAt(0)<256){for(e=0;e<h;e++)m<<=1,v==o-1?(v=0,d.push(n(m)),m=0):v++;for(t=c.charCodeAt(0),e=0;e<8;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}else{for(t=1,e=0;e<h;e++)m=m<<1|t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t=0;for(t=c.charCodeAt(0),e=0;e<16;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1}0==--l&&(l=Math.pow(2,h),h++),delete u[c]}else for(t=s[c],e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;0==--l&&(l=Math.pow(2,h),h++)}for(t=2,e=0;e<h;e++)m=m<<1|1&t,v==o-1?(v=0,d.push(n(m)),m=0):v++,t>>=1;for(;;){if(m<<=1,v==o-1){d.push(n(m));break}v++}return d.join("")},decompress:function(r){return null==r?"":""==r?null:i._decompress(r.length,32768,function(o){return r.charCodeAt(o)})},_decompress:function(o,n,e){var t,i,s,u,a,p,c,l=[],f=4,h=4,d=3,m="",v=[],g={val:e(0),position:n,index:1};for(t=0;t<3;t+=1)l[t]=t;for(s=0,a=Math.pow(2,2),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;c=r(s);break;case 2:return""}for(l[3]=c,i=c,v.push(c);;){if(g.index>o)return"";for(s=0,a=Math.pow(2,d),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;switch(c=s){case 0:for(s=0,a=Math.pow(2,8),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 1:for(s=0,a=Math.pow(2,16),p=1;p!=a;)u=g.val&g.position,g.position>>=1,0==g.position&&(g.position=n,g.val=e(g.index++)),s|=(u>0?1:0)*p,p<<=1;l[h++]=r(s),c=h-1,f--;break;case 2:return v.join("")}if(0==f&&(f=Math.pow(2,d),d++),l[c])m=l[c];else{if(c!==h)return null;m=i+i.charAt(0)}v.push(m),l[h++]=i+m.charAt(0),i=m,0==--f&&(f=Math.pow(2,d),d++)}}};return i}();"function"==typeof define&&define.amd?define(function(){return LZString}):"undefined"!=typeof module&&null!=module?module.exports=LZString:"undefined"!=typeof angular&&null!=angular&&angular.module("LZString",[]).factory("LZString",function(){return LZString});
  (root.MWILayuAssetsPlugin = root.MWILayuAssetsPlugin || {}).wageLZ = module.exports;
})(globalThis);


// ---- source/runtime/game-bridge.js ----
(function initGameBridge(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin = root.MWILayuAssetsPlugin || {};
  const requestEvent = "mwi-assets:request:v1", responseEvent = "mwi-assets:response:v1";
  function officialCatalog() {
    const ITEM_HRID = /^\/items\/[a-z0-9_]+$/i;
    const MAX_WEBPACK_FACTORIES = 6000;
    const MAX_WEBPACK_CANDIDATES = 12;
    function normalizeItemHrid(value) {
      const key = String(value || "").trim();
      if (ITEM_HRID.test(key)) return key;
      return /^[a-z0-9_]+$/i.test(key) ? `/items/${key}` : null;
    }

    function cleanName(value) {
      return typeof value === "string" && value.trim() ? value.trim() : null;
    }

    function catalogFromItemNames(itemNames) {
      if (!itemNames || typeof itemNames !== "object" || Array.isArray(itemNames)) return Object.create(null);
      const names = Object.create(null);
      for (const [rawKey, rawName] of Object.entries(itemNames)) {
        const itemHrid = normalizeItemHrid(rawKey);
        const name = cleanName(rawName);
        if (itemHrid && name) names[itemHrid] = name;
      }
      return names;
    }

    function itemNameMapsFromI18n(root) {
      if (!root || typeof root !== "object") return [];
      const resourceRoots = [
        root.resources,
        root.options && root.options.resources,
        root.store && root.store.data,
        root.services && root.services.resourceStore && root.services.resourceStore.data,
        root.resourceStore && root.resourceStore.data,
        root.data,
        root
      ].filter((value) => value && typeof value === "object");
      const maps = [];
      for (const resources of resourceRoots) {
        for (const localeKey of ["zh", "zh-CN", "zh_CN", "zh-Hans", "zh-Hans-CN"]) {
          const locale = resources[localeKey];
          if (!locale || typeof locale !== "object") continue;
          const translation = locale.translation && typeof locale.translation === "object" ? locale.translation : locale;
          if (translation.itemNames && typeof translation.itemNames === "object") maps.push(translation.itemNames);
          if (locale.itemNames && typeof locale.itemNames === "object") maps.push(locale.itemNames);
        }
      }
      return maps;
    }

    function i18nVariants(candidate) {
      if (!candidate || typeof candidate !== "object") return [];
      return [
        candidate,
        candidate.i18n,
        candidate.i18next,
        candidate.value,
        candidate.value && candidate.value.i18n,
        candidate.context,
        candidate.context && candidate.context.i18n,
        candidate.props && candidate.props.i18n
      ].filter((value) => value && typeof value === "object");
    }

    function extractOfficialItemNameCatalog(roots) {
      const candidates = Array.isArray(roots) ? roots : [roots];
      const names = Object.create(null);
      for (const root of candidates) {
        for (const candidate of i18nVariants(root)) {
          for (const itemNames of itemNameMapsFromI18n(candidate)) {
            Object.assign(names, catalogFromItemNames(itemNames));
          }
        }
      }
      const entryCount = Object.keys(names).length;
      return { names, entryCount, valid: entryCount > 0 };
    }

    function webpackChunkEntries(pageWindow) {
      if (!pageWindow || typeof pageWindow !== "object") return [];
      const entries = [];
      try {
        for (const key of Object.getOwnPropertyNames(pageWindow)) {
          if (!/^webpack(?:jsonp|chunk)/i.test(key)) continue;
          let queue;
          try {
            queue = pageWindow[key];
          } catch (_) {
            continue;
          }
          if (!Array.isArray(queue)) continue;
          for (const entry of queue) {
            if (entry && entry[1] && typeof entry[1] === "object") entries.push(entry);
          }
        }
      } catch (_) {
        return [];
      }
      return entries;
    }

    function webpackLocaleModuleMap(entries) {
      const moduleMap = new Map();
      const pattern = /["']\.\/([^"'\\]+)\/index\.js["']\s*:\s*\[\s*(\d+)\s*,\s*(\d+)\s*\]/g;
      let scanned = 0;
      for (const entry of entries) {
        for (const factory of Object.values(entry[1])) {
          if (typeof factory !== "function" || scanned >= MAX_WEBPACK_FACTORIES) continue;
          scanned += 1;
          let source;
          try {
            source = Function.prototype.toString.call(factory);
          } catch (_) {
            continue;
          }
          if (!source.includes("./zh-TW/index.js")) continue;
          for (const match of source.matchAll(pattern)) {
            const locale = String(match[1] || "")
              .trim()
              .toLowerCase()
              .replaceAll("_", "-");
            if (locale === "zh" || locale === "zh-cn" || locale === "zh-hans" || locale.startsWith("zh-hans-"))
              moduleMap.set("zh-CN", String(match[2]));
          }
        }
      }
      return moduleMap;
    }

    function runWebpackLocaleFactory(factory) {
      const module = { exports: {} };
      const exports = module.exports;
      const webpackRequire = () => {
        throw new Error("The game locale module unexpectedly imported another module");
      };
      webpackRequire.r = (target) => Object.defineProperty(target, "__esModule", { value: true });
      webpackRequire.d = (target, nameOrDefinition, getter) => {
        const definition = typeof nameOrDefinition === "object" ? nameOrDefinition : { [nameOrDefinition]: getter };
        for (const [name, get] of Object.entries(definition)) {
          if (typeof get !== "function" || Object.hasOwn(target, name)) continue;
          Object.defineProperty(target, name, { enumerable: true, get });
        }
      };
      factory.call(exports, module, exports, webpackRequire);
      return module.exports && module.exports.default
        ? module.exports.default
        : exports && exports.default
          ? exports.default
          : module.exports;
    }

    function validLocaleResourceMap(value, prefix) {
      return Boolean(
        value &&
        typeof value === "object" &&
        !Array.isArray(value) &&
        Object.keys(value).some((key) => key.startsWith(prefix))
      );
    }

    function validGameLocaleResources(resources) {
      return Boolean(
        resources &&
        typeof resources === "object" &&
        validLocaleResourceMap(resources.itemNames, "/items/") &&
        validLocaleResourceMap(resources.actionNames, "/actions/") &&
        validLocaleResourceMap(resources.monsterNames, "/monsters/") &&
        validLocaleResourceMap(resources.abilityNames, "/abilities/")
      );
    }

    function extractWebpackItemNameCatalog(pageWindow) {
      const entries = webpackChunkEntries(pageWindow);
      if (!entries.length) return { names: Object.create(null), entryCount: 0, valid: false, source: "webpack-locale" };
      const expectedModuleId = webpackLocaleModuleMap(entries).get("zh-CN");
      const preferred = [];
      const fallback = [];
      let scanned = 0;
      for (const entry of entries) {
        for (const [moduleId, factory] of Object.entries(entry[1])) {
          if (typeof factory !== "function" || scanned >= MAX_WEBPACK_FACTORIES) continue;
          scanned += 1;
          if (expectedModuleId && moduleId === expectedModuleId) {
            preferred.push(factory);
            continue;
          }
          if (expectedModuleId || fallback.length >= MAX_WEBPACK_CANDIDATES) continue;
          let source;
          try {
            source = Function.prototype.toString.call(factory);
          } catch (_) {
            continue;
          }
          if (
            source.includes("itemNames") &&
            source.includes("actionNames") &&
            source.includes("monsterNames") &&
            source.includes("abilityNames")
          )
            fallback.push(factory);
        }
      }
      for (const factory of [...preferred, ...fallback].slice(0, MAX_WEBPACK_CANDIDATES)) {
        try {
          const resources = runWebpackLocaleFactory(factory);
          if (!validGameLocaleResources(resources)) continue;
          const names = catalogFromItemNames(resources.itemNames);
          const entryCount = Object.keys(names).length;
          if (entryCount) return { names, entryCount, valid: true, source: "webpack-locale" };
        } catch (_) {
          // A changed or dependent game module is not a fatal localization failure.
        }
      }
      return { names: Object.create(null), entryCount: 0, valid: false, source: "webpack-locale" };
    }

    return { extractOfficialItemNameCatalog, extractWebpackItemNameCatalog };
  }

  function installer(options, catalogFactory) {
    if (window.__mwiAssetsBridgeV1) return;
    window.__mwiAssetsBridgeV1 = true;
    const catalog = catalogFactory(); let webpackNames = {}, lastWebpackRead = 0;
    const validHrid = value => /^\/items\/[a-z0-9_]+$/.test(value || "");
    function fibers(element) {
      if (!element) return [];
      return Object.getOwnPropertyNames(element)
        .filter((key) => /^__react(?:Fiber|Container|InternalInstance)\$/.test(key))
        .map((key) => element[key]);
    }
    function find(select, includeAlternates = true) {
      // The GamePage host's ancestors contain the live controller and locale provider.
      const hosts = window.document.querySelectorAll?.('[class*="GamePage_gamePage"]') || [];
      const seen = new Set();
      for (const host of [...hosts].slice(0, 4)) for (let fiber of fibers(host)) {
        for (let depth = 0; fiber && depth < 64; depth += 1, fiber = fiber.return) {
          if (seen.has(fiber)) break;
          seen.add(fiber);
          const result = select(fiber);
          if (result) return result;
        }
      }
      const element = window.document.getElementById("root");
      const pending = fibers(element);
      pending.push(element?._reactRootContainer, element?._reactRootContainer?._internalRoot);
      // Ancestor inspection must not prevent descending from the same root.
      seen.clear();
      const alternates = [];
      for (let inspected = 0; (pending.length || alternates.length) && inspected < 50000; inspected += 1) {
        const fiber = pending.length ? pending.pop() : alternates.pop();
        if (!fiber || typeof fiber !== "object" || seen.has(fiber)) continue;
        seen.add(fiber);
        const result = select(fiber);
        if (result) return result;
        // Search current roots first, then the compatibility alternate path used by the guild assistant.
        if (fiber.current) pending.push(fiber.current);
        if (fiber.stateNode?.current) pending.push(fiber.stateNode.current);
        if (includeAlternates && fiber.alternate) alternates.push(fiber.alternate);
        if (fiber.child) pending.push(fiber.child);
        if (fiber.sibling) pending.push(fiber.sibling);
      }
      return null;
    }
    function namesFor(hrids) {
      const names = {};
      const merge = (values) => {
        for (const hrid of hrids) {
          const value = values?.[hrid];
          if (typeof value === "string" && /[\u3400-\u9fff]/.test(value)) names[hrid] = value.slice(0, 160);
        }
      };
      merge(catalog.extractOfficialItemNameCatalog([window.i18next, window.i18n, window.mwi?.lang]).names);
      find((fiber) => {
        const props = [fiber.memoizedProps, fiber.pendingProps, fiber.memoizedState,
          fiber.stateNode?.state, fiber.stateNode?.props, fiber.stateNode];
        merge(catalog.extractOfficialItemNameCatalog(props).names);
        for (const propsValue of props) {
          const i18n = propsValue?.i18n;
          if (!i18n) continue;
          for (const locale of ["zh", "zh-CN", "zh_CN", "zh-Hans"]) {
            const resources = i18n.getResourceBundle?.(locale, "translation") ||
              i18n.services?.resourceStore?.data?.[locale]?.translation ||
              i18n.store?.data?.[locale]?.translation || i18n.options?.resources?.[locale]?.translation;
            for (const hrid of hrids) {
              const value = resources?.itemNames?.[hrid];
              if (typeof value === "string" && /[\u3400-\u9fff]/.test(value)) names[hrid] = value.slice(0, 160);
            }
          }
        }
        return Object.keys(names).length === hrids.length ? names : null;
      });
      if (Object.keys(names).length < hrids.length) {
        if (!lastWebpackRead || Date.now() - lastWebpackRead > 60000) {
          lastWebpackRead = Date.now();
          webpackNames = catalog.extractWebpackItemNameCatalog(window).names;
        }
        merge(webpackNames);
      }
      return names;
    }
    window.document.addEventListener(options.requestEvent, event => {
      let request; try { request = JSON.parse(event.detail); } catch (_) { return; }
      if (typeof request?.requestId !== "string" || request.requestId.length > 128) return;
      let accepted = false, error = "invalid_request", assetState = null, names = {};
      try {
        if (request.action === "ping") accepted = true;
        else if (request.action === "asset-state") {
          // One controller read keeps items, orders and rooms in the same observation.
          const state = find((fiber) => {
            const value = fiber.stateNode?.state;
            return value?.character?.id && !value.isLoading && !value.isFullDisconnected && value.characterItemMap ? value : null;
          }, false);
          if (state) {
            const rows = value => value == null ? null : value instanceof Map ? [...value.entries()] : Object.entries(value);
            const pick = (value, keys) => Object.fromEntries(keys.filter(key => value?.[key] === null ||
              typeof value?.[key] === "boolean" || typeof value?.[key] === "number" && Number.isFinite(value[key]) ||
              typeof value?.[key] === "string" && value[key].length <= 200).map(key => [key, value[key]]));
            assetState = {
              characterId: state.character.id, observedAt: Date.now(),
              items: rows(state.characterItemMap)?.map(([key, item]) => ({ ...pick(item,
                ["id", "itemHrid", "itemLocationHrid", "enhancementLevel", "count"]), stackKey: String(key).slice(0, 200) })) ?? null,
              rooms: rows(state.characterHouseRoomDict ?? state.characterHouseRoomMap)?.map(([key, room]) => ({
                houseRoomHrid: room.houseRoomHrid || key, level: room.level })) ?? null,
              listings: rows(state.myMarketListingMap)?.map(([, listing]) => pick(listing,
                ["id", "itemHrid", "enhancementLevel", "isSell", "status", "price", "workingPrice", "coinsAvailable",
                  "orderQuantity", "filledQuantity", "unclaimedItemCount", "unclaimedCoinCount", "createdTimestamp", "updatedAt"])) ?? null
            };
            accepted = true;
          } else error = "asset_state_missing";

        } else if (request.action === "names" && Array.isArray(request.hrids) && request.hrids.length <= 1000) {
          const hrids = [...new Set(request.hrids.filter(validHrid))]; names = hrids.length ? namesFor(hrids) : {}; accepted = true;
        }
      } catch (_) { accepted = false; error = "page_error"; }
      window.document.dispatchEvent(new CustomEvent(options.responseEvent, { detail: JSON.stringify({ requestId: request.requestId, accepted, error: accepted ? "" : error, assetState, names }) }));
    });
  }
  let sequence = 0;
  function request(payload, timeoutMs = 1500) {
    const requestId = `assets:${Date.now()}:${++sequence}`;
    return new Promise(resolve => {
      let timer;
      const finish = value => { root.clearTimeout(timer); root.document.removeEventListener(responseEvent, receive); resolve(value); };
      const receive = event => { try { const value = JSON.parse(event.detail); if (value.requestId === requestId) finish(value); } catch (_) {} };
      root.document.addEventListener(responseEvent, receive);
      timer = root.setTimeout(() => finish({ accepted: false, error: "bridge_timeout" }), timeoutMs);
      root.document.dispatchEvent(new root.CustomEvent(requestEvent, { detail: JSON.stringify({ ...payload, requestId }) }));
    });
  }
  const source = () => `;(${installer.toString()})(${JSON.stringify({ requestEvent, responseEvent })},${officialCatalog.toString()});`;
  async function inject() {
    if ((await request({ action: "ping" }, 80)).accepted) return;
    const textContent = source();
    if (typeof GM_addElement === "function") GM_addElement("script", { textContent });
    else { const script = root.document.createElement("script"); script.textContent = textContent; (root.document.head || root.document.documentElement).append(script); script.remove(); }
  }
  app.gameBridge = Object.freeze({ source, inject, request, itemNames: async hrids => (await request({ action: "names", hrids })).names || {} });
})(globalThis);


// ---- source/ui/item-ui.js ----
(function initItemUI(root) {
  "use strict";
  const app = (root.MWILayuAssetsPlugin = root.MWILayuAssetsPlugin || {});
  const references = {
    "金币": "/items/coin", "工匠茶": "/items/artisan_tea", "祝福茶": "/items/blessed_tea",
    "贤者之镜": "/items/philosophers_mirror", "保护之镜": "/items/mirror_of_protection",
    "暴饮之囊": "/items/guzzling_pouch", "机缘披风": "/items/chance_cape",
    "星空强化器": "/items/celestial_enhancer", "神圣强化器": "/items/holy_enhancer",
    "强化茶": "/items/enhancing_tea", "普通强化茶": "/items/enhancing_tea",
    "超级强化茶": "/items/super_enhancing_tea", "究极强化茶": "/items/ultra_enhancing_tea"
  };
  function icon(itemHrid, spriteBase) {
    const svg = root.document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.classList.add("mwi-assets-item-icon"); svg.setAttribute("viewBox", "0 0 50 50");
    svg.setAttribute("aria-hidden", "true"); svg.setAttribute("focusable", "false");
    svg.dataset.itemHrid = itemHrid;
    if (spriteBase && /^\/items\/[a-z0-9_]+$/.test(itemHrid)) {
      const use = root.document.createElementNS(svg.namespaceURI, "use");
      use.setAttribute("href", `${spriteBase}#${itemHrid.slice(7)}`); svg.append(use);
    } else {
      svg.classList.add("mwi-assets-item-icon-pending");
      const path = root.document.createElementNS(svg.namespaceURI, "path");
      path.setAttribute("d", "M10 10H40V40H10Z"); path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor"); path.setAttribute("stroke-width", "2"); path.setAttribute("stroke-dasharray", "4 4");
      svg.append(path);
    }
    return svg;
  }
  function identity(item, spriteBase, label = item.name) {
    const el = root.document.createElement("span"); el.className = "mwi-assets-item-label";
    el.dataset.itemHrid = item.itemHrid;
    const name = root.document.createElement("span"); name.className = "mwi-assets-item-name"; name.textContent = label;
    el.append(icon(item.itemHrid, spriteBase), name); el.title = label;
    return el;
  }
  const choices = new WeakMap();
  function refreshChoices(container) {
    for (const select of container.querySelectorAll("select")) choices.get(select)?.update();
  }
  // Decorate actual item mentions in explanatory copy; leave editable fields and native SVGs alone.
  function decorate(container, spriteBase, names = {}) {
    const catalog = new Map(Object.entries(references));
    for (const [hrid, name] of Object.entries(names)) if (/^\/items\/[a-z0-9_]+$/.test(hrid) && name) catalog.set(name, hrid);
    for (const el of container.querySelectorAll(".mwi-assets-item-label")) {
      const current = el.querySelector(".mwi-assets-item-icon");
      const desired = spriteBase ? `${spriteBase}#${el.dataset.itemHrid.slice(7)}` : null;
      if (desired && current?.querySelector("use")?.getAttribute("href") !== desired) current?.replaceWith(icon(el.dataset.itemHrid, spriteBase));
    }
    const labels = [...catalog.keys()].sort((a, b) => b.length - a.length);
    const pattern = new RegExp(labels.map(text => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), "g");
    const walker = root.document.createTreeWalker(container, root.NodeFilter.SHOW_TEXT);
    const texts = [];
    while (walker.nextNode()) if (!walker.currentNode.parentElement.closest(".mwi-assets-item-label,select,textarea,input,svg,script,style")) texts.push(walker.currentNode);
    for (const text of texts) {
      const value = text.textContent; const matches = [...value.matchAll(pattern)]; if (!matches.length) continue;
      const fragment = root.document.createDocumentFragment(); let offset = 0;
      for (const match of matches) {
        fragment.append(value.slice(offset, match.index), identity({ itemHrid: catalog.get(match[0]) }, spriteBase, match[0]));
        offset = match.index + match[0].length;
      }
      fragment.append(value.slice(offset)); text.replaceWith(fragment);
    }
    // Native option popups cannot contain SVG. Keep the selected item's icon beside the select.
    for (const select of container.querySelectorAll("select")) {
      if (![...select.options].some(option => catalog.has(option.textContent))) continue;
      let choice = choices.get(select);
      if (!choice) {
        const wrapper = root.document.createElement("span"); wrapper.className = "mwi-assets-item-choice";
        select.before(wrapper); wrapper.append(select);
        choice = { wrapper }; choices.set(select, choice);
        select.addEventListener("change", () => choice.update());
      }
      choice.update = () => {
        choice.wrapper.querySelector("svg")?.remove();
        const hrid = catalog.get(select.selectedOptions[0]?.textContent);
        if (hrid) choice.wrapper.prepend(icon(hrid, spriteBase));
      };
      choice.update();
    }
  }
  app.itemUI = Object.freeze({ icon, identity, decorate, refreshChoices, references });
})(globalThis);


// ---- source/ui/sidebar-integration.js ----
(function initSidebarIntegration(root) {
  "use strict";

  const app = (root.MWILayuAssetsPlugin = root.MWILayuAssetsPlugin || {});
  const SIDEBAR_LABELS = Object.freeze({
    zh: Object.freeze(["库存", "装备", "技能", "房屋", "配装", "收获"]),
    en: Object.freeze(["Inventory", "Equipment", "Skills", "House", "Loadout", "Loadouts", "Harvest", "Gathering"])
  });
  const EXPECTED_LABELS = new Set([...SIDEBAR_LABELS.zh, ...SIDEBAR_LABELS.en]);
  const SIDEBAR_ACTIVATION_EVENT = "mwi:sidebar-plugin-activated";

  function createActivationCoordinator(options = {}) {
    const eventTarget = options.eventTarget;
    const CustomEventConstructor = options.CustomEvent;
    const owner = String(options.owner || "").trim();
    const onDeactivate = typeof options.onDeactivate === "function" ? options.onDeactivate : () => {};
    let started = false;

    function handleActivation(event) {
      const activeOwner = typeof event?.detail === "string" ? event.detail : "";
      if (activeOwner && activeOwner !== owner) onDeactivate(activeOwner);
    }

    function start() {
      if (started) return true;
      if (!owner || typeof eventTarget?.addEventListener !== "function") return false;
      eventTarget.addEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = true;
      return true;
    }

    function announce() {
      if (!started) start();
      if (!started || typeof eventTarget?.dispatchEvent !== "function" || typeof CustomEventConstructor !== "function") {
        return false;
      }
      eventTarget.dispatchEvent(new CustomEventConstructor(SIDEBAR_ACTIVATION_EVENT, { detail: owner }));
      return true;
    }

    function destroy() {
      if (!started) return;
      eventTarget.removeEventListener(SIDEBAR_ACTIVATION_EVENT, handleActivation);
      started = false;
    }

    return Object.freeze({ start, announce, destroy });
  }

  function createDocumentActivationCoordinator(windowRef, owner, onDeactivate) {
    const coordinator = createActivationCoordinator({
      eventTarget: windowRef?.document,
      CustomEvent: windowRef?.CustomEvent,
      owner,
      onDeactivate
    });
    coordinator.start();
    return coordinator;
  }

  function normalizedLabel(element) {
    return String(element?.innerText || element?.textContent || "")
      .replaceAll("\n", "")
      .trim();
  }

  function sidebarLocale(labels) {
    const counts = { zh: 0, en: 0 };
    for (const label of Array.isArray(labels) ? labels : []) {
      if (SIDEBAR_LABELS.zh.includes(label)) counts.zh += 1;
      else if (SIDEBAR_LABELS.en.includes(label)) counts.en += 1;
    }
    if (counts.zh === counts.en) return null;
    return counts.zh > counts.en ? "zh" : "en";
  }

  function findSidebarIntegration(documentRef, preferredLanguage) {
    if (!documentRef || typeof documentRef.getElementsByTagName !== "function") return null;
    let best = null;
    for (const candidate of Array.from(documentRef.getElementsByTagName("*"))) {
      const children = Array.from(candidate.children || []);
      if (children.length < 4) continue;
      const recognized = children
        .map((element) => ({ element, label: normalizedLabel(element) }))
        .filter((tab) => EXPECTED_LABELS.has(tab.label));
      if (recognized.length < 4) continue;
      const detectedLanguage = sidebarLocale(recognized.map((tab) => tab.label));
      const prototypeLabels = (detectedLanguage || preferredLanguage) === "en"
        ? ["Inventory", "库存"]
        : ["库存", "Inventory"];
      const prototype = recognized.find((tab) => prototypeLabels.includes(tab.label)) || recognized[0];
      const tabsRoot = candidate.parentElement?.parentElement?.parentElement;
      const sidebar = tabsRoot?.parentElement;
      const panelHost = sidebar && Array.from(sidebar.children || []).find(
        (node) => node !== tabsRoot && /tabPanelsContainer/.test(String(node.className))
      );
      if (!panelHost) continue;
      const rect = typeof candidate.getBoundingClientRect === "function"
        ? candidate.getBoundingClientRect()
        : { width: 0, height: 0 };
      const visible = candidate.isConnected !== false && rect.width > 0 && rect.height > 0;
      const integration = {
        tabBar: candidate,
        tabPrototype: prototype.element,
        panelHost,
        detectedLanguage,
        score: (visible ? 1000 : 0) + recognized.length
      };
      if (!best || integration.score > best.score) best = integration;
    }
    return best;
  }

  // cloneNode copies our markers into foreign tabs. A foreign identity always
  // wins; this plugin's existing tabs and panel roots have no ID.
  function hasForeignIdentity(node) {
    return Boolean(node?.id ||
      node?.dataset?.mwitoolsCharacterTab === "true" ||
      node?.dataset?.mwiCreditTab === "true" ||
      node?.hasAttribute?.("data-mooncake-enhancement-tab-button"));
  }

  function isOwnedTab(node) {
    return node?.dataset?.mwiGitTab === "true" && !hasForeignIdentity(node);
  }

  function isOwnedPanel(node) {
    return Boolean(node?.classList?.contains?.("mwi-git-panel") && !hasForeignIdentity(node));
  }

  function suppressStaleMounts(found, currentTab, currentPanel, ownsTab = isOwnedTab, ownsPanel = isOwnedPanel) {
    let staleTabWasSelected = false;
    for (const candidate of Array.from(found?.tabBar?.children || [])) {
      if (candidate === currentTab || !ownsTab(candidate)) continue;
      staleTabWasSelected ||= !candidate.hidden && (candidate.classList?.contains?.("Mui-selected") ||
        candidate.getAttribute?.("aria-selected") === "true");
      candidate.classList?.remove?.("Mui-selected");
      candidate.setAttribute?.("aria-selected", "false");
      candidate.setAttribute?.("aria-hidden", "true");
      candidate.setAttribute?.("tabindex", "-1");
      candidate.dataset.mwiGitSuperseded = "true";
      candidate.hidden = true;
    }
    for (const candidate of Array.from(found?.panelHost?.children || [])) {
      if (candidate === currentPanel || !ownsPanel(candidate)) continue;
      candidate.setAttribute?.("aria-hidden", "true");
      candidate.dataset.mwiGitSuperseded = "true";
      candidate.hidden = true;
    }
    return staleTabWasSelected;
  }

  function hasVisibleStaleMounts(found, currentTab, currentPanel, ownsTab = isOwnedTab, ownsPanel = isOwnedPanel) {
    const staleTab = Array.from(found?.tabBar?.children || []).some(
      (candidate) => candidate !== currentTab && ownsTab(candidate) && !candidate.hidden
    );
    if (staleTab) return true;
    return Array.from(found?.panelHost?.children || []).some(
      (candidate) => candidate !== currentPanel &&
        ownsPanel(candidate) &&
        !candidate.hidden
    );
  }

  function createController(options) {
    let panel = options.panel;
    const i18n = options.i18n;
    const ownsTab = options.isOwnedTab || isOwnedTab;
    const ownsPanel = options.isOwnedPanel || isOwnedPanel;
    const tabMarker = options.tabMarker || "mwiGitTab";
    const displayKey = options.displayKey || "mwiGitPreviousDisplay";
    let integration = null;
    let tab = null;
    let hiddenNodes = [];
    let observer = null;
    let scheduled = 0;
    let active = false;
    let destroyed = false;
    const activationCoordinator = createDocumentActivationCoordinator(root, options.owner || app.config.appId, hide);

    function isPrimaryAction(event) {
      return !(event.button > 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey);
    }

    function isAvailable(candidate) {
      return candidate?.matches?.('button,[role="tab"]') &&
        !candidate.closest('[hidden],[inert],[aria-hidden="true"]') &&
        !candidate.disabled && candidate.getAttribute("aria-disabled") !== "true" &&
        candidate.getClientRects().length > 0;
    }

    // Release native content before another plugin stops a click at document
    // capture or the target. This also handles keyboard-generated clicks.
    function leaveForOtherTab(event) {
      if (!isPrimaryAction(event)) return;
      const target = event.target?.nodeType === 1 ? event.target : event.target?.parentElement;
      const clicked = Array.from(integration?.tabBar.children || []).find((node) => node.contains(target));
      if (clicked && clicked !== tab && isAvailable(clicked)) hide();
    }

    function restoreHiddenNodes() {
      for (const node of hiddenNodes) {
        if (!node.isConnected) continue;
        node.style.display = node.dataset[displayKey] || "";
        delete node.dataset[displayKey];
      }
      hiddenNodes = [];
    }

    function hide() {
      active = false;
      panel.hideNative();
      if (tab) {
        tab.classList.remove("Mui-selected");
        tab.setAttribute("aria-selected", "false");
      }
      restoreHiddenNodes();
    }

    function show() {
      if (!integration || !tab?.isConnected || !panel.isNativeMounted()) return false;
      activationCoordinator.announce();
      hide();
      hiddenNodes = Array.from(integration.panelHost.children || []).filter((node) => node !== panel.element);
      for (const node of hiddenNodes) {
        node.dataset[displayKey] = node.style.display;
        node.style.display = "none";
      }
      for (const nativeTab of Array.from(integration.tabBar.children || [])) {
        nativeTab.classList.remove("Mui-selected");
        nativeTab.setAttribute("aria-selected", "false");
      }
      tab.classList.add("Mui-selected");
      tab.setAttribute("aria-selected", "true");
      active = true;
      panel.openNative();
      return true;
    }

    function clearMount() {
      hide();
      tab?.remove();
      tab = null;
      integration = null;
      panel.restoreOverlay();
    }

    function mountedIn(found) {
      return Boolean(
        integration &&
        tab?.isConnected &&
        tab.parentElement === found.tabBar &&
        panel.element.isConnected &&
        panel.element.parentElement === found.panelHost
      );
    }

    function ensure() {
      if (destroyed) return false;
      const found = findSidebarIntegration(root.document, i18n.language);
      if (!found) {
        if (integration && (!tab?.isConnected || !panel.isNativeMounted())) clearMount();
        return false;
      }
      const staleTabWasSelected = suppressStaleMounts(found, tab, panel.element, ownsTab, ownsPanel);
      if (mountedIn(found)) {
        if (tab.textContent !== i18n.t("sidebar")) tab.textContent = i18n.t("sidebar");
        panel.disableFallback();
        if (staleTabWasSelected) show();
        return true;
      }
      const reopen = active || staleTabWasSelected;
      if (tab?.isConnected && tab.parentElement === found.tabBar && ownsTab(tab)) {
        // MWITools may anchor P/L to Invite, so panel replacement must not move
        // or recreate the tab. Its document listeners retain this exact node.
        hide();
        integration = found;
        tab.textContent = i18n.t("sidebar");
        panel.mountNative(found.panelHost, hide);
        panel.disableFallback();
        if (reopen) show();
        return true;
      }
      clearMount();
      integration = found;
      tab = root.document.createElement("button");
      tab.type = "button";
      tab.className = String(found.tabPrototype.className || "");
      tab.dataset[tabMarker] = "true";
      tab.classList.remove("Mui-selected");
      tab.setAttribute("aria-selected", "false");
      tab.setAttribute("role", "tab");
      tab.tabIndex = 0;
      tab.replaceChildren(root.document.createTextNode(i18n.t("sidebar")));
      const activate = (event) => {
        if (destroyed || !isPrimaryAction(event) || !isAvailable(tab)) return;
        event.preventDefault();
        event.stopImmediatePropagation();
        show();
      };
      tab.addEventListener("click", activate, true);
      found.tabBar.append(tab);
      panel.mountNative(found.panelHost, hide);
      suppressStaleMounts(found, tab, panel.element, ownsTab, ownsPanel);
      panel.disableFallback();
      if (reopen) show();
      return true;
    }

    function scheduleEnsure() {
      if (destroyed || scheduled) return;
      scheduled = root.setTimeout(() => {
        scheduled = 0;
        ensure();
      }, 75);
    }

    function start() {
      if (destroyed) return false;
      activationCoordinator.start();
      root.addEventListener?.("click", leaveForOtherTab, true);
      const mounted = ensure();
      if (!mounted) scheduleEnsure();
      if (typeof root.MutationObserver === "function" && !observer) {
        observer = new root.MutationObserver(() => {
          if (
            !integration ||
            !tab?.isConnected ||
            !panel.isNativeMounted() ||
            hasVisibleStaleMounts(integration, tab, panel.element, ownsTab, ownsPanel)
          ) scheduleEnsure();
        });
        observer.observe(root.document.documentElement || root.document, { childList: true, subtree: true });
      }
      return mounted;
    }

    function open() {
      if (ensure()) return show();
      panel.enableFallback();
      panel.open();
      return false;
    }

    function destroy() {
      destroyed = true;
      if (scheduled) root.clearTimeout(scheduled);
      observer?.disconnect();
      observer = null;
      activationCoordinator.destroy();
      root.removeEventListener?.("click", leaveForOtherTab, true);
      clearMount();
    }

    function replacePanel(nextPanel) {
      if (destroyed || !nextPanel) return false;
      const reopen = active;
      hide();
      panel = nextPanel;
      const mounted = ensure();
      if (mounted && reopen) show();
      return mounted;
    }

    return Object.freeze({ start, ensure, open, hide, replacePanel, destroy });
  }

  app.sidebarIntegration = Object.freeze({
    SIDEBAR_LABELS,
    SIDEBAR_ACTIVATION_EVENT,
    sidebarLocale,
    findSidebarIntegration,
    isOwnedTab,
    isOwnedPanel,
    suppressStaleMounts,
    hasVisibleStaleMounts,
    createActivationCoordinator,
    createDocumentActivationCoordinator,
    createController
  });
})(globalThis);


// ---- source/ui/styles.js ----
(function(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin;
  const css = `.mwi-assets-panel {
 --assets-bg:#24253C; --assets-header:#141a24; --assets-surface:#182130; --assets-line:#263348;
 --assets-text:#f1f5f9; --assets-muted:#a0aec2; --assets-accent:#38bdf8;
 box-sizing:border-box; width:100%; min-width:0; max-width:100%; container:assets-workspace / inline-size; height:100%; min-height:600px;
 background:var(--assets-bg); color:var(--assets-text); font:12px/1.5 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;
 display:flex; flex-direction:column; position:relative; overflow:hidden; isolation:isolate; color-scheme:dark;
}
.mwi-assets-panel *, .mwi-assets-panel *::before,.mwi-assets-panel *::after {box-sizing:border-box;}
.mwi-assets-panel[hidden],.mwi-assets-panel [hidden] {display:none!important;}
.mwi-assets-panel ::selection {background:#28506c;color:#fff;}
.mwi-assets-panel * {scrollbar-color:#3b4966 #111722;scrollbar-width:thin;}
.mwi-assets-panel button,.mwi-assets-panel input,.mwi-assets-panel select {font:inherit;color:inherit;}
.mwi-assets-panel button {border:1px solid #33435c;background:#1e2636;border-radius:4px;padding:4px 8px;cursor:pointer;min-height:28px;}
.mwi-assets-panel button:hover {background:#283448;border-color:#57718f;}
.mwi-assets-panel button:disabled {opacity:.48;cursor:not-allowed;}
.mwi-assets-panel button[aria-pressed=true] {color:#7dd3fc;border-color:#3980a6;background:#183349;}
.mwi-assets-panel :is(button,input,select,summary,[tabindex]):focus-visible {outline:2px solid #38bdf8;outline-offset:2px;}
.mwi-assets-panel input,.mwi-assets-panel select {background:#111722;border:1px solid #33435c;border-radius:4px;padding:4px 6px;min-height:28px;max-width:100%;caret-color:#38bdf8;}
.mwi-assets-panel input::placeholder {color:#a0aec2;}
.mwi-assets-panel input[type=checkbox] {accent-color:#0284c7;min-height:0;width:14px;height:14px;flex-shrink:0;}
.mwi-assets-panel [aria-invalid=true] {border-color:#f87171!important;}
.mwi-assets-panel h2 {font-size:14px;margin:0 0 8px;font-weight:650;}
.mwi-assets-panel h3 {font-size:12px;margin:10px 0 6px;color:#cbd5e1;}
.mwi-assets-panel p {margin:6px 0;color:var(--assets-muted);}
.mwi-assets-panel p:empty,.mwi-assets-panel div[role=status]:empty {display:none;}
.mwi-assets-panel summary {cursor:pointer;}
`;
  app.styles = { installStyles() { if (root.document.getElementById("mwi-assets-styles")) return; const style = root.document.createElement("style"); style.id = "mwi-assets-styles"; style.textContent = css; root.document.head.append(style); } };
})(globalThis);


// ---- source/ui/history-ui.js ----
(function initAssetHistoryUI(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin, history = root.MWILayuAssets.history;
  const colors = { total: "#45c9ed", cash: "#e5be64", inventory: "#45c9ed", equipped: "#ae9cf8", other: "#e699c0", market: "#58cda5", houses: "#f59e6f" };
  const number = n => n == null ? "—" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const signed = n => n == null ? "—" : `${n > 0 ? "+" : ""}${number(n)}`;
  const compact = n => { const a = Math.abs(n); return a >= 1e9 ? `${number(n / 1e9)}B` : a >= 1e6 ? `${number(n / 1e6)}M` : a >= 1e3 ? `${number(n / 1e3)}K` : number(n); };
  const timestamp = at => new Date(at).toLocaleString("zh-CN", { timeZone: "Asia/Shanghai" });
  function create() {
    const d = root.document;
    const el = (tag, text, cls) => { const n = d.createElement(tag); if (text != null) n.textContent = text; if (cls) n.className = cls; return n; };
    const button = (text, action) => { const b = el("button", text); b.type = "button"; b.onclick = action; return b; };
    const field = (text, input) => { const label = el("label", text); input.setAttribute("aria-label", text); label.append(input); return label; };
    const element = el("section", null, "asset-history"); element.setAttribute("aria-label", "资产历史与变化");
    const style = el("style"); style.textContent = `
.mwi-assets-panel .asset-history{margin-block:16px 24px;border-block:1px solid var(--assets-line);padding-block:14px}
.mwi-assets-panel .asset-history h3{font-size:14px;margin:0 0 12px}
.mwi-assets-panel .asset-history-toolbar{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-block:10px}
.mwi-assets-panel .asset-history-toolbar label{display:flex;gap:6px;align-items:center;flex-wrap:wrap}
.mwi-assets-panel .asset-history-toolbar select{max-width:100%}
.mwi-assets-panel .asset-history-stats{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin-block:14px}
.mwi-assets-panel .asset-history-stats span{display:block;color:var(--assets-muted);margin-bottom:6px}
.mwi-assets-panel .asset-history-stats strong{font-size:14px;font-variant-numeric:tabular-nums}
.mwi-assets-panel .asset-history-table{font:inherit;border-collapse:collapse;width:100%;font-variant-numeric:tabular-nums;min-width:480px}
.mwi-assets-panel .asset-history-table :is(td,th){padding:8px;text-align:right;border-bottom:1px solid var(--assets-line);white-space:nowrap}
.mwi-assets-panel .asset-history-table :is(td,th):first-child{text-align:left}
.mwi-assets-panel .asset-history-table th{background:var(--assets-header);color:var(--assets-muted);font-weight:500}
.mwi-assets-panel .asset-history-table .asset-history-total{font-weight:700;background:var(--assets-header)}
.mwi-assets-panel .asset-history-scroll{overflow:auto;max-width:100%;max-height:380px}
.mwi-assets-panel .asset-history .asset-up{color:#58cda5}.mwi-assets-panel .asset-history .asset-down{color:#ff8582}
.mwi-assets-panel .asset-history button[aria-pressed=true]{background:#164c66;border-color:#45c9ed;color:#d6f7ff}
.mwi-assets-panel .asset-history-chart{width:100%;height:300px;display:block;outline-offset:2px;touch-action:pan-y}
.mwi-assets-panel .asset-history-tooltip{min-height:36px;line-height:1.7;white-space:pre-line;font-variant-numeric:tabular-nums}
.mwi-assets-panel .asset-history-muted{color:var(--assets-muted);font-size:11px;line-height:1.7}
.mwi-assets-panel .asset-history-legend{display:flex;flex-wrap:wrap;gap:6px;margin-block:8px}
.mwi-assets-panel .asset-history-legend button::before{content:"";display:inline-block;width:8px;height:8px;border-radius:50%;margin-right:5px;background:var(--series-color)}
.mwi-assets-panel .asset-history-diff{margin-top:14px}.mwi-assets-panel .asset-history-diff summary{cursor:pointer}
@container assets-workspace (max-width:680px){.mwi-assets-panel .asset-history-stats{grid-template-columns:repeat(2,minmax(0,1fr))}.mwi-assets-panel .asset-history-chart{height:250px}}
`;
    const title = el("h3", "资产历史与分项变化"), note = el("p", null, "asset-history-muted"), stats = el("div", null, "asset-history-stats");
    const baselineSelect = el("select"), compareControls = el("div", null, "asset-history-toolbar"); compareControls.append(field("对比记录", baselineSelect));
    const comparison = el("div", null, "asset-history-scroll"); comparison.tabIndex = 0; comparison.setAttribute("aria-label", "分项资产变化，可横向滚动");
    const modes = el("div", null, "asset-history-toolbar"), ranges = el("div", null, "asset-history-toolbar"), legend = el("div", null, "asset-history-legend");
    modes.setAttribute("aria-label", "历史图类型"); ranges.setAttribute("aria-label", "历史日期范围");
    const from = el("input"), to = el("input"); from.type = to.type = "date";
    const dates = el("div", null, "asset-history-toolbar"); dates.append(field("起始日期", from), field("结束日期", to), button("重置缩放", () => { from.value = to.value = ""; paintChart(); }));
    const svg = d.createElementNS("http://www.w3.org/2000/svg", "svg"); svg.classList.add("asset-history-chart"); svg.setAttribute("viewBox", "0 0 960 300"); svg.setAttribute("role", "img"); svg.setAttribute("tabindex", "0");
    const tooltip = el("div", null, "asset-history-tooltip"), help = el("p", "按北京时间每天保留最后一次观测用于绘图；缺失日期不连线。悬停查看数值，聚焦图表后可用左右方向键查看记录。", "asset-history-muted");
    tooltip.setAttribute("aria-live", "polite");
    const dataDetails = el("details"), dataRows = el("div", null, "asset-history-scroll"); dataDetails.append(el("summary", "查看图表数据"), dataRows);
    const diff = el("details", null, "asset-history-diff"), diffCategory = el("select"), diffBody = el("div", null, "asset-history-scroll"), diffNote = el("p");
    diff.append(el("summary", "查看分项中的物品变化"), field("变化分项", diffCategory), diffNote, diffBody);
    for (const [id, text] of Object.entries(history.categories).filter(([id]) => id !== "total")) { const option = el("option", text); option.value = id; diffCategory.append(option); }
    diffCategory.value = "inventory";
    element.append(style, title, note, stats, compareControls, comparison, modes, ranges, dates, legend, svg, tooltip, help, dataDetails, diff);
    let state = {}, model = null, baseline = null, baselineId = "", mode = "total", days = "all", visible = [], selected = 0, lastScope = "", graphSeries = [], signature = "";
    const enabled = new Set(Object.keys(colors).filter(id => id !== "total")), modeButtons = {}, rangeButtons = {};
    for (const [id, text] of [["total", "总资产"], ["daily", "每日资产变化"], ["categories", "分项资产"]]) { const b = button(text, () => { mode = id; paintChart(); }); modeButtons[id] = b; modes.append(b); }
    for (const value of [7, 15, 30, "all"]) { const b = button(value === "all" ? "全部" : `${value}天`, () => { days = value; from.value = to.value = ""; paintChart(); }); rangeButtons[value] = b; ranges.append(b); }
    const signClass = n => n > 0 ? "asset-up" : n < 0 ? "asset-down" : "";
    function table(headers) {
      const t = el("table", null, "asset-history-table"), h = el("thead"), r = el("tr"), body = el("tbody");
      for (const text of headers) { const th = el("th", text); th.scope = "col"; r.append(th); } h.append(r); t.append(h, body); return { t, body };
    }
    function paintComparison() {
      const rows = history.comparison(model.current, baseline), total = rows[0];
      stats.replaceChildren();
      for (const [label, value, percent] of [["较对比记录变化", total.amount], ["较对比记录比例", total.percent, true], ["当日资产变化", model.today], [`近 7 天日均变化 · ${model.averageDays} 天有效`, model.average]]) {
        const cell = el("div"); cell.append(el("span", label), el("strong", `${signed(value)}${percent && value != null ? "%" : ""}`, signClass(value))); stats.append(cell);
      }
      const { t, body } = table(["项目", "当前", "变化", "比例"]);
      for (const row of rows) {
        const tr = el("tr", null, row.id === "total" ? "asset-history-total" : ""), name = el("td");
        const identity = row.id === "cash" ? app.itemUI.identity({ itemHrid: "/items/coin" }, state.spriteBase, history.categories[row.id]) : el("span", history.categories[row.id]);
        if (row.id !== "total") { const b = button(null, () => { diffCategory.value = row.id; diff.open = true; paintDiff(); diff.scrollIntoView({ block: "nearest" }); }); b.append(identity); name.append(b); } else name.append(identity);
        tr.dataset.historyCategory = row.id;
        tr.append(name, el("td", number(row.current)), el("td", signed(row.amount), signClass(row.amount)), el("td", row.percent == null ? "—" : `${signed(row.percent)}%`, signClass(row.percent))); body.append(tr);
      }
      comparison.replaceChildren(t); paintDiff();
    }
    function paintDiff() {
      if (!model) return;
      const rows = history.itemChanges(model.current, baseline, diffCategory.value);
      diffNote.textContent = rows == null ? "缺少完整的对比记录，暂不能计算该分项变化。" : `数量与价值均按各自记录计算；包含数量和价格共同造成的变化。${rows.length > 200 ? `共 ${rows.length} 项，显示变化最大的 200 项。` : ""}`;
      const { t, body } = table(["物品", "原数量 → 当前", "原价值", "当前价值", "变化"]);
      for (const row of (rows || []).slice(0, 200)) {
        const tr = el("tr"), name = el("td"); name.append(app.itemUI.identity(row, state.spriteBase, `${state.names?.[row.itemHrid] || row.name}${row.enhancementLevel ? ` +${row.enhancementLevel}` : ""}`));
        if (row.houseRoomHrid) name.append(el("small", ` · ${row.houseRoomHrid.split("/").pop()}`));
        tr.append(name, el("td", `${number(row.previousCount)} → ${number(row.currentCount)}`), el("td", number(row.previous)), el("td", number(row.current)), el("td", signed(row.amount), signClass(row.amount))); body.append(tr);
      }
      diffBody.replaceChildren(rows?.length ? t : el("p", rows ? "该分项没有变化。" : "—"));
    }
    function pointValue(point, id) { return mode === "daily" ? point.delta : point.values[id]; }
    function showPoint(index) {
      selected = Math.max(0, Math.min(visible.length - 1, index));
      const point = visible[selected];
      tooltip.textContent = point ? `${timestamp(point.at)} · ${graphSeries.map(id => `${mode === "daily" ? "每日资产变化" : history.categories[id]} ${number(pointValue(point, id))}`).join(" · ")}` : "所选日期范围没有记录。";
    }
    function paintChart() {
      if (!model) return;
      for (const [id, b] of Object.entries(modeButtons)) b.setAttribute("aria-pressed", String(id === mode));
      for (const [id, b] of Object.entries(rangeButtons)) b.setAttribute("aria-pressed", String(id === String(days)));
      legend.replaceChildren();
      if (mode === "categories") for (const [id, title] of Object.entries(history.categories).filter(([id]) => id !== "total")) {
        const b = button(title, () => { enabled.has(id) ? enabled.delete(id) : enabled.add(id); paintChart(); });
        if (id === "cash") b.replaceChildren(app.itemUI.identity({ itemHrid: "/items/coin" }, state.spriteBase, title));
        b.style.setProperty("--series-color", colors[id]); b.setAttribute("aria-pressed", String(enabled.has(id))); legend.append(b);
      }
      graphSeries = mode === "categories" ? [...enabled] : ["total"];
      visible = history.range(mode === "daily" ? model.daily : model.points, days, model.current?.at).filter(p => (!from.value || p.day >= from.value) && (!to.value || p.day <= to.value));
      const ns = "http://www.w3.org/2000/svg";
      const shape = (tag, attrs, text) => { const n = d.createElementNS(ns, tag); for (const [key, value] of Object.entries(attrs)) n.setAttribute(key, value); if (text != null) n.textContent = text; svg.append(n); return n; };
      const width = Math.max(350, svg.clientWidth), left = 65, right = width - 18, center = (left + right) / 2;
      svg.setAttribute("viewBox", `0 0 ${width} 300`);
      svg.replaceChildren(); svg.setAttribute("aria-label", `${modeButtons[mode].textContent}，${visible.length} 条每日记录；使用左右方向键查看`);
      const allValues = visible.flatMap(p => graphSeries.map(id => pointValue(p, id))).filter(n => n != null);
      const lo = allValues.length ? Math.min(...allValues, ...(mode === "daily" ? [0] : [])) : 0, hi = allValues.length ? Math.max(...allValues, ...(mode === "daily" ? [0] : [])) : 1;
      const pad = Math.max((hi - lo) * 0.1, Math.abs(hi) * 0.01, 1), min = lo - pad, max = hi + pad;
      const firstDay = visible.length ? history.dayNumber(visible[0].at) : 0, lastDay = visible.length ? history.dayNumber(visible.at(-1).at) : 0;
      const x = p => lastDay === firstDay ? center : left + (history.dayNumber(p.at) - firstDay) / (lastDay - firstDay) * (right - left);
      const y = v => 260 - (v - min) / (max - min) * 235;
      for (let i = 0; i <= 4; i++) {
        const v = min + (max - min) * i / 4, yy = y(v);
        shape("line", { x1: left, x2: right, y1: yy, y2: yy, stroke: "var(--assets-line)" });
        shape("text", { x: left - 8, y: yy + 4, "text-anchor": "end", fill: "var(--assets-muted)", "font-size": 12 }, compact(v));
      }
      const tickCount = Math.min(width < 600 ? 4 : 6, visible.length);
      const ticks = [...new Set(Array.from({ length: tickCount }, (_, i) => Math.round(i * (visible.length - 1) / Math.max(1, tickCount - 1))))];
      for (const i of ticks) shape("text", { x: x(visible[i]), y: 285, "text-anchor": "middle", fill: "var(--assets-muted)", "font-size": 12 }, visible[i].day.slice(5));
      for (const id of graphSeries) {
        let path = "", previous = null;
        for (const p of visible) {
          const value = pointValue(p, id);
          if (value == null) { previous = null; continue; }
          const connected = previous && history.dayNumber(p.at) - history.dayNumber(previous.at) === 1;
          path += `${connected ? "L" : "M"}${x(p)},${y(value)} `;
          shape("circle", { cx: x(p), cy: y(value), r: 3, fill: colors[id] }); previous = p;
        }
        shape("path", { d: path, fill: "none", stroke: colors[id], "stroke-width": 2, "vector-effect": "non-scaling-stroke" });
      }
      if (!allValues.length) shape("text", { x: center, y: 145, "text-anchor": "middle", fill: "var(--assets-muted)", "font-size": 14 }, visible.length ? "暂无完整估值可绘制" : "此范围内暂无历史记录");
      else if (visible.length === 1) shape("text", { x: center, y: 18, "text-anchor": "middle", fill: "var(--assets-muted)", "font-size": 12 }, "已开始记录，跨日后可查看变化趋势");
      const { t, body } = table(["记录时间（北京时间）", ...graphSeries.map(id => mode === "daily" ? "每日资产变化" : history.categories[id])]);
      for (const p of visible) { const tr = el("tr"); tr.append(el("td", timestamp(p.at)), ...graphSeries.map(id => el("td", number(pointValue(p, id))))); body.append(tr); }
      dataRows.replaceChildren(t); showPoint(visible.length - 1);
      svg.onpointermove = event => {
        if (!visible.length) return;
        const bounds = svg.getBoundingClientRect(), ratio = (event.clientX - bounds.left) / bounds.width;
        const targetDay = firstDay + (ratio * width - left) / (right - left) * (lastDay - firstDay);
        let nearest = 0; for (let i = 1; i < visible.length; i++) if (Math.abs(history.dayNumber(visible[i].at) - targetDay) < Math.abs(history.dayNumber(visible[nearest].at) - targetDay)) nearest = i;
        showPoint(nearest);
      };
    }
    svg.onkeydown = event => { if (["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) { event.preventDefault(); showPoint(event.key === "Home" ? 0 : event.key === "End" ? visible.length - 1 : selected + (event.key === "ArrowRight" ? 1 : -1)); } };
    from.onchange = to.onchange = paintChart; diffCategory.onchange = paintDiff;
    baselineSelect.onchange = () => { baselineId = baselineSelect.value; baseline = [model.first, ...model.points].find(p => p?.id === baselineId) || null; paintComparison(); };
    let resizeWidth = 0;
    const observer = new root.ResizeObserver(entries => { const w = entries[0].contentRect.width; if (w > 0 && w !== resizeWidth) { resizeWidth = w; paintChart(); } }); observer.observe(svg);
    return { element, destroy() { observer.disconnect(); }, update(value) {
      state = value;
      if (!state.current?.config || state.current.snapshot.schema !== 2) { element.hidden = true; signature = ""; return; }
      element.hidden = false;
      const scope = `${state.current.snapshot.server}:${state.current.snapshot.characterId}`;
      if (scope !== lastScope) { baselineId = ""; days = "all"; from.value = to.value = ""; lastScope = scope; diff.open = false; }
      const next = JSON.stringify([state.current.snapshot.fingerprint, state.current.snapshot.rulesId, history.dayKey(state.current.snapshot.observedAt), state.data?.entries?.map(e => e.snapshot.id), state.data?.first?.snapshot.id, state.names, state.error]);
      if (next === signature) return; signature = next;
      model = history.build(state.data?.entries || [], state.current, "native", state.data?.first);
      const options = [...new Map([model.first, ...model.points].filter(p => p && p.at < model.current.at).map(p => [p.id, p])).values()];
      baseline = options.find(p => p.id === baselineId) || model.baseline; baselineId = baseline?.id || "";
      baselineSelect.replaceChildren();
      if (!options.length) { const o = el("option", "尚无较早的同口径记录"); o.value = ""; baselineSelect.append(o); }
      for (const p of options) { const o = el("option", timestamp(p.at)); o.value = p.id; baselineSelect.append(o); }
      baselineSelect.value = baselineId; baselineSelect.disabled = !options.length;
      note.textContent = ["使用各次采集时的游戏原生市场价格；资产变化包含市价波动，不等同于交易利润。", state.data?.legacyCount ? `另保留 ${state.data.legacyCount} 条旧报价记录，可从备份导出；不混入本图。` : "", state.error || "", model.current.values.total == null ? "当前总资产尚未完整估值，图表与比较中显示为 —。" : ""].filter(Boolean).join(" ");
      paintComparison(); paintChart();
    } };
  }
  app.assetHistoryUI = Object.freeze({ create });
})(globalThis);


// ---- source/ui/assets-ui.js ----
(function initAssetUI(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin, core = root.MWILayuAssets.core;
  const labels = { cash: "金币", inventory: "库存", equipped: "穿戴装备", other: "其他位置", market: "市场资产", houses: "房屋" };
  const roomNames = { dairy_barn: "牛棚", garden: "花园", log_shed: "伐木屋", forge: "锻造厂", workshop: "工坊", sewing_parlor: "缝纫室", kitchen: "厨房", brewery: "酿造厂", laboratory: "实验室", observatory: "天文台", dining_room: "餐厅", library: "图书馆", dojo: "道场", armory: "军械库", gym: "健身房", archery_range: "射箭场", mystical_study: "神秘研究室" };
  const money = n => n == null ? "未估值" : n.toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  const time = n => typeof n === "number" && n > 0 ? new Date(n).toLocaleString("zh-CN") : "尚未保存";
  function create({ onRefresh, onExport, onImport }) {
    const document = root.document;
    const el = (tag, text, cls) => { const node = document.createElement(tag); if (text != null) node.textContent = text; if (cls) node.className = cls; return node; };
    const element = el("section", null, "mwi-assets-panel mwi-assets-panel"); element.id = "mwi-assets-panel";
    element.hidden = true; element.setAttribute("role", "tabpanel"); element.setAttribute("aria-label", "资产");
    const style = el("style"); style.textContent = `
.mwi-assets-panel .asset-header{padding:10px 14px;display:flex;flex-wrap:wrap;align-items:center;gap:12px;background:var(--assets-header);border-bottom:1px solid var(--assets-line)}
.mwi-assets-panel .asset-header h2{margin:0;margin-right:auto}
.mwi-assets-panel .asset-body{overflow:auto;min-height:0;flex:1;padding:14px}
.mwi-assets-panel .asset-summary{display:flex;flex-wrap:wrap;gap:10px 28px;margin:8px 0 14px;font-variant-numeric:tabular-nums}
.mwi-assets-panel .asset-summary strong{font-size:14px}
.mwi-assets-panel .asset-categories{display:flex;flex-wrap:wrap;gap:6px;padding-block:8px;border-block:1px solid var(--assets-line)}
.mwi-assets-panel .asset-controls{display:flex;align-items:center;flex-wrap:wrap;gap:10px;margin-block:12px}
.mwi-assets-panel .asset-controls label{display:flex;gap:6px;align-items:center}
.mwi-assets-panel .asset-table{font:inherit;width:100%;border-collapse:collapse;font-variant-numeric:tabular-nums;min-width:690px}
.mwi-assets-panel .asset-table :is(th,td){padding:8px;text-align:left;border-bottom:1px solid var(--assets-line);vertical-align:top}
.mwi-assets-panel .asset-table th{color:var(--assets-muted);font-weight:500;background:var(--assets-header);position:sticky;top:0}
.mwi-assets-panel .asset-table .asset-number{text-align:right;white-space:nowrap}
.mwi-assets-panel .asset-table td:first-child{min-width:170px;max-width:300px;overflow-wrap:anywhere}
.mwi-assets-panel .asset-table td small{display:block;color:var(--assets-muted);font-size:11px}
.mwi-assets-panel .asset-scroll{overflow:auto;max-width:100%;max-height:540px}
.mwi-assets-panel .asset-warning{color:#fbbf24;white-space:pre-line;overflow-wrap:anywhere}
.mwi-assets-panel .asset-empty{padding:24px 0}
.mwi-assets-panel .asset-pager{display:flex;gap:12px;align-items:center;margin-block:12px;flex-wrap:wrap}
.mwi-assets-panel .asset-houses>details{border-bottom:1px solid var(--assets-line);padding:10px 0}
.mwi-assets-panel .asset-houses summary{font-size:12px;line-height:1.8}
.mwi-assets-panel .asset-backup{border-top:1px solid var(--assets-line);margin-top:20px;padding-top:12px}
.mwi-assets-panel .asset-backup p{max-width:72ch}
.mwi-assets-panel .mwi-assets-item-icon{width:20px;height:20px;flex-shrink:0}
.mwi-assets-panel .mwi-assets-item-label{display:inline-flex;align-items:center;gap:5px}
@container assets-workspace (max-width:480px){.mwi-assets-panel .asset-body{padding:10px}.mwi-assets-panel .asset-controls label{width:100%}.mwi-assets-panel .asset-controls input{flex:1;min-width:0}}
`;
    const header = el("header", null, "asset-header"), refresh = el("button", "重新采集并更新行情"); refresh.type = "button";
    header.append(el("h2", "资产总览"), refresh);
    const body = el("div", null, "asset-body"), status = el("p"), warning = el("p", null, "asset-warning"); warning.setAttribute("role", "status");
    const summary = el("div", null, "asset-summary"), categories = el("nav", null, "asset-categories"); categories.setAttribute("aria-label", "资产分类");
    const controls = el("div", null, "asset-controls"), query = el("input"), policy = el("select"), sort = el("select");
    query.type = "search"; query.placeholder = "物品名称或标识";
    function field(title, input) { const label = el("label", title); label.append(input); return label; }
    for (const [value, title] of [["native", "游戏原生市场价格"]]) { const option = el("option", title); option.value = value; policy.append(option); }
    for (const [value, title] of [["value", "价值从高到低"], ["name", "物品名称"], ["missing", "未估值优先"]]) { const option = el("option", title); option.value = value; sort.append(option); }
    const sortField = field("排序", sort);
    controls.append(field("搜索", query), field("估值口径", policy), sortField);
    const note = el("p", "按游戏原生市场价格估值，不保证全部库存能按此价成交。房屋按当前材料价格计算从零建到当前等级的重建价值。");
    const results = el("div"), pager = el("div", null, "asset-pager"), prev = el("button", "上一页"), next = el("button", "下一页"), pageLabel = el("span");
    prev.type = next.type = "button"; pager.append(prev, pageLabel, next);
    const backup = el("details", null, "asset-backup"); backup.append(el("summary", "数据保存、同步与备份"));
    backup.append(el("p", "数据仅保存在当前浏览器。同一游戏域名下，兼容插件共用资产记录；多个页面只由一个采集者写入同一角色。不同域名或浏览器可通过备份迁移，服务器和角色记录始终分开。"));
    backup.append(el("p", "保存物品位置与数量、订单、房屋逐级材料、行情时间及配置版本。变化时保存完整快照，无变化每五分钟留存一次。未观察到的离线过程不会补造。"));
    const usage = el("p"); backup.append(usage);
    const exportButton = el("button", "导出当前角色资产备份"), file = el("input"), importStatus = el("p"), apply = el("button", "合并导入记录");
    exportButton.type = apply.type = "button"; apply.hidden = true; file.type = "file"; file.accept = ".json,application/json";
    const backupControls = el("div", null, "asset-controls"); backupControls.append(exportButton, field("选择资产备份", file), apply); backup.append(backupControls, importStatus);
    const historyView = app.assetHistoryUI.create();
    body.append(status, warning, summary, note, historyView.element, el("h3", "当前资产明细"), categories, controls, results, pager, backup); element.append(style, header, body); document.body.append(element);
    let state = {}, category = "all", page = 0, tableSignature = "", importData = null, stopped = false;
    let filterButtons = {}, roomOpen = new Set();
    const roomLabel = house => roomNames[house.houseRoomHrid.split("/").pop()] || house.name;
    function sprite() {
      for (const use of document.querySelectorAll('use[href*="items_sprite"],use[xlink\\:href*="items_sprite"]')) {
        const url = new URL(use.getAttribute("href") || use.getAttribute("xlink:href"), root.location.href);
        if (url.origin === root.location.origin && /^\/static\/media\/items_sprite\.[a-z0-9]+\.svg$/.test(url.pathname)) return url.pathname;
      }
      return "";
    }
    function table(lines, spriteBase) {
      const region = el("div", null, "asset-scroll"); region.tabIndex = 0; region.setAttribute("role", "region"); region.setAttribute("aria-label", "资产明细，可横向滚动");
      const table = el("table", null, "asset-table"), head = el("thead"), row = el("tr"), body = el("tbody");
      for (const name of ["物品 / 强化等级", "归属", "数量", "参考单价", "价值", "行情依据"]) { const th = el("th", name); th.scope = "col"; row.append(th); }
      head.append(row); table.append(head, body); region.append(table);
      for (const line of lines) {
        const tr = el("tr"), nameCell = el("td");
        const name = state.names?.[line.itemHrid] || line.name;
        nameCell.append(app.itemUI.identity(line, spriteBase, name + (line.enhancementLevel ? ` +${line.enhancementLevel}` : "")));
        const location = line.houseRoomHrid ? roomNames[line.houseRoomHrid.split("/").pop()] || line.houseRoomHrid : line.category === "inventory" ? "库存" : line.category === "cash" ? "随身" : line.category === "equipped" ? "穿戴装备" : line.location;
        const locationCell = el("td", location); locationCell.title = line.location; if (line.listingId) locationCell.append(el("small", `订单 ${line.listingId}`));
        const basis = el("td", line.reason || (line.itemHrid === core.coin ? "实际金额" : `${state.snapshot.nativeMarket?.source || "游戏原生价格缺失"}`));
        if (line.itemHrid !== core.coin && state.snapshot.nativeMarket?.observedAt) basis.append(el("small", `采集 ${time(state.snapshot.nativeMarket.observedAt)}`));
        tr.append(nameCell, locationCell, el("td", line.count == null ? "未知" : money(line.count), "asset-number"),
          el("td", money(line.price), "asset-number"), el("td", money(line.subtotal), "asset-number"), basis);
        body.append(tr);
      }
      return region;
    }
    function render() {
      if (stopped) return;
      const { snapshot, config, savedAt, error, live } = state;
      usage.textContent = state.storageUsage ? `当前游戏站点存储已用 ${money(state.storageUsage.usage / 1024 / 1024)} MB / 配额 ${money(state.storageUsage.quota / 1024 / 1024)} MB（包括其他游戏数据）。${state.storageUsage.usage >= state.storageUsage.quota * 0.8 ? "空间接近配额，请及时导出备份。" : ""}` : "浏览器可能清理站点存储，建议定期导出备份。";
      status.textContent = snapshot ? `${snapshot.server} · 角色 ${snapshot.characterId} · 采集 ${time(snapshot.observedAt)} · 保存 ${time(savedAt)}${live ? "" : " · 上次记录"}` : "等待角色数据";
      warning.textContent = error || "";
      if (!snapshot || !config) {
        historyView.update({}); summary.replaceChildren(); categories.replaceChildren(); filterButtons = {}; results.replaceChildren(el("p", "进入游戏后会自动采集全部资产，无需逐件打开物品。", "asset-empty"));
        controls.hidden = pager.hidden = true; tableSignature = ""; return;
      }
      controls.hidden = false; sortField.hidden = category === "houses";
      const valuation = core.evaluate(snapshot, config, policy.value), base = sprite();
      const stale = snapshot.nativeMarket?.observedAt && Date.now() - snapshot.nativeMarket.observedAt >= 300000;
      historyView.update({ current: { snapshot, config }, data: state.historyData, error: state.historyError, names: state.names, spriteBase: base });
      warning.textContent = [error, ...valuation.issues, valuation.unpriced ? `${valuation.unpriced} 项未估值；合计只包含已知价值。` : "", stale ? "原生价格已超过五分钟未成功刷新，请留意采集时间。" : ""].filter(Boolean).join("\n");
      summary.replaceChildren(el("strong", `${valuation.complete ? "总资产" : "已估值合计"} ${money(valuation.knownTotal)}`), el("span", `非房屋资产 ${money(valuation.knownTotal == null ? null : valuation.knownTotal - valuation.totals.houses)}`), el("span", `房屋重建 ${money(valuation.totals.houses)}`));
      for (const [id, title] of [["all", "全部"], ...Object.entries(labels)]) {
        if (!filterButtons[id]) {
          const button = el("button"); button.type = "button"; button.dataset.assetCategory = id;
          button.onclick = () => { category = id; page = 0; render(); }; filterButtons[id] = button; categories.append(button);
        }
        if (id === "cash") filterButtons[id].replaceChildren(app.itemUI.identity({ itemHrid: core.coin }, base, title), document.createTextNode(` ${money(valuation.totals[id])}`));
        else filterButtons[id].textContent = `${title}${id === "all" ? "" : ` ${money(valuation.totals[id])}`}`;
        filterButtons[id].setAttribute("aria-pressed", String(category === id));
      }
      const sig = JSON.stringify([snapshot.fingerprint, snapshot.rulesId, state.names, category, policy.value, query.value, sort.value, page, base]);
      if (sig === tableSignature) return;
      tableSignature = sig;
      for (const details of results.querySelectorAll("details[data-room]")) { if (details.open) roomOpen.add(details.dataset.room); else roomOpen.delete(details.dataset.room); }
      const scroll = results.querySelector(".asset-scroll"), x = scroll?.scrollLeft || 0, y = scroll?.scrollTop || 0;
      const search = query.value.trim().toLowerCase();
      const matches = row => !search || `${state.names?.[row.itemHrid] || row.name} ${row.itemHrid}`.toLowerCase().includes(search);
      results.replaceChildren();
      if (category === "houses") {
        const houses = el("div", null, "asset-houses");
        for (const house of valuation.houses.filter(h => !search || `${roomLabel(h)} ${h.houseRoomHrid}`.toLowerCase().includes(search) || h.lines.some(matches))) {
          const details = el("details"); details.dataset.room = house.houseRoomHrid; details.open = roomOpen.has(house.houseRoomHrid);
          details.append(el("summary", `${roomLabel(house)} · ${house.level ?? "未知"} 级 · ${money(house.known)}${house.complete ? "" : " + 未估值"}`));
          details.append(el("p", `累计 0 → ${house.level ?? "未知"} 级的全部材料；已消耗材料只计入房屋价值，不再计入库存。`));
          details.append(table(house.lines, base));
          for (const level of house.levels) {
            const detail = el("details"); detail.append(el("summary", `${level.level - 1} → ${level.level} 级材料`));
            detail.append(table(level.materials.filter(row => row.count !== 0).map(row => {
              const priceLine = house.lines.find(line => core.key(line) === core.key(row));
              return { ...priceLine, ...row, subtotal: row.count != null && priceLine?.price != null ? core.amount(row.count * priceLine.price) : null };
            }), base)); details.append(detail);
          }
          houses.append(details);
        }
        results.append(houses.children.length ? houses : el("p", "没有符合条件的已建造房屋。", "asset-empty")); pager.hidden = true;
      } else {
        const lines = valuation.lines.filter(row => (category === "all" || row.category === category) && matches(row));
        lines.sort((a, b) => sort.value === "name" ? (state.names?.[a.itemHrid] || a.name).localeCompare(state.names?.[b.itemHrid] || b.name, "zh") : sort.value === "missing" && (a.subtotal == null) !== (b.subtotal == null) ? (a.subtotal == null ? -1 : 1) : (b.subtotal ?? -1) - (a.subtotal ?? -1));
        const pages = Math.max(1, Math.ceil(lines.length / 100)); page = Math.min(page, pages - 1);
        results.append(lines.length ? table(lines.slice(page * 100, (page + 1) * 100), base) : el("p", "没有符合条件的资产。", "asset-empty"));
        pager.hidden = !lines.length; prev.disabled = page === 0; next.disabled = page >= pages - 1; pageLabel.textContent = `第 ${page + 1} / ${pages} 页 · ${lines.length} 项`;
      }
      const nextScroll = results.querySelector(".asset-scroll"); if (nextScroll) { nextScroll.scrollLeft = x; nextScroll.scrollTop = y; }
    }
    query.oninput = policy.onchange = sort.onchange = () => { page = 0; render(); };
    prev.onclick = () => { page = Math.max(0, page - 1); render(); }; next.onclick = () => { page++; render(); };
    refresh.onclick = async () => { refresh.disabled = true; try { await onRefresh(); } catch (e) { warning.textContent = e.message; } finally { refresh.disabled = false; } };
    exportButton.onclick = async () => {
      exportButton.disabled = true;
      try {
        const data = await onExport(); const blob = new Blob([JSON.stringify(data)], { type: "application/json" });
        const url = URL.createObjectURL(blob), link = el("a"); link.href = url; link.download = `mwi-assets-${data.scope.server}-${data.scope.characterId}-${Date.now()}.json`;
        link.click(); root.setTimeout(() => URL.revokeObjectURL(url), 1000); importStatus.textContent = `已导出 ${data.snapshots.length} 条资产快照。`;
      } catch (e) { importStatus.textContent = `导出失败：${e.message}`; } finally { exportButton.disabled = false; }
    };
    file.onchange = async () => {
      importData = null; apply.hidden = true; const selected = file.files[0]; if (!selected) return;
      try {
        if (selected.size > 25 * 1024 * 1024) throw new Error("请选择不超过 25 MB 的资产备份");
        const data = JSON.parse(await selected.text()), preview = await onImport(data, false);
        importData = data; apply.hidden = false; importStatus.textContent = `${preview.server} · 角色 ${preview.characterId} · ${preview.count} 条快照。合并会去重，并保留较新的当前记录。`;
      } catch (e) { importStatus.textContent = `无法读取备份：${e.message}`; }
    };
    apply.onclick = async () => {
      if (!importData) return; apply.disabled = true;
      try { const result = await onImport(importData, true); importStatus.textContent = `已合并 ${result.count} 条快照；重复记录不会增加。`; importData = null; apply.hidden = true; file.value = ""; }
      catch (e) { importStatus.textContent = `导入失败，未写入数据：${e.message}`; } finally { apply.disabled = false; }
    };
    return { element, render, update(value) { state = value; if (!element.hidden) render(); }, destroy() { stopped = true; historyView.destroy(); } };
  }
  app.assetUI = Object.freeze({ create });
})(globalThis);


// ---- source/runtime/application.js ----
(function initAssetsApplication(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin, { core, store } = root.MWILayuAssets;
  function create() {
    let db = null, stopped = false, pending = null, scheduled = 0, currentScope = null;
    let snapshot = null, config = null, savedAt = null, error = "", live = false, configText = null, normalizedRules = null;
    let signature = "", nativeHost = null, syncPending = false;
    let historyData = null, historyError = "", historyRevision = 0, historyAt = 0, historyPending = null, historyDirty = true;
    const ownerId = root.crypto.randomUUID();
    const server = `${/^test\./.test(root.location.hostname) ? "api-test" : "api"}.${root.location.hostname.includes("milkywayidlecn") ? "milkywayidlecn" : "milkywayidle"}.com`;
    let storageUsage = null, usageAt = 0;
    const names = {}; let namesPending = false, nextNamesAt = 0;
    const native = root.MWILayuAssets.nativePrices.create({ decompress: app.wageLZ.decompressFromUTF16, onChange: schedule });
    const view = app.assetUI.create({ onRefresh: refresh, onExport: exportBackup, onImport: importBackup });
    const element = view.element;
    function render() {
      if (stopped) return;
      const signatureNext = JSON.stringify([snapshot, config, savedAt, error, live, names, storageUsage, historyRevision, historyError]);
      if (signatureNext === signature) return;
      signature = signatureNext;
      view.update({ snapshot, config, savedAt, error, live, names, storageUsage, historyData, historyError });
    }
    const ready = store.open().then(value => {
      if (stopped) { value.close(); return null; } db = value; return value;
    }).catch(cause => { error = `资产保存不可用：${cause.message}。请检查浏览器存储权限并刷新。`; render(); return null; });
    async function loadHistory(force = false) {
      if (stopped || !db || !currentScope || element.hidden || historyPending || !force && (!historyDirty || Date.now() - historyAt < 60000)) return;
      const scope = currentScope; historyAt = Date.now(); historyDirty = false;
      historyPending = store.readHistory(db, scope).then(result => {
        if (!stopped && currentScope === scope) { historyData = result; historyError = ""; historyRevision++; render(); }
      }).catch(cause => {
        if (!stopped && currentScope === scope) { historyError = `历史记录读取失败：${cause.message}，请重新采集后重试。`; historyDirty = true; render(); }
      }).finally(() => { historyPending = null; if (!stopped && currentScope !== scope) loadHistory(true); });
      return historyPending;
    }
    async function loadSaved() {
      historyDirty = true;
      if (syncPending || !db || !currentScope || stopped) return;
      syncPending = true;
      const scope = currentScope;
      try {
        const result = await store.readLatest(db, scope);
        if (!stopped && currentScope === scope && result && (!snapshot || result.observedAt >= snapshot.observedAt)) {
          snapshot = result.snapshot; config = result.config; savedAt = result.observedAt; render();
        }
      } catch (cause) { error = `资产同步失败：${cause.message}`; render(); }
      finally { syncPending = false; loadHistory(); }
    }
    const connection = store.connect(loadSaved);
    function readRules() {
      const raw = root.localStorage.getItem("initClientData") || "";
      if (raw !== configText || !normalizedRules) {
        if (!raw) throw new Error("尚未收到游戏物品与房屋配置");
        const parsed = JSON.parse(raw.trimStart().startsWith("{") ? raw : app.wageLZ.decompressFromUTF16(raw) || raw);
        normalizedRules = core.rules(parsed); configText = raw;
      }
      return normalizedRules;
    }
    function resolveNames() {
      if (!snapshot || !config || namesPending || Date.now() < nextNamesAt) return;
      const missing = core.references(snapshot, config).map(row => row.itemHrid).filter(hrid => !names[hrid]);
      if (!missing.length) return;
      namesPending = true; nextNamesAt = Date.now() + 30000;
      app.gameBridge.itemNames([...new Set(missing)].slice(0, 1000)).then(found => {
        if (!stopped) { Object.assign(names, found); render(); }
      }).catch(() => {}).finally(() => { namesPending = false; });
    }
    async function capture() {
      if (stopped || pending) return pending;
      pending = (async () => {
        try {
          const response = await app.gameBridge.request({ action: "asset-state" });
          if (stopped) return;
          if (!response.accepted || !response.assetState) {
            // Never show another character's records when the current owner is unknown.
            currentScope = null; snapshot = null; config = null; savedAt = null; live = false; historyData = null; historyRevision++; historyError = ""; historyAt = 0; historyDirty = true;
            error = "尚未读取到当前角色，请进入游戏后重试。"; render(); return;
          }
          const state = response.assetState, nextScope = core.scope({ server, characterId: state.characterId });
          if (!currentScope || core.canonical(currentScope) !== core.canonical(nextScope)) {
            currentScope = nextScope; snapshot = null; config = null; savedAt = null; historyData = null; historyRevision++; historyError = ""; historyAt = 0; historyDirty = true;
          }
          live = true;
          await ready;
          if (stopped) return;
          if (db && !await store.lease(db, ownerId, currentScope)) { await loadSaved(); resolveNames(); return; }
          native.readGameCache();
          const nextConfig = readRules(), quotes = {}, nativeMarket = native.state();
          for (const row of core.references(state, nextConfig)) {
            quotes[core.key(row)] = { ask: null, bid: null, at: null, source: "", stale: false, native: native.quote(row) };
          }
          const prepared = await store.prepare({ schema: 2, ...currentScope, ...state, quotes, nativeMarket }, nextConfig);
          if (stopped) return;
          snapshot = prepared.record; config = prepared.config.data;
          error = db ? (nativeMarket.error ? `游戏原生价格更新失败：${nativeMarket.error}，保留已验证价格。` : "") : "资产当前仅在内存中，保存不可用；请检查存储权限并刷新。";
          if (db) {
            const result = await store.savePrepared(db, prepared);
            if (result.latest) savedAt = snapshot.observedAt;
            if (result.saved) { historyDirty = true; connection.announce(); }
            if (root.navigator?.storage?.estimate && Date.now() - usageAt > 60000) {
              usageAt = Date.now();
              root.navigator.storage.estimate().then(value => { if (!stopped && Number.isFinite(value.usage) && value.quota > 0) { storageUsage = value; render(); } }).catch(() => {});
            }
          }
          render(); resolveNames(); loadHistory();
        } catch (cause) {
          live = false; error = `资产采集或保存失败：${cause.message}。请点击重新采集；已有保存记录不会被删除。`;
          await loadSaved(); render();
        }
      })().finally(() => { pending = null; });
      return pending;
    }
    function schedule() {
      if (stopped || scheduled) return;
      scheduled = root.setTimeout(() => { scheduled = 0; capture(); }, 300);
    }
    async function refresh() { await native.refresh(); await capture(); await loadHistory(true); }
    async function exportBackup() {
      await ready;
      if (!db || !currentScope) throw new Error("暂无可导出的已保存角色数据");
      return store.exportData(db, currentScope);
    }
    async function importBackup(data, apply) {
      await ready;
      if (!db) throw new Error("资产数据库不可用，请刷新后重试");
      if (!apply) { const result = await store.validateImport(data); return { ...result.owner, count: result.prepared.length }; }
      const result = await store.importData(db, data); connection.announce(); await loadSaved(); await loadHistory(true); return result;
    }
    const panel = { element, hideNative() { element.hidden = true; }, openNative() { element.hidden = false; view.render(); capture(); loadHistory(true); },
      mountNative(host) { nativeHost = host; element.hidden = true; host.append(element); },
      isNativeMounted() { return element.isConnected && element.parentElement === nativeHost; },
      restoreOverlay() { nativeHost = null; element.hidden = true; root.document.body.append(element); }, disableFallback() {}, enableFallback() {}, open() {} };
    const sidebar = app.sidebarIntegration.createController({ panel, i18n: { language: "zh", t: () => "资产" },
      owner: "mwi-assets", tabMarker: "mwiAssetsTab", displayKey: "mwiAssetsPreviousDisplay",
      isOwnedTab: node => node?.dataset?.mwiAssetsTab === "true" && !node.id,
      isOwnedPanel: node => node?.id === "mwi-assets-panel" });
    sidebar.start();
    root.document.addEventListener("mwi-assets:observe:v1", schedule);
    const interval = root.setInterval(capture, 5000);
    const priceInterval = root.setInterval(() => native.refresh().finally(schedule), 60000);
    native.refresh().finally(schedule);
    capture();
    return { schedule, capture, destroy() {
      stopped = true; root.clearTimeout(scheduled); root.clearInterval(interval); root.clearInterval(priceInterval);
      root.document.removeEventListener("mwi-assets:observe:v1", schedule);
      native.destroy(); connection.close(); sidebar.destroy(); view.destroy(); element.remove();
      Promise.allSettled([pending, historyPending]).finally(async () => {
        if (db) { try { if (currentScope) await store.lease(db, ownerId, currentScope, Date.now(), true); } finally { db.close(); } }
      });
    } };
  }
  app.assetApplication = Object.freeze({ create });
})(globalThis);


// ---- source/runtime/entry.js ----
(function startAssets(root) {
  "use strict";
  const app = root.MWILayuAssetsPlugin;
  if (app.runtime) return;
  let controller = null, stopped = false, starting = false;
  async function mount() {
    if (stopped || starting || controller || !root.document.body) return;
    starting = true;
    try {
      await app.gameBridge.inject();
      if (stopped) return;
      app.styles.installStyles();
      controller = app.assetApplication.create();
    } catch (error) { console.error("[资产助手] 初始化失败，请刷新页面重试。", error); }
    finally { starting = false; }
  }
  app.runtime = Object.freeze({ destroy() { stopped = true; root.document.removeEventListener("DOMContentLoaded", mount); controller?.destroy(); } });
  if (root.document.body) mount();
  else root.document.addEventListener("DOMContentLoaded", mount, { once: true });
})(globalThis);

