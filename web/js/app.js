/**
 * app.js — Alpine.js state + glue giữa controls, Simulator (mua đứt 1 căn), và ECharts.
 *
 * Alpine giữ state THUẦN (range, mã đã chọn, toggles rentOn/realTerms/markers) và các
 * dòng tóm tắt/cards dẫn xuất. Instance ECharts nặng nằm trong BacktestChart (singleton
 * không reactive) nên Alpine không proxy nó. Mọi thay đổi liên quan gọi recompute() →
 * Simulator.run() → BacktestChart.render() + refresh bảng/cards.
 *
 * Đăng ký global, dùng bởi  <div x-data="backtestApp()">.
 */

/* global Simulator, BacktestChart */

// ─── vi-VN number formatting helpers ──────────────────────────────────────────

/** Format gọn "₫ / triệu / tỷ" cho cards & ô tiền (mức tỷ đồng). */
function fmtMoney(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  const n = Math.abs(v);
  const sign = v < 0 ? '-' : '';
  if (n >= 1e9) return sign + (n / 1e9).toLocaleString('vi-VN', { maximumFractionDigits: 2 }) + ' tỷ';
  if (n >= 1e6) return sign + (n / 1e6).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + ' triệu';
  return sign + Math.round(n).toLocaleString('vi-VN') + ' ₫';
}

/** VND chính xác có dấu phân cách (cho ô bảng). */
function fmtVndExact(v) {
  if (v === null || v === undefined || isNaN(v)) return '—';
  return Math.round(v).toLocaleString('vi-VN') + ' ₫';
}

/** Phần trăm có dấu, 1 chữ số thập phân, vi-VN. */
function fmtPct(frac) {
  if (frac === null || frac === undefined || isNaN(frac)) return '—';
  const sign = frac > 0 ? '+' : '';
  return sign + (frac * 100).toLocaleString('vi-VN', { maximumFractionDigits: 1 }) + '%';
}

// ─── Alpine component factory ──────────────────────────────────────────────────

function backtestApp() {
  return {
    // ----- state -----
    ready: false,
    loadError: '',

    start: '2010-05-01',
    end: '2026-06-01',
    minDate: '2010-05-01',
    maxDate: '2026-06-01',

    tickers: [],                 // các mã (căn hộ) đã chọn
    rentOn: true,                // tính tiền cho thuê
    markersOn: false,
    realTerms: false,
    isPlaying: false,

    presets: {},                 // tên -> [mã]
    activePreset: '',
    groups: [],                  // [{ group, label, assets:[{key,name,...}] }]
    storyTicker: '',             // mã có story đang hiển thị ở panel

    // dẫn xuất/hiển thị
    summaryRows: [],             // dòng metric theo mã cho bảng
    cards: null,                 // cards headline tổng hợp
    colors: {},                  // mã -> màu (mirror palette chart)

    // handle không reactive
    _dataset: null,
    _sim: null,
    _lastRun: null,

    // ----- lifecycle -----
    async init() {
      try {
        const d = await window.dataReady;
        this._dataset = d;
        this._sim = new Simulator(d);

        // Mốc thời gian từ trục dữ liệu.
        this.minDate = d.dates[0];
        this.maxDate = d.dates[d.dates.length - 1];
        this.start = this.minDate;
        this.end = this.maxDate;

        this.presets = (d.meta && d.meta.presets) || {};
        this._buildGroups();

        // Khởi tạo ECharts.
        const el = this.$refs.chart;
        BacktestChart.init(el);

        // Mặc định 1 preset để giảm tải nhận thức.
        const presetNames = Object.keys(this.presets);
        const preferred = presetNames.find(n => n === 'So 3 phân khu Celadon')
                       || presetNames.find(n => n === '2PN phổ biến')
                       || presetNames[0];
        if (preferred) {
          this.applyPreset(preferred);
        } else {
          // Không có preset → lấy 1-2 mã hợp lệ đầu tiên.
          this.tickers = this._allTickerKeys().slice(0, 2);
          this.recompute();
        }

        // Story mặc định = mã đầu tiên đã chọn.
        if (this.tickers.length) this.storyTicker = this.tickers[0];

        // Responsive: re-fit chart khi resize.
        window.addEventListener('resize', () => BacktestChart.resize());

        this.ready = true;
        this.$nextTick(() => { BacktestChart.resize(); });
      } catch (e) {
        console.error('[app.js] init failed', e);
        this.loadError = e && e.message ? e.message : String(e);
      }
    },

    // ----- gom nhóm căn hộ theo meta.groups -----
    _buildGroups() {
      const assets = (this._dataset.meta && this._dataset.meta.assets) || {};
      const series = this._dataset.series || {};
      // Thứ tự hiển thị nhóm từ meta.groups; nếu thiếu, tự suy ra từ assets.
      const orderList = (this._dataset.meta && this._dataset.meta.groups) || [];
      const buckets = {};   // group -> [{key,...}]
      const seen = [];

      Object.keys(assets).forEach(key => {
        // Chỉ liệt kê mã thực sự có chuỗi giá (để nút không bao giờ vỡ).
        if (!series[key]) return;
        // CPI là chỉ số vĩ mô dùng nội bộ cho real-return; không phải căn để chọn.
        if (key === 'CPI') return;
        const a = assets[key];
        const grp = a.group || 'Khác';
        if (!buckets[grp]) { buckets[grp] = []; seen.push(grp); }
        buckets[grp].push({
          key,
          name: a.name || key,
          group: grp,
          type: a.type || '',
          area: a.area || null,
        });
      });

      // Sắp nhóm theo meta.groups trước, phần còn lại nối sau (giữ thứ tự gặp).
      const ordered = [];
      orderList.forEach(g => { if (buckets[g]) ordered.push(g); });
      seen.forEach(g => { if (ordered.indexOf(g) < 0) ordered.push(g); });

      this.groups = ordered.map(g => ({ group: g, label: g, assets: buckets[g] }));
    },

    _allTickerKeys() {
      const out = [];
      this.groups.forEach(g => g.assets.forEach(a => out.push(a.key)));
      return out;
    },

    // ----- user actions -----
    toggleTicker(key) {
      const i = this.tickers.indexOf(key);
      if (i >= 0) {
        this.tickers.splice(i, 1);
        if (this.storyTicker === key) {
          this.storyTicker = this.tickers[0] || '';
        }
      } else {
        // Soft cap để chart còn đọc được.
        if (this.tickers.length >= 8) return;
        this.tickers.push(key);
        this.storyTicker = key; // hiện story của mã vừa thêm
      }
      this.activePreset = ''; // thay đổi thủ công bỏ highlight preset
      this.recompute();
    },

    isSelected(key) {
      return this.tickers.indexOf(key) >= 0;
    },

    applyPreset(name) {
      const list = (this.presets[name] || []).filter(k => !!this._dataset.series[k]);
      this.tickers = list.slice(0, 8);
      this.activePreset = name;
      this.storyTicker = this.tickers[0] || '';
      this.recompute();
    },

    toggleRent() {
      this.rentOn = !this.rentOn;
      this.recompute();
    },

    toggleMarkers() {
      this.markersOn = !this.markersOn;
      BacktestChart.setMarkers(this.markersOn);
    },

    toggleRealTerms() {
      this.realTerms = !this.realTerms;
      this.recompute();
    },

    setStory(key) {
      this.storyTicker = key;
    },

    play() {
      if (!this._lastRun) return;
      this.isPlaying = true;
      BacktestChart.play();
      // Bật lại controls sau khi reveal xong (~48 frame × 28ms + buffer).
      window.setTimeout(() => { this.isPlaying = false; }, 48 * 28 + 400);
    },

    setRange() {
      // Guard: start phải trước end.
      if (this.start > this.end) {
        const t = this.start; this.start = this.end; this.end = t;
      }
      this.recompute();
    },

    quickRange(years) {
      // start = maxDate - N năm (clamp về minDate). years=0 → toàn lịch sử.
      if (!years) {
        this.start = this.minDate;
      } else {
        const end = new Date(this.maxDate + 'T00:00:00Z');
        end.setUTCFullYear(end.getUTCFullYear() - years);
        const iso = end.toISOString().slice(0, 10);
        this.start = iso < this.minDate ? this.minDate : iso;
      }
      this.end = this.maxDate;
      this.recompute();
    },

    // ----- lõi recompute → render -----
    recompute() {
      if (!this._sim) return;
      const params = {
        start: this.start,
        end: this.end,
        tickers: this.tickers.slice(),
        rentOn: this.rentOn,
      };
      const run = this._sim.run(params);
      this._lastRun = run;

      // Màu ổn định theo mã (mirror palette chart).
      this.colors = BacktestChart.paletteFor(run.order);

      // Vẽ chart.
      BacktestChart.render(run, {
        dates: this._dataset.dates,
        dateIndex: this._dataset.dateIndex,
        series: this._dataset.series,
        meta: this._dataset.meta,
        insights: this._dataset.insights,
        tickerColors: this.colors,
        realTerms: this.realTerms,
      });
      // Markers có thể bị reset bởi notMerge render → bật lại nếu đang on.
      if (this.markersOn) BacktestChart.setMarkers(true);

      this._buildSummary(run);
    },

    _buildSummary(run) {
      const assets = this._dataset.meta.assets || {};
      const rows = run.order.map(t => {
        const m = run.byTicker[t].metrics;
        return {
          key: t,
          name: (assets[t] && assets[t].name) || t,
          color: this.colors[t],
          costBasis: m.costBasis,
          netValue: m.netValue,
          cumRentEnd: m.cumRentEnd,
          profit: m.profit,
          pctReturn: m.pctReturn,
          cagr: m.cagr,
          maxDrawdown: m.maxDrawdown,
          finalReal: m.finalReal,
          // formatted
          fCost: fmtMoney(m.costBasis),
          fValue: fmtMoney(m.netValue),
          fRent: fmtMoney(m.cumRentEnd),
          fPct: fmtPct(m.pctReturn),
          fCagr: fmtPct(m.cagr),
          fDd: fmtPct(-m.maxDrawdown),
          fReal: fmtMoney(m.finalReal),
          up: m.profit >= 0,
        };
      });
      // Sắp theo giá trị ròng giảm dần → "căn thắng" lên đầu.
      rows.sort((a, b) => b.netValue - a.netValue);
      this.summaryRows = rows;

      // Cards headline = TỔNG HỢP toàn bộ mã đã chọn.
      let totCost = 0, totVal = 0;
      run.order.forEach(t => {
        const m = run.byTicker[t].metrics;
        totCost += m.costBasis;
        totVal += m.netValue;
      });
      const totProfit = totVal - totCost;
      const totPct = totCost > 0 ? totProfit / totCost : 0;
      this.cards = {
        cost: fmtMoney(totCost),
        value: fmtMoney(totVal),
        profitPct: fmtPct(totPct),
        profit: fmtMoney(totProfit),
        up: totProfit >= 0,
        nTickers: run.order.length,
      };
    },

    // ----- helpers lộ ra template -----
    fmtMoney, fmtVndExact, fmtPct,

    currentStory() {
      const t = this.storyTicker;
      if (!t) return null;
      const a = (this._dataset && this._dataset.meta.assets && this._dataset.meta.assets[t]) || {};
      const grp = a.group || null;
      const ins = (grp && this._dataset && this._dataset.insights && this._dataset.insights[grp]) || null;
      if (!ins) return { name: a.name || t, story: 'Chưa có dữ liệu câu chuyện cho căn hộ này.', color: this.colors[t] };
      return { name: a.name || ins.name || t, story: ins.story || '', color: this.colors[t] };
    },
  };
}

// Cho Alpine thấy factory (Alpine tự init).
window.backtestApp = backtestApp;
