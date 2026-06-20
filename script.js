/* ============================================================
   ハーブ苗 収益シミュレーター ロジック
   - 外部ライブラリ不使用（素のJavaScriptのみ）
   - 計算は関数化し、あとから販売チャネルや項目を追加しやすくする
   ============================================================ */

"use strict";

/* ------------------------------------------------------------
   1. 販売チャネル定義
   ここに1行追記するだけでチャネルを増やせる構造。
   feeRate … 販売手数料率（小数。0.10 = 10%）
------------------------------------------------------------ */
const CHANNELS = [
  { id: "mercari", name: "メルカリ", feeRate: 0.10, fixedFee: 0 },
  { id: "base",    name: "BASE",     feeRate: 0.0364 + 0.03, fixedFee: 0 }, // 決済3.6%+40円+サービス料3%目安（簡易）
  { id: "rakuten", name: "楽天市場（目安）", feeRate: 0.12, fixedFee: 0 },
  { id: "amazon",  name: "Amazon（目安）",  feeRate: 0.15, fixedFee: 0 },
  { id: "custom",  name: "手数料を手入力", feeRate: null,  fixedFee: 0 },
];

/* ------------------------------------------------------------
   2. 入力値の取得ヘルパー
------------------------------------------------------------ */
function num(id) {
  const el = document.getElementById(id);
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

function readInputs() {
  return {
    unitsSold:     num("unitsSold"),
    price:         num("price"),
    commissionRate: num("commissionRate") / 100,
    lossRate:      num("lossRate") / 100,

    setSize:       Math.max(1, num("setSize")),
    setDiscount:   num("setDiscount") / 100,

    seedPackPrice: num("seedPackPrice"),
    seedPackQty:   Math.max(1, num("seedPackQty")),
    potPackPrice:  num("potPackPrice"),
    potPackQty:    Math.max(1, num("potPackQty")),
    soilPrice:     num("soilPrice"),
    soilVolume:    Math.max(0.1, num("soilVolume")),
    soilPerPot:    num("soilPerPot"),

    boxPrice:      num("boxPrice"),
    shippingPrice: num("shippingPrice"),
    shipments:     num("shipments"),
    otherCost:     num("otherCost"),
  };
}

/* ------------------------------------------------------------
   3. 中心となる計算関数（画面に依存しない純関数）
------------------------------------------------------------ */
function calcSimulation(input) {
  // ロスを見込んだ「実際に生産が必要な株数」
  const lossFactor = input.lossRate >= 1 ? 0 : (1 - input.lossRate);
  const producedUnits = lossFactor > 0 ? input.unitsSold / lossFactor : 0;

  // 割引後の実売単価
  const effectivePrice = input.price * (1 - input.setDiscount);

  // 資材の1株あたり単価
  const seedUnitCost = input.seedPackPrice / input.seedPackQty;
  const potUnitCost  = input.potPackPrice / input.potPackQty;
  const soilUnitCost = (input.soilPrice / input.soilVolume) * input.soilPerPot;

  // 1〜9：売上・経費
  const totalSales   = input.unitsSold * effectivePrice;
  const commission   = totalSales * input.commissionRate;
  const netSales     = totalSales - commission;
  const seedCost     = seedUnitCost * producedUnits;
  const potCost      = potUnitCost * producedUnits;
  const soilCost     = soilUnitCost * producedUnits;
  const boxCost      = input.boxPrice * input.shipments;
  const shippingCost = input.shippingPrice * input.shipments;
  const totalCost    = commission + seedCost + potCost + soilCost + boxCost + shippingCost + input.otherCost;

  // 10〜11：利益
  const grossProfit   = totalSales - totalCost;
  const profitPerUnit = input.unitsSold > 0 ? grossProfit / input.unitsSold : 0;

  // 12：損益分岐 販売価格
  const fixedCostForPrice = seedCost + potCost + soilCost + boxCost + shippingCost + input.otherCost;
  const denomPrice = input.unitsSold * (1 - input.setDiscount) * (1 - input.commissionRate);
  const breakEvenPrice = denomPrice > 0 ? fixedCostForPrice / denomPrice : 0;

  // 13：損益分岐 販売本数
  const variableCostPerUnit = lossFactor > 0
    ? (seedUnitCost + potUnitCost + soilUnitCost) / lossFactor
    : 0;
  const contributionPerUnit = effectivePrice * (1 - input.commissionRate) - variableCostPerUnit;
  const fixedNonUnitCost = boxCost + shippingCost + input.otherCost;
  const breakEvenUnits = contributionPerUnit > 0 ? fixedNonUnitCost / contributionPerUnit : Infinity;

  // ★販売本数に連動する必要数量（仕入れ・準備の目安）
  const seedsNeeded = Math.ceil(producedUnits);                       // 必要種数（1ポット1粒で計算）
  const potsNeeded  = Math.ceil(producedUnits);                       // 必要ポット数
  const soilLiters  = producedUnits * input.soilPerPot;               // 必要培土量(L)
  const boxesNeeded = Math.ceil(input.shipments);                     // 必要箱数（=発送回数）
  const seedPacks   = Math.ceil(seedsNeeded / input.seedPackQty);     // 種：必要袋数
  const potPacks    = Math.ceil(potsNeeded / input.potPackQty);       // ポット：必要袋数
  const soilPacks   = Math.ceil(soilLiters / input.soilVolume);       // 培土：必要袋数

  return {
    producedUnits, effectivePrice,
    seedUnitCost, potUnitCost, soilUnitCost,
    totalSales, commission, netSales,
    seedCost, potCost, soilCost, boxCost, shippingCost,
    otherCost: input.otherCost,
    totalCost, grossProfit, profitPerUnit,
    breakEvenPrice, breakEvenUnits,
    seedsNeeded, potsNeeded, soilLiters, boxesNeeded,
    seedPacks, potPacks, soilPacks,
  };
}

/* ------------------------------------------------------------
   4. 表示用ヘルパー
------------------------------------------------------------ */
function yen(v) {
  if (!isFinite(v)) return "—";
  return Math.round(v).toLocaleString("ja-JP") + " 円";
}
function unitsText(v) {
  if (!isFinite(v)) return "計算不可";
  return (Math.round(v * 10) / 10).toLocaleString("ja-JP") + " 本";
}
function n(v) { return (Math.round(v)).toLocaleString("ja-JP"); }
function yenC(v) { return !isFinite(v) ? "—" : Math.round(v).toLocaleString("ja-JP"); } // 「円」を省いた数値（比較表用）
function n1(v) { return (Math.round(v * 10) / 10).toLocaleString("ja-JP"); }
function signClass(v) { return v >= 0 ? "plus" : "minus"; }

/* ------------------------------------------------------------
   5. 仕入れ・準備の目安カード（販売本数に連動）
------------------------------------------------------------ */
function renderQty(r) {
  const cards = [
    { label: "必要生産株数", value: n(r.producedUnits) + " 株", sub: "ロス率込み" },
    { label: "種",   value: n(r.seedsNeeded) + " 粒", sub: "約 " + r.seedPacks + " 袋" },
    { label: "ポット", value: n(r.potsNeeded) + " 個", sub: "約 " + r.potPacks + " 袋" },
    { label: "培土",  value: n1(r.soilLiters) + " L", sub: "約 " + r.soilPacks + " 袋" },
    { label: "発送",  value: n(r.boxesNeeded) + " 箱", sub: "発送回数と同じ" },
    { label: "損益分岐 販売本数", value: unitsText(r.breakEvenUnits), sub: "黒字ライン" },
  ];
  document.getElementById("qtyGrid").innerHTML = cards.map(function (c) {
    return `<div class="qty-card">
      <span class="qty-label">${c.label}</span>
      <span class="qty-value">${c.value}</span>
      <span class="qty-sub">${c.sub}</span>
    </div>`;
  }).join("");
}

/* ------------------------------------------------------------
   6. KPIカード
------------------------------------------------------------ */
function renderKpi(r) {
  const p = document.getElementById("kpiProfit");
  p.textContent = yen(r.grossProfit);
  p.className = "kpi-value " + signClass(r.grossProfit);

  const ppu = document.getElementById("kpiProfitPerUnit");
  ppu.textContent = yen(r.profitPerUnit);
  ppu.className = "kpi-value " + signClass(r.profitPerUnit);
}

/* ------------------------------------------------------------
   7. 経費の内訳バー（CSSだけの横棒グラフ）
------------------------------------------------------------ */
function renderCostBar(r) {
  const items = [
    { label: "販売手数料", value: r.commission,   color: "#b39ddb" },
    { label: "種代",      value: r.seedCost,     color: "#9ccc8f" },
    { label: "ポット代",  value: r.potCost,      color: "#f0b86e" },
    { label: "培土代",    value: r.soilCost,     color: "#c08457" },
    { label: "箱代",      value: r.boxCost,      color: "#90caf9" },
    { label: "送料",      value: r.shippingCost, color: "#ef9a9a" },
    { label: "その他",    value: r.otherCost,    color: "#cfc4e0" },
  ].filter(function (i) { return i.value > 0; });

  const total = r.totalCost > 0 ? r.totalCost : 1;

  document.getElementById("costBar").innerHTML = items.map(function (i) {
    const pct = (i.value / total) * 100;
    return `<div class="cost-seg" style="width:${pct}%;background:${i.color}" title="${i.label} ${yen(i.value)}"></div>`;
  }).join("");

  document.getElementById("costLegend").innerHTML = items.map(function (i) {
    const pct = Math.round((i.value / total) * 100);
    return `<span class="cost-leg"><i style="background:${i.color}"></i>${i.label} ${yen(i.value)}（${pct}%）</span>`;
  }).join("");
}

/* ------------------------------------------------------------
   8. 内訳明細テーブル（売上／経費／利益でグループ化）
------------------------------------------------------------ */
function renderResultTable(r) {
  const groups = [
    {
      title: "売上",
      rows: [
        { label: "総売上", value: yen(r.totalSales) },
        { label: "販売手数料", value: "− " + yen(r.commission) },
        { label: "手数料差引後売上", value: yen(r.netSales), cls: "subtotal" },
      ],
    },
    {
      title: "経費",
      rows: [
        { label: "種代合計", value: yen(r.seedCost) },
        { label: "ポット代合計", value: yen(r.potCost) },
        { label: "培土代合計", value: yen(r.soilCost) },
        { label: "箱代合計", value: yen(r.boxCost) },
        { label: "送料合計", value: yen(r.shippingCost) },
        { label: "その他経費", value: yen(r.otherCost) },
        { label: "総経費", value: yen(r.totalCost), cls: "subtotal" },
      ],
    },
    {
      title: "利益・損益分岐",
      rows: [
        { label: "粗利益", value: yen(r.grossProfit), cls: "total", profit: r.grossProfit },
        { label: "1本あたり利益", value: yen(r.profitPerUnit), profit: r.profitPerUnit },
        { label: "損益分岐 販売価格", value: yen(r.breakEvenPrice) },
        { label: "損益分岐 販売本数", value: unitsText(r.breakEvenUnits) },
      ],
    },
  ];

  let html = "";
  groups.forEach(function (g) {
    html += `<tr class="group-row"><td colspan="2">${g.title}</td></tr>`;
    g.rows.forEach(function (row) {
      const trCls = row.cls ? ` class="${row.cls}"` : "";
      let valHtml = row.value;
      if (typeof row.profit === "number") {
        valHtml = `<span class="${signClass(row.profit)}">${row.value}</span>`;
      }
      html += `<tr${trCls}><td>${row.label}</td><td class="num">${valHtml}</td></tr>`;
    });
  });
  document.querySelector("#resultTable tbody").innerHTML = html;
}

/* ------------------------------------------------------------
   9. セット本数 比較表
------------------------------------------------------------ */
function renderCompareTable(baseInput) {
  const setSizes = [3, 5];
  const discountIds = { 3: "disc3", 5: "disc5" };

  const scenarios = setSizes.map(function (size) {
    const discount = num(discountIds[size]) / 100;
    const shipments = Math.ceil(baseInput.unitsSold / size);
    const variant = Object.assign({}, baseInput, {
      setSize: size, setDiscount: discount, shipments: shipments,
    });
    return { size, discount, shipments, res: calcSimulation(variant) };
  });

  let bestIndex = 0;
  scenarios.forEach(function (s, i) {
    if (s.res.grossProfit > scenarios[bestIndex].res.grossProfit) bestIndex = i;
  });

  // ヘッダー行：比較項目 ＋ 各セット（横スクロール不要にするため行列を入れ替え）
  const thead = "<tr><th>比較項目</th>" + scenarios.map(function (s, i) {
    const cls = i === bestIndex ? ' best-col' : '';
    const star = i === bestIndex ? ' ★' : '';
    return `<th class="num${cls}">${s.size}本${star}</th>`;
  }).join("") + "</tr>";

  // 各メトリクスを1行ずつ（縦に項目、横にセット）
  const metrics = [
    { label: "割引率", get: function (s) { return (s.discount * 100).toLocaleString("ja-JP") + "％"; } },
    { label: "発送回数", get: function (s) { return s.shipments.toLocaleString("ja-JP") + "回"; } },
    { label: "総売上", get: function (s) { return yen(s.res.totalSales); } },
    { label: "総経費", get: function (s) { return yen(s.res.totalCost); } },
    { label: "粗利益", strong: true, get: function (s) {
        return `<span class="${signClass(s.res.grossProfit)}">${yen(s.res.grossProfit)}</span>`; } },
    { label: "1本あたり利益", get: function (s) {
        return `<span class="${signClass(s.res.profitPerUnit)}">${yen(s.res.profitPerUnit)}</span>`; } },
  ];

  const tbody = metrics.map(function (m) {
    const rowCls = m.strong ? ' class="total"' : "";
    return `<tr${rowCls}><td>${m.label}</td>` + scenarios.map(function (s, i) {
      const cls = i === bestIndex ? ' best-col' : '';
      return `<td class="num${cls}">${m.get(s)}</td>`;
    }).join("") + `</tr>`;
  }).join("");

  document.querySelector("#compareTable thead").innerHTML = thead;
  document.querySelector("#compareTable tbody").innerHTML = tbody;
}

/* ------------------------------------------------------------
   10. 発送回数の自動連動
   「販売本数から自動」がONのとき、発送回数 = 販売本数 ÷ セット本数（切り上げ）
------------------------------------------------------------ */
function applyAutoShipments() {
  const auto = document.getElementById("shipAuto").checked;
  const shipInput = document.getElementById("shipments");
  shipInput.disabled = auto;          // 自動のときは手入力をロック
  if (auto) {
    const units = num("unitsSold");
    const size = Math.max(1, num("setSize"));
    shipInput.value = units > 0 ? Math.ceil(units / size) : 0;
  }
}

/* ------------------------------------------------------------
   11. 全体の再計算
------------------------------------------------------------ */
function recalcAll() {
  applyAutoShipments();             // 先に発送回数を連動させる
  const input = readInputs();
  const result = calcSimulation(input);
  renderQty(result);
  renderKpi(result);
  renderCostBar(result);
  renderResultTable(result);
  renderCompareTable(input);
}

/* ------------------------------------------------------------
   12. 販売チャネル切り替え
------------------------------------------------------------ */
function initChannelSelect() {
  const sel = document.getElementById("channel");
  sel.innerHTML = CHANNELS.map(function (c) {
    return `<option value="${c.id}">${c.name}</option>`;
  }).join("");
  sel.value = "mercari";

  sel.addEventListener("change", function () {
    const ch = CHANNELS.find(function (c) { return c.id === sel.value; });
    if (ch && ch.feeRate !== null) {
      document.getElementById("commissionRate").value =
        (ch.feeRate * 100).toFixed(2).replace(/\.?0+$/, "");
    }
    recalcAll();
  });
}

/* ------------------------------------------------------------
   13. 品目タブ（追加・名称編集・スムーズ切替・スワイプ対応）
   1組のフォームを共有し、タブごとに入力値を保存・切替する。
------------------------------------------------------------ */

// タブで保持・復元する入力項目のID一覧
const TAB_INPUT_IDS = [
  "unitsSold", "price", "commissionRate", "lossRate",
  "setSize", "setDiscount", "disc3", "disc5",
  "seedPackPrice", "seedPackQty", "potPackPrice", "potPackQty",
  "soilPrice", "soilVolume", "soilPerPot",
  "boxPrice", "shippingPrice", "shipments", "otherCost",
];

let tabs = [];          // [{ id, name, state }]
let activeId = null;
let tabSeq = 0;         // 一意なID採番
let animating = false;  // 切替アニメーション中フラグ

// HTMLの危険文字をエスケープ（品目名をそのまま埋め込むため）
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, function (c) {
    return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
  });
}

// 現在のフォーム内容をオブジェクトに書き出す
function snapshotForm() {
  const s = {};
  TAB_INPUT_IDS.forEach(function (id) { s[id] = document.getElementById(id).value; });
  s.channel = document.getElementById("channel").value;
  s.shipAuto = document.getElementById("shipAuto").checked;
  return s;
}

// 保存していた内容をフォームに反映する
function applyState(s) {
  TAB_INPUT_IDS.forEach(function (id) {
    document.getElementById(id).value = (s && s[id] !== undefined) ? s[id] : "";
  });
  document.getElementById("channel").value = (s && s.channel) ? s.channel : "mercari";
  document.getElementById("shipAuto").checked = (s && s.shipAuto !== undefined) ? s.shipAuto : true;
}

// 数値が未入力の空のタブ状態
function blankState() {
  const s = {};
  TAB_INPUT_IDS.forEach(function (id) { s[id] = ""; });
  s.channel = "mercari";
  s.shipAuto = true;
  return s;
}

function getTab(id) { return tabs.find(function (t) { return t.id === id; }); }
function tabIndex(id) { return tabs.findIndex(function (t) { return t.id === id; }); }
function saveActive() { const t = getTab(activeId); if (t) t.state = snapshotForm(); }

function initTabs() {
  // ラベンダー／ローズマリーは標準固定（改名・削除不可）
  tabs = [
    { id: "t" + (++tabSeq), name: "ラベンダー",   emoji: "💜", fixed: true, state: snapshotForm() },
    { id: "t" + (++tabSeq), name: "ローズマリー", emoji: "🌿", fixed: true, state: blankState() },
  ];
  activeId = tabs[0].id;
  renderTabBar();
  syncTitle();
}

// 下部タブバーを描画（Dock風：タブはスクロール領域、＋は右端固定）
function renderTabBar() {
  const bar = document.getElementById("tabbar");
  const tabsHtml = tabs.map(function (t) {
    const active = t.id === activeId ? " active" : "";
    // 追加タブ（固定でない）には × 削除ボタンを付ける
    const del = t.fixed ? "" : `<span class="tab-del" data-del="${t.id}" title="削除" aria-label="削除">×</span>`;
    return `<button type="button" class="tab${active}" data-id="${t.id}">
      ${del}
      <span class="tab-emoji">${t.emoji || "🌱"}</span>
      <span class="tab-label">${escapeHtml(t.name || "品目")}</span>
    </button>`;
  }).join("");
  bar.innerHTML = `<div class="tab-scroll">${tabsHtml}</div>
    <button type="button" class="tab-add" id="tabAdd" title="品目を追加" aria-label="品目を追加">＋</button>`;

  // 各タブ：タップで切替／（追加タブのみ）長押しで改名
  bar.querySelectorAll("button.tab").forEach(function (b) {
    bindTabButton(b);
  });
  // 削除ボタン
  bar.querySelectorAll(".tab-del").forEach(function (x) {
    x.addEventListener("click", function (e) {
      e.stopPropagation();
      deleteTab(x.dataset.del);
    });
  });
  document.getElementById("tabAdd").addEventListener("click", addTab);
  scrollActiveIntoView();
}

// アクティブなタブが見えるよう、Dock（横スクロール）を中央寄せ
function scrollActiveIntoView() {
  const sc = document.querySelector(".tab-scroll");
  if (!sc) return;
  const btn = sc.querySelector("button.tab.active");
  if (!btn) return;
  const target = btn.offsetLeft - (sc.clientWidth - btn.offsetWidth) / 2;
  sc.scrollTo({ left: Math.max(0, target), behavior: "smooth" });
}

// 1つのタブボタンに、タップ切替＆長押し改名を割り当てる
function bindTabButton(b) {
  const id = b.dataset.id;
  const tab = getTab(id);
  let timer = null, longPressed = false, downX = 0, downY = 0;

  function clearTimer() { if (timer) { clearTimeout(timer); timer = null; } }

  b.addEventListener("pointerdown", function (e) {
    longPressed = false;
    downX = e.clientX; downY = e.clientY;
    if (tab && !tab.fixed) {
      timer = setTimeout(function () {        // 追加タブのみ長押しで改名
        longPressed = true;
        renameTab(id);
      }, 550);
    }
  });
  b.addEventListener("pointermove", function (e) {
    if (timer && (Math.abs(e.clientX - downX) > 10 || Math.abs(e.clientY - downY) > 10)) clearTimer();
  });
  b.addEventListener("pointerup", clearTimer);
  b.addEventListener("pointercancel", clearTimer);
  b.addEventListener("pointerleave", clearTimer);

  b.addEventListener("click", function () {
    if (longPressed) { longPressed = false; return; }  // 長押し後のクリックは無視
    switchTab(id);
  });
}

// 追加タブの改名（長押し → 入力 → 確定でタイトルに反映）
function renameTab(id) {
  const t = getTab(id);
  if (!t || t.fixed) return;
  const name = window.prompt("品目名を入力してください", t.name);
  if (name === null) return;            // キャンセル
  const trimmed = name.trim();
  if (trimmed === "") return;
  t.name = trimmed;
  if (id === activeId) syncTitle();     // タイトル表記に反映
  renderTabBar();
}

// 追加タブの削除
function deleteTab(id) {
  const t = getTab(id);
  if (!t || t.fixed) return;
  if (!window.confirm("「" + t.name + "」を削除しますか？")) return;
  const idx = tabIndex(id);
  tabs.splice(idx, 1);
  if (activeId === id) {                 // アクティブを消したら左隣へ
    const next = tabs[Math.max(0, idx - 1)];
    activeId = next.id;
    applyState(getTab(activeId).state);
    syncTitle();
    recalcAll();
  }
  renderTabBar();
}

// タイトルに現在のタブ名を反映
function syncTitle() {
  document.getElementById("plantName").textContent = getTab(activeId).name;
}

// スムーズなスライド＋フェードでタブ内容を入れ替える
function animateSwap(dir, swap) {
  const el = document.querySelector(".layout");
  animating = true;
  el.style.transform = "translateX(" + (-20 * dir) + "px)";
  el.style.opacity = "0";
  window.setTimeout(function () {
    swap();
    el.style.transition = "none";
    el.style.transform = "translateX(" + (20 * dir) + "px)";
    void el.offsetWidth;            // リフロー強制
    el.style.transition = "";
    el.style.transform = "translateX(0)";
    el.style.opacity = "1";
    animating = false;
  }, 180);
}

function switchTab(id) {
  if (id === activeId || animating) return;
  saveActive();
  const dir = tabIndex(id) > tabIndex(activeId) ? 1 : -1;
  animateSwap(dir, function () {
    activeId = id;
    applyState(getTab(id).state);
    syncTitle();
    renderTabBar();
    recalcAll();
  });
}

// 品目を追加（数値は未入力。名前は長押しで改名できる）
function addTab() {
  saveActive();
  const id = "t" + (++tabSeq);
  tabs.push({ id: id, name: "品目" + (tabs.length + 1), emoji: "🌱", fixed: false, state: blankState() });
  activeId = id;
  applyState(getTab(id).state);
  syncTitle();
  renderTabBar();
  recalcAll();
}

// 左右スワイプで隣のタブへ
function bindSwipe() {
  const el = document.querySelector(".layout");
  let x0 = null, y0 = null, t0 = 0;
  el.addEventListener("touchstart", function (e) {
    const t = e.touches[0]; x0 = t.clientX; y0 = t.clientY; t0 = Date.now();
  }, { passive: true });
  el.addEventListener("touchend", function (e) {
    if (x0 === null) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - x0, dy = t.clientY - y0;
    x0 = null;
    if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.8 && (Date.now() - t0) < 600) {
      const idx = tabIndex(activeId);
      if (dx < 0 && idx < tabs.length - 1) switchTab(tabs[idx + 1].id);      // 左へ→次の品目
      else if (dx > 0 && idx > 0) switchTab(tabs[idx - 1].id);              // 右へ→前の品目
    }
  }, { passive: true });
}

/* ------------------------------------------------------------
   14. 初期化・イベント登録
------------------------------------------------------------ */
function bindAutoRecalc() {
  // 計算に使う入力は入力パネル内だけ（ヘッダーの品目名は除外）
  document.querySelectorAll(".input-panel input, .input-panel select").forEach(function (el) {
    el.addEventListener("input", recalcAll);
    el.addEventListener("change", recalcAll);
  });
}

// 「すべて開く/閉じる」トグル
function bindToggleAll() {
  document.getElementById("toggleAll").addEventListener("click", function () {
    const groups = document.querySelectorAll(".group");
    // ひとつでも閉じていれば「全部開く」、全部開いていれば「全部閉じる」
    const anyClosed = Array.prototype.some.call(groups, function (g) { return !g.open; });
    groups.forEach(function (g) { g.open = anyClosed; });
  });
}

function bindReset() {
  document.getElementById("resetBtn").addEventListener("click", function () {
    location.reload();
  });
}

document.addEventListener("DOMContentLoaded", function () {
  initChannelSelect();
  bindAutoRecalc();
  bindToggleAll();
  bindReset();
  initTabs();        // タブ初期化（ラベンダー／ローズマリーは固定）
  bindSwipe();       // 左右スワイプで品目切替
  recalcAll();
});
