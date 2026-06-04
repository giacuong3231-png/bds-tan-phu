/**
 * simulator.js — "Mua đứt 1 căn hộ" backtest engine (runs entirely in the browser).
 *
 * Mô hình: mỗi mã đã chọn = MUA ĐỨT 1 căn hộ nguyên căn theo giá của nó tại ngày
 * mở bán (hoặc đầu khoảng thời gian, lấy ngày muộn hơn). Không có khái niệm "số tiền
 * nhập tay" — vốn mua = diện tích × giá/m² tại ngày mua, cộng thuế mua + bảo trì.
 *
 * HỢP ĐỒNG DỮ LIỆU (web/data/, do agent khác sinh):
 *   dataset = { dates:["2010-05-01",...,YYYY-MM-01 THEO THÁNG],
 *               series: { "<key>":[null,...,<giá/m² VND int>,...], "CPI":[100.0,...] },
 *               meta:   { assets:{ "<key>":{ name, group, type, area(m²),
 *                                            handover:"YYYY-MM-01", rental_yield:<phân số>,
 *                                            first_date:"YYYY-MM-01" } },
 *                         groups:[...], presets:{...},
 *                         fees:{ buy_tax, sell_broker, sell_tax, maintenance } },
 *               insights: { "<group>":{ name, story, events:[{date,label}] } },
 *               dateIndex }
 *
 * Usage:
 *   const sim = new Simulator(dataset);
 *   const run = sim.run({ start:'2010-05-01', end:'2026-06-01',
 *                         tickers:['CELADON_A2','CELADON_RUBY'], rentOn:true });
 *   // run.byTicker['<key>'] -> { total:[], capital:[], cumRent:[], real:[], metrics:{...} }
 *   // run.costTotal -> combined cost-basis array (for the flat "vốn mua" reference line)
 *   // run.startIndex / run.endIndex -> slice bounds into dataset.dates
 *
 * Design notes:
 *   - Đường vẽ trên chart cho mỗi mã = total[] (capital + tiền thuê lũy kế nếu bật thuê),
 *     hoặc capital[] khi tắt thuê. Đều là VND tuyệt đối (mức tỷ đồng).
 *   - realTerms: chia mọi giá trị cho CPI[t]/CPI[buyIdx] (đưa về tiền tại ngày mua).
 */

(function () {
  'use strict';

  /** Số năm (có phần lẻ) giữa hai chuỗi ngày ISO. */
  function yearsBetween(isoA, isoB) {
    const a = new Date(isoA + 'T00:00:00Z').getTime();
    const b = new Date(isoB + 'T00:00:00Z').getTime();
    const days = (b - a) / 86400000;
    return days / 365.25;
  }

  class Simulator {
    /**
     * @param {{dates:string[], series:Object<string,(number|null)[]>, meta:Object, dateIndex?:Object}} dataset
     */
    constructor(dataset) {
      this.dates = dataset.dates;
      this.series = dataset.series;
      this.meta = dataset.meta || { assets: {}, fees: {} };
      this.fees = (this.meta && this.meta.fees) || {};
      // Build (or reuse) a date → index lookup.
      if (dataset.dateIndex) {
        this.dateIndex = dataset.dateIndex;
      } else {
        this.dateIndex = Object.create(null);
        for (let i = 0; i < this.dates.length; i++) this.dateIndex[this.dates[i]] = i;
      }
    }

    /** Asset metadata with safe defaults. */
    _assetMeta(ticker) {
      return (this.meta.assets && this.meta.assets[ticker]) || {};
    }

    /** Giá/m² series cho 1 mã. */
    _ppsmSeries(ticker) {
      return this.series[ticker];
    }

    /** Chỉ số ngày trên trục chung cho 1 chuỗi ISO; -1 nếu trước trục, dates.length nếu sau. */
    _idxOnOrAfter(iso) {
      const dates = this.dates;
      let i = 0;
      while (i < dates.length && dates[i] < iso) i++;
      return i; // first index with dates[i] >= iso (có thể = length nếu vượt trục)
    }

    /**
     * Clamp khoảng [start,end] về trục dữ liệu VÀ về ngày mở bán (first non-null) của mã.
     * Trả về { lo, hi } inclusive, hoặc null nếu không có overlap.
     *   - lo = max(rangeStartIdx, firstIdx)   (ngày MUA)
     *   - hi = endIdx (clamp về trục)
     */
    _effectiveRange(ticker, start, end) {
      const dates = this.dates;
      // Bounds của cửa sổ trên trục (inclusive).
      let lo = 0;
      while (lo < dates.length && dates[lo] < start) lo++;
      let hi = dates.length - 1;
      while (hi >= 0 && dates[hi] > end) hi--;
      if (lo > hi) return null;

      // Bỏ qua null đầu chuỗi (trước khi mở bán) cho mã NÀY → buyIdx = max(start, first).
      const ppsm = this._ppsmSeries(ticker);
      if (!ppsm) return null;
      while (lo <= hi && (ppsm[lo] === null || ppsm[lo] === undefined)) lo++;
      if (lo > hi) return null;
      return { lo, hi };
    }

    /**
     * Chạy backtest "mua đứt 1 căn" cho MỘT mã.
     * @returns {{total:number[], capital:number[], cumRent:number[], real:(number|null)[],
     *            metrics:Object}|null}
     *          Arrays FULL-LENGTH (dataset.dates length); entries trước ngày mua = 0
     *          (total/capital/cumRent) hoặc null (real). null nếu mã không bao giờ giao dịch.
     */
    runTicker(ticker, params) {
      const { start, end, rentOn } = params;
      const N = this.dates.length;
      const m = this._assetMeta(ticker);
      const f = this.fees;

      const total = new Array(N).fill(0);
      const capital = new Array(N).fill(0);
      const cumRent = new Array(N).fill(0);
      const real = new Array(N).fill(null);

      const range = this._effectiveRange(ticker, start, end);
      if (!range) return null;

      const { lo: buyIdx, hi: endIdx } = range;
      const ppsm = this._ppsmSeries(ticker);
      const area = Number(m.area) || 0;
      const ry = Number(m.rental_yield) || 0;          // phân số/năm, vd 0.048
      const cpi = this.series.CPI || null;
      const cpiBase = cpi ? cpi[buyIdx] : null;        // CPI tại ngày mua (mốc real-return)

      // Bàn giao: tháng bắt đầu cho thuê. Nếu chưa có/đã qua, dùng max(buyIdx, handoverIdx).
      let handoverIdx = buyIdx;
      if (m.handover) {
        const hi2 = this._idxOnOrAfter(m.handover);
        handoverIdx = Math.max(buyIdx, Math.min(hi2, N - 1));
      }

      const buyPpsm = ppsm[buyIdx];
      const giaCan0 = area * buyPpsm;                  // giá trị căn tại ngày mua
      // Vốn mua (cost basis) = giá căn × (1 + thuế mua + bảo trì).
      const costBasis = giaCan0 * (1 + (f.buy_tax || 0) + (f.maintenance || 0));

      // --- Đi theo từng tháng t ∈ [buyIdx..endIdx] ----------------------------
      let maxValue = 0;
      let maxDrawdown = 0;

      for (let t = buyIdx; t <= endIdx; t++) {
        const px = ppsm[t];
        const isNull = (px === null || px === undefined);

        // Giá trị căn theo giá/m² hiện tại; giữ giá trị cũ qua tháng thiếu dữ liệu.
        const cap = isNull ? (t > buyIdx ? capital[t - 1] : giaCan0) : area * px;
        capital[t] = cap;

        // Tiền cho thuê lũy kế: chỉ tính từ tháng bàn giao trở đi.
        const prevRent = (t > buyIdx) ? cumRent[t - 1] : 0;
        if (t >= handoverIdx) {
          cumRent[t] = prevRent + cap * ry / 12;
        } else {
          cumRent[t] = 0;
        }

        const tot = cap + (rentOn ? cumRent[t] : 0);
        total[t] = tot;

        // realTerms: chia cho CPI[t]/CPI[buyIdx].
        if (cpi && cpiBase && cpi[t]) {
          real[t] = tot / (cpi[t] / cpiBase);
        } else if (t > buyIdx) {
          real[t] = real[t - 1];
        }

        // Max drawdown tính trên total[].
        if (tot > maxValue) maxValue = tot;
        if (maxValue > 0) {
          const dd = (maxValue - tot) / maxValue;
          if (dd > maxDrawdown) maxDrawdown = dd;
        }
      }

      // --- Bán cuối kỳ --------------------------------------------------------
      const capEnd = capital[endIdx] || 0;
      const rentEnd = rentOn ? (cumRent[endIdx] || 0) : 0;
      const netSale = capEnd * (1 - (f.sell_broker || 0) - (f.sell_tax || 0));
      const netValue = netSale + rentEnd;
      const profit = netValue - costBasis;
      const pctReturn = costBasis > 0 ? profit / costBasis : 0;

      // CAGR trên đường nắm giữ (ngày mua → cuối kỳ).
      const holdYears = yearsBetween(this.dates[buyIdx], this.dates[endIdx]);
      let cagr = 0;
      if (costBasis > 0 && netValue > 0 && holdYears > 0) {
        cagr = Math.pow(netValue / costBasis, 1 / holdYears) - 1;
      }

      // Giá trị thực cuối kỳ (đưa total cuối về tiền tại ngày mua).
      const finalReal = (real[endIdx] !== null && real[endIdx] !== undefined)
        ? real[endIdx] : (capEnd + rentEnd);

      return {
        total,
        capital,
        cumRent,
        real,
        metrics: {
          ticker,
          costBasis,                 // vốn mua
          capitalEnd: capEnd,        // giá trị căn cuối kỳ (chưa trừ phí bán)
          cumRentEnd: cumRent[endIdx] || 0,
          netValue,                  // giá trị ròng khi bán (đã trừ phí + cộng thuê)
          netSale,
          profit,                    // lãi ròng VND
          pctReturn,                 // % lãi ròng (phân số)
          cagr,
          maxDrawdown,
          finalReal,
          holdYears,
          area,
          rentalYield: ry,
          buyPpsm,
          buyDate: this.dates[buyIdx],
          handoverDate: this.dates[handoverIdx],
          lastDate: this.dates[endIdx],
          startIndex: buyIdx,
          endIndex: endIdx,
        },
      };
    }

    /**
     * Chạy cho nhiều mã cùng lúc.
     * @param {{start:string, end:string, tickers:string[], rentOn:boolean}} params
     * @returns {{byTicker:Object, costTotal:number[], order:string[],
     *            startIndex:number, endIndex:number}}
     */
    run(params) {
      const tickers = params.tickers || [];
      const N = this.dates.length;
      const byTicker = {};
      const order = [];

      let globalLo = N - 1;
      let globalHi = 0;

      for (const t of tickers) {
        const res = this.runTicker(t, params);
        if (!res) continue;
        byTicker[t] = res;
        order.push(t);
        globalLo = Math.min(globalLo, res.metrics.startIndex);
        globalHi = Math.max(globalHi, res.metrics.endIndex);
      }

      if (order.length === 0) {
        const r = this._windowIndices(params.start, params.end);
        return { byTicker, costTotal: new Array(N).fill(0), order,
                 startIndex: r.lo, endIndex: r.hi };
      }

      // Đường "vốn mua" tham chiếu (phẳng theo mỗi mã = costBasis kể từ ngày mua).
      // Khi nhiều mã, lấy MAX costBasis còn hiệu lực tại mỗi tháng làm mốc lời/lỗ.
      const costTotal = new Array(N).fill(0);
      for (let i = 0; i < N; i++) {
        let best = 0;
        for (const t of order) {
          const mt = byTicker[t].metrics;
          if (i >= mt.startIndex && i <= mt.endIndex && mt.costBasis > best) {
            best = mt.costBasis;
          }
        }
        costTotal[i] = best;
      }

      return { byTicker, costTotal, order, startIndex: globalLo, endIndex: globalHi };
    }

    /** Cửa sổ [start,end] → inclusive indices trên trục (không bỏ null). */
    _windowIndices(start, end) {
      const dates = this.dates;
      let lo = 0;
      while (lo < dates.length && dates[lo] < start) lo++;
      let hi = dates.length - 1;
      while (hi >= 0 && dates[hi] > end) hi--;
      if (lo > hi) { lo = 0; hi = Math.max(0, dates.length - 1); }
      return { lo, hi };
    }
  }

  // Expose globally (no module system in this no-build app).
  window.Simulator = Simulator;
})();
