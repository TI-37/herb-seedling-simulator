/* ============================================================
   ハーブ苗 収益シミュレーター ロジック
   - 外部ライブラリ不使用（素のJavaScriptのみ）
   - 計算は関数化し、あとから販売チャネルや項目を追加しやすくする
   ============================================================ */

"use strict";

/* ------------------------------------------------------------
   1. 販売チャネル定義
   ここに追記するだけでチャネルを増やせる構造にしている。
   feeRate … 販売手数料率（小数。0.10 = 10%）
   将来 BASE / 楽天 / Amazon を足すときは、この配列に1行追加するだけ。
   固定費（月額・出店料など）が必要なら fixedFee を使えるよう拡張余地も残す。
------------------------------------------------------------ */
const CHANNELS = [
  { id: "mercari", name: "メルカリ", feeRate: 0.10, fixedFee: 0 },
  { id: "base",    name: "BASE",     feeRate: 0.0364 + 0.03, fixedFee: 0 }, // サービス利用料3%+決済手数料3.6%+40円目安（簡易）
  { id: "rakuten", name: "楽天市場（目安）", feeRate: 0.12, fixedFee: 0 },
  { id: "amazon",  name: "Amazon（目安）",  feeRate: 0.15, fixedFee: 0 },
  { id: "custom",  name: "手数料を手入力", feeRate: null,  fixedFee: 0 },
];

/* ------------------------------------------------------------
   2. 入力値の取得ヘルパー
------------------------------------------------------------ */

// 指定IDの数値入力を取得（不正値は0扱い）
function num(id) {
  const el = document.getElementById(id);
  const v = parseFloat(el.value);
  return isNaN(v) ? 0 : v;
}

// 画面上の全入力をまとめて1つのオブジェクトにする
function readInputs() {
  return {
    unitsSold:    num("unitsSold"),                 // 販売本数
    price:        num("price"),                     // 1本あたり販売価格
    commissionRate: num("commissionRate") / 100,    // 販売手数料率（%→小数）
    lossRate:     num("lossRate") / 100,            // ロス率（%→小数）

    setSize:      Math.max(1, num("setSize")),      // セット本数（メイン）
    setDiscount:  num("setDiscount") / 100,         // セット割引率（メイン）

    seedPackPrice: num("seedPackPrice"),            // 種：1袋の価格
    seedPackQty:   Math.max(1, num("seedPackQty")), // 種：1袋の粒数
    potPackPrice:  num("potPackPrice"),             // ポット：1袋の価格
    potPackQty:    Math.max(1, num("potPackQty")),  // ポット：1袋の個数
    soilPrice:     num("soilPrice"),                // 培土：1袋の価格
    soilVolume:    Math.max(0.1, num("soilVolume")),// 培土：1袋の容量(L)
    soilPerPot:    num("soilPerPot"),               // 培土：1ポット使用量(L)

    boxPrice:      num("boxPrice"),                 // 箱代（1箱）
    shippingPrice: num("shippingPrice"),            // 送料（1発送）
    shipments:     num("shipments"),                // 発送回数
    otherCost:     num("otherCost"),                // その他経費
  };
}

/* ------------------------------------------------------------
   3. 中心となる計算関数
   入力オブジェクトを受け取り、すべての結果を返す。
   ここを純粋関数（画面に依存しない）にしておくことで、
   セット比較や将来のテストでも使い回せる。
------------------------------------------------------------ */
function calcSimulation(input) {
  // --- ロスを見込んだ「実際に生産が必要な本数」 ---
  // 例：ロス率10%なら、60本売るには 60 / 0.9 ≒ 66.7本 育てる必要がある
  const lossFactor = input.lossRate >= 1 ? 0 : (1 - input.lossRate);
  const producedUnits = lossFactor > 0 ? input.unitsSold / lossFactor : 0;

  // --- 割引後の実売単価 ---
  const effectivePrice = input.price * (1 - input.setDiscount);

  // --- 資材の1本あたり単価 ---
  const seedUnitCost = input.seedPackPrice / input.seedPackQty;                 // 種：1粒あたり
  const potUnitCost  = input.potPackPrice / input.potPackQty;                   // ポット：1個あたり
  const soilUnitCost = (input.soilPrice / input.soilVolume) * input.soilPerPot; // 培土：1ポットあたり

  // --- 1. 総売上 ---
  const totalSales = input.unitsSold * effectivePrice;
  // --- 2. 販売手数料 ---
  const commission = totalSales * input.commissionRate;
  // --- 3. 手数料差引後売上 ---
  const netSales = totalSales - commission;
  // --- 4. 種代合計（生産必要本数ベース） ---
  const seedCost = seedUnitCost * producedUnits;
  // --- 5. ポット代合計 ---
  const potCost = potUnitCost * producedUnits;
  // --- 6. 培土代合計 ---
  const soilCost = soilUnitCost * producedUnits;
  // --- 7. 箱代合計 ---
  const boxCost = input.boxPrice * input.shipments;
  // --- 8. 送料合計 ---
  const shippingCost = input.shippingPrice * input.shipments;
  // --- 9. 総経費（手数料＋資材＋発送＋その他） ---
  const totalCost = commission + seedCost + potCost + soilCost + boxCost + shippingCost + input.otherCost;
  // --- 10. 粗利益 ---
  const grossProfit = totalSales - totalCost;
  // --- 11. 1本あたり利益 ---
  const profitPerUnit = input.unitsSold > 0 ? grossProfit / input.unitsSold : 0;

  // --- 12. 損益分岐 販売価格 ---
  // 販売本数・発送回数を固定したまま、利益0になる1本あたり価格を逆算。
  // 利益 = 売上 - (売上×手数料率) - 固定的経費 = 0
  //   売上 = 本数 × p × (1-割引)
  //   → p = 固定的経費 / { 本数 × (1-割引) × (1-手数料率) }
  const fixedCostForPrice = seedCost + potCost + soilCost + boxCost + shippingCost + input.otherCost;
  const denomPrice = input.unitsSold * (1 - input.setDiscount) * (1 - input.commissionRate);
  const breakEvenPrice = denomPrice > 0 ? fixedCostForPrice / denomPrice : 0;

  // --- 13. 損益分岐 販売本数 ---
  // 価格を固定したまま、利益0になる販売本数を逆算。
  //   1本あたり貢献利益 = 実売単価×(1-手数料率) - 1本あたり変動費
  //   1本あたり変動費   = (種+ポット+培土の1本単価) / lossFactor（ロス込み）
  //   発送・箱・その他は本数に直接連動しない固定費として扱う
  const variableCostPerUnit = lossFactor > 0
    ? (seedUnitCost + potUnitCost + soilUnitCost) / lossFactor
    : 0;
  const contributionPerUnit = effectivePrice * (1 - input.commissionRate) - variableCostPerUnit;
  const fixedNonUnitCost = boxCost + shippingCost + input.otherCost;
  const breakEvenUnits = contributionPerUnit > 0
    ? fixedNonUnitCost / contributionPerUnit
    : Infinity;

  return {
    producedUnits, effectivePrice,
    seedUnitCost, potUnitCost, soilUnitCost,
    totalSales, commission, netSales,
    seedCost, potCost, soilCost, boxCost, shippingCost,
    otherCost: input.otherCost,
    totalCost, grossProfit, profitPerUnit,
    breakEvenPrice, breakEvenUnits,
  };
}

/* ------------------------------------------------------------
   4. 表示用ヘルパー
------------------------------------------------------------ */

// 円単位で四捨五入してカンマ区切り表示（例：12345 → "12,345 円"）
function yen(v) {
  if (!isFinite(v)) return "—";
  return Math.round(v).toLocaleString("ja-JP") + " 円";
}

// 本数表示（小数1桁まで、繰り上げ目安も併記しやすいよう数値整形）
function unitsText(v) {
  if (!isFinite(v)) return "計算不可";
  return (Math.round(v * 10) / 10).toLocaleString("ja-JP") + " 本";
}

// 利益の符号でCSSクラスを返す
function signClass(v) {
  return v >= 0 ? "plus" : "minus";
}

/* ------------------------------------------------------------
   5. メイン結果テーブルの描画
------------------------------------------------------------ */
function renderResultTable(r) {
  const rows = [
    { label: "1. 総売上",            value: yen(r.totalSales) },
    { label: "2. 販売手数料",        value: yen(r.commission) },
    { label: "3. 手数料差引後売上",  value: yen(r.netSales), cls: "subtotal" },
    { label: "4. 種代合計",          value: yen(r.seedCost) },
    { label: "5. ポット代合計",      value: yen(r.potCost) },
    { label: "6. 培土代合計",        value: yen(r.soilCost) },
    { label: "7. 箱代合計",          value: yen(r.boxCost) },
    { label: "8. 送料合計",          value: yen(r.shippingCost) },
    { label: "　 その他経費",        value: yen(r.otherCost) },
    { label: "9. 総経費",            value: yen(r.totalCost), cls: "subtotal" },
    { label: "10. 粗利益",           value: yen(r.grossProfit), cls: "total", profit: r.grossProfit },
    { label: "11. 1本あたり利益",    value: yen(r.profitPerUnit), profit: r.profitPerUnit },
    { label: "12. 損益分岐 販売価格", value: yen(r.breakEvenPrice) },
    { label: "13. 損益分岐 販売本数", value: unitsText(r.breakEvenUnits) },
  ];

  const tbody = document.querySelector("#resultTable tbody");
  tbody.innerHTML = rows.map(function (row) {
    const trCls = row.cls ? ` class="${row.cls}"` : "";
    // 利益系の行は黒字/赤字で色付け
    let valHtml = row.value;
    if (typeof row.profit === "number") {
      valHtml = `<span class="${signClass(row.profit)}">${row.value}</span>`;
    }
    return `<tr${trCls}><td>${row.label}</td><td class="num">${valHtml}</td></tr>`;
  }).join("");
}

/* ------------------------------------------------------------
   6. KPIカードの描画
------------------------------------------------------------ */
function renderKpi(r) {
  const profitEl = document.getElementById("kpiProfit");
  profitEl.textContent = yen(r.grossProfit);
  profitEl.className = "kpi-value " + signClass(r.grossProfit);

  const ppuEl = document.getElementById("kpiProfitPerUnit");
  ppuEl.textContent = yen(r.profitPerUnit);
  ppuEl.className = "kpi-value " + signClass(r.profitPerUnit);

  document.getElementById("kpiBeUnits").textContent = unitsText(r.breakEvenUnits);
}

/* ------------------------------------------------------------
   7. セット本数 比較表の描画
   2〜5本セットそれぞれについて、
   「発送回数 = 販売本数 ÷ セット本数（切り上げ）」で再計算する。
------------------------------------------------------------ */
function renderCompareTable(baseInput) {
  const setSizes = [2, 3, 4, 5];
  const discountIds = { 2: "disc2", 3: "disc3", 4: "disc4", 5: "disc5" };

  // 各セット本数のシナリオを計算
  const scenarios = setSizes.map(function (size) {
    const discount = num(discountIds[size]) / 100;
    // 発送回数：このセット本数でまとめた場合の発送回数（切り上げ）
    const shipments = Math.ceil(baseInput.unitsSold / size);
    // baseInput を複製し、セット本数・割引・発送回数だけ差し替えて再計算
    const variant = Object.assign({}, baseInput, {
      setSize: size,
      setDiscount: discount,
      shipments: shipments,
    });
    const res = calcSimulation(variant);
    return { size, discount, shipments, res };
  });

  // 最も粗利益が高いシナリオを探してハイライト
  let bestIndex = 0;
  scenarios.forEach(function (s, i) {
    if (s.res.grossProfit > scenarios[bestIndex].res.grossProfit) bestIndex = i;
  });

  const tbody = document.querySelector("#compareTable tbody");
  tbody.innerHTML = scenarios.map(function (s, i) {
    const cls = i === bestIndex ? ' class="best"' : "";
    const profitCls = signClass(s.res.grossProfit);
    const ppuCls = signClass(s.res.profitPerUnit);
    return `<tr${cls}>
      <td>${s.size} 本セット</td>
      <td class="num">${(s.discount * 100).toLocaleString("ja-JP")} ％</td>
      <td class="num">${s.shipments.toLocaleString("ja-JP")} 回</td>
      <td class="num">${yen(s.res.totalSales)}</td>
      <td class="num">${yen(s.res.totalCost)}</td>
      <td class="num"><span class="${profitCls}">${yen(s.res.grossProfit)}</span></td>
      <td class="num"><span class="${ppuCls}">${yen(s.res.profitPerUnit)}</span></td>
    </tr>`;
  }).join("");
}

/* ------------------------------------------------------------
   8. 全体の再計算（入力変更のたびに呼ばれる）
------------------------------------------------------------ */
function recalcAll() {
  const input = readInputs();          // 入力を取得
  const result = calcSimulation(input);// メイン試算
  renderKpi(result);                   // KPIカード
  renderResultTable(result);           // 明細テーブル
  renderCompareTable(input);           // セット比較表
}

/* ------------------------------------------------------------
   9. 販売チャネル切り替え
------------------------------------------------------------ */

// チャネル選択肢を <select> に流し込む
function initChannelSelect() {
  const sel = document.getElementById("channel");
  sel.innerHTML = CHANNELS.map(function (c) {
    return `<option value="${c.id}">${c.name}</option>`;
  }).join("");
  sel.value = "mercari"; // 初期はメルカリ

  // チャネルを選んだら手数料率を自動入力（customなら手入力を尊重）
  sel.addEventListener("change", function () {
    const ch = CHANNELS.find(function (c) { return c.id === sel.value; });
    if (ch && ch.feeRate !== null) {
      document.getElementById("commissionRate").value = (ch.feeRate * 100).toFixed(2).replace(/\.00$/, "");
    }
    recalcAll();
  });
}

/* ------------------------------------------------------------
   10. 初期化・イベント登録
------------------------------------------------------------ */

// 全input/selectに「変更で自動再計算」を登録
function bindAutoRecalc() {
  document.querySelectorAll("input, select").forEach(function (el) {
    el.addEventListener("input", recalcAll);
  });
}

// 「セット本数から自動計算」ボタン：発送回数を 本数÷セット本数（切り上げ）に
function bindAutoShipments() {
  document.getElementById("autoShipments").addEventListener("click", function () {
    const units = num("unitsSold");
    const size = Math.max(1, num("setSize"));
    document.getElementById("shipments").value = Math.ceil(units / size);
    recalcAll();
  });
}

// 「初期値に戻す」ボタン：ページ再読み込みで初期HTML値に戻す
function bindReset() {
  document.getElementById("resetBtn").addEventListener("click", function () {
    location.reload();
  });
}

// ページ読み込み完了後にすべてセットアップ
document.addEventListener("DOMContentLoaded", function () {
  initChannelSelect();
  bindAutoRecalc();
  bindAutoShipments();
  bindReset();
  recalcAll(); // 初期表示
});
