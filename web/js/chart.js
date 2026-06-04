/**
 * chart.js — ECharts wrapper cho biểu đồ backtest "mua đứt 1 căn hộ".
 *
 * Mỗi mã đã chọn = 1 đường (giá trị căn theo thời gian = total[], hoặc capital[] khi
 * tắt thuê). Thêm 1 đường mờ "vốn mua" (phẳng = costBasis) làm mốc lời/lỗ. Mốc sự kiện
 * (markLine) lấy từ insights.json (KEY THEO group) và bật/tắt được (mặc định TẮT).
 * Nút "Phát lại" reveal trái→phải. Re-render khi resize.
 *
 * Public API (window.BacktestChart):
 *   init(domEl)        -> tạo ECharts instance
 *   render(run, ctx)   -> vẽ một kết quả run đầy đủ
 *   setMarkers(on)     -> bật/tắt mốc sự kiện (re-render)
 *   play()/stop()      -> animate reveal trái→phải
 *   resize()           -> forward echarts.resize()
 *
 * `ctx`: { dates, dateIndex, series, meta, insights, tickerColors, realTerms }
 */

(function () {
  'use strict';

  // Bảng màu tương phản cao nhưng dịu (nền tối). Thứ tự ổn định = màu ổn định.
  const PALETTE = [
    '#4ea1ff', // blue
    '#ff7a59', // coral
    '#36d399', // green
    '#f5c451', // amber
    '#b58cff', // violet
    '#ff6b9d', // pink
    '#4dd0e1', // cyan
    '#a3e635', // lime
  ];
  const COST_COLOR = '#7d8590'; // xám mờ cho đường "vốn mua"
  const GRID_COLOR = '#222831';
  const AXIS_COLOR = '#3a4250';
  const TEXT_COLOR = '#c9d1d9';
  const TEXT_DIM = '#8b949e';

  // Format VND gọn cho nhãn trục: tỷ / triệu / nghìn.
  function fmtAxisVnd(v) {
    const n = Math.abs(v);
    if (n >= 1e9) return (v / 1e9).toFixed(n >= 1e10 ? 0 : 1).replace('.', ',') + ' tỷ';
    if (n >= 1e6) return Math.round(v / 1e6) + ' tr';
    if (n >= 1e3) return Math.round(v / 1e3) + 'k';
    return String(Math.round(v));
  }

  // Format VND đầy đủ cho tooltip.
  function fmtVnd(v) {
    return Math.round(v).toLocaleString('vi-VN') + ' ₫';
  }

  // Tra group của 1 mã (insights key theo group).
  function groupOf(ctx, ticker) {
    const a = ctx.meta && ctx.meta.assets && ctx.meta.assets[ticker];
    return (a && a.group) || null;
  }

  const BacktestChart = {
    chart: null,
    _lastRun: null,
    _lastCtx: null,
    _markersOn: false,
    _playTimer: null,

    init(domEl) {
      if (!domEl) throw new Error('[chart.js] init() needs a DOM element');
      // `echarts` được nạp từ CDN trước script này.
      this.chart = echarts.init(domEl, null, { renderer: 'canvas' });
      return this.chart;
    },

    setMarkers(on) {
      this._markersOn = !!on;
      if (this._lastRun) this.render(this._lastRun, this._lastCtx);
    },

    /**
     * Dựng mảng `series` của ECharts cho một run.
     * @param {Object} run   kết quả Simulator.run()
     * @param {Object} ctx   ngữ cảnh nhãn/màu
     * @param {number} [limitIdx]  nếu set, chỉ reveal tới index này (Play)
     */
    _buildSeries(run, ctx, limitIdx) {
      const dates = ctx.dates;
      const series = [];
      const realTerms = !!ctx.realTerms;

      // ── Mỗi mã một đường giá trị căn ──────────────────────────────────────
      run.order.forEach((ticker, i) => {
        const res = run.byTicker[ticker];
        const color = (ctx.tickerColors && ctx.tickerColors[ticker]) || PALETTE[i % PALETTE.length];
        // realTerms → real[]; ngược lại → total[] (đã gồm thuê nếu bật, do simulator quyết định).
        const valArr = realTerms ? res.real : res.total;

        // Đổi thành cặp [dateString, value], chỉ trong khoảng sống của mã
        // (bỏ leading zeros để đường của mã mở bán muộn bắt đầu tại ngày mua, không từ 0).
        const start = res.metrics.startIndex;
        const end = res.metrics.endIndex;
        const data = [];
        const cap = (typeof limitIdx === 'number') ? Math.min(end, limitIdx) : end;
        for (let d = start; d <= cap; d++) {
          const y = valArr[d];
          data.push([dates[d], (y === null || y === undefined) ? null : Math.round(y)]);
        }

        // Mốc sự kiện từ insights (KEY THEO group), bật/tắt được.
        let markLine;
        const grp = groupOf(ctx, ticker);
        const ins = grp && ctx.insights && ctx.insights[grp];
        if (this._markersOn && ins && ins.events) {
          const evs = ins.events
            .filter(e => {
              const idx = ctx.dateIndex ? ctx.dateIndex[e.date] : null;
              if (idx === null || idx === undefined) {
                // Ngày sự kiện có thể không trùng đúng mốc tháng → so chuỗi trong [start,cap].
                return e.date >= dates[start] && e.date <= dates[cap];
              }
              return idx >= start && idx <= cap;
            })
            .map(e => ({ xAxis: e.date, label: { formatter: e.label } }));
          if (evs.length) {
            markLine = {
              symbol: ['none', 'none'],
              silent: false,
              lineStyle: { color: color, type: 'dashed', opacity: 0.5, width: 1 },
              label: {
                color: TEXT_DIM, fontSize: 10, fontFamily: 'Inter, sans-serif',
                formatter: (p) => p.data.label.formatter,
                position: 'insideEndTop', rotate: 0,
              },
              data: evs,
            };
          }
        }

        series.push({
          name: (ctx.meta.assets[ticker] && ctx.meta.assets[ticker].name) || ticker,
          type: 'line',
          smooth: false,
          showSymbol: false,
          symbolSize: 6,
          sampling: 'lttb',
          lineStyle: { width: 2.2, color },
          itemStyle: { color },
          emphasis: { focus: 'series', lineStyle: { width: 3.2 } },
          connectNulls: false,
          z: 5,
          data,
          markLine,
          // lưu key để tooltip có thể resolve
          _ticker: ticker,
        });
      });

      // ── Đường mờ "Vốn mua" (cost basis, phẳng) làm mốc lời/lỗ ──────────────
      // Ẩn ở chế độ giá trị thực (cost basis không quy đổi lạm phát ở đây).
      if (!realTerms) {
        const c = run.costTotal;
        const startIdx = run.startIndex;
        const endIdx = run.endIndex;
        const cap = (typeof limitIdx === 'number') ? Math.min(endIdx, limitIdx) : endIdx;
        const data = [];
        for (let d = startIdx; d <= cap; d++) {
          data.push([dates[d], c[d] ? Math.round(c[d]) : 0]);
        }
        series.push({
          name: 'Vốn mua',
          type: 'line',
          smooth: false,
          showSymbol: false,
          lineStyle: { width: 1.6, color: COST_COLOR, type: 'dashed' },
          itemStyle: { color: COST_COLOR },
          emphasis: { disabled: true },
          z: 3,
          data,
          _ticker: '__cost',
        });
      }

      return series;
    },

    _buildOption(run, ctx, limitIdx) {
      const series = this._buildSeries(run, ctx, limitIdx);
      const legendNames = series.map(s => s.name);

      return {
        backgroundColor: 'transparent',
        animation: true,
        animationDuration: 600,
        animationEasing: 'cubicOut',
        color: PALETTE,
        textStyle: { fontFamily: 'Inter, sans-serif', color: TEXT_COLOR },
        grid: { left: 64, right: 24, top: 40, bottom: 56 },
        legend: {
          data: legendNames,
          top: 4,
          textStyle: { color: TEXT_DIM, fontFamily: 'Inter, sans-serif', fontSize: 12 },
          inactiveColor: '#4a525e',
          icon: 'roundRect',
          itemWidth: 14, itemHeight: 4,
        },
        tooltip: {
          trigger: 'axis',
          backgroundColor: 'rgba(20,24,30,0.96)',
          borderColor: AXIS_COLOR,
          borderWidth: 1,
          padding: [10, 12],
          textStyle: { color: TEXT_COLOR, fontFamily: 'Inter, sans-serif', fontSize: 12 },
          axisPointer: { type: 'line', lineStyle: { color: AXIS_COLOR, type: 'dashed' } },
          formatter: function (paramsArr) {
            if (!paramsArr || !paramsArr.length) return '';
            const dateStr = paramsArr[0].axisValueLabel || paramsArr[0].axisValue;
            let html = '<div style="font-family:Inter;font-size:11px;color:' + TEXT_DIM +
                       ';margin-bottom:6px">' + dateStr + '</div>';
            paramsArr.forEach(p => {
              const val = (p.value && p.value[1] !== null && p.value[1] !== undefined)
                ? '<span style="font-family:\'JetBrains Mono\',monospace">' + fmtVnd(p.value[1]) + '</span>'
                : '—';
              html += '<div style="display:flex;justify-content:space-between;gap:16px;line-height:1.7">' +
                        '<span>' + p.marker + p.seriesName + '</span>' +
                        '<span>' + val + '</span></div>';
            });
            return html;
          },
        },
        xAxis: {
          type: 'time',
          boundaryGap: false,
          axisLine: { lineStyle: { color: AXIS_COLOR } },
          axisLabel: {
            color: TEXT_DIM, fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            // Dữ liệu theo THÁNG (YYYY-MM-01) → ưu tiên năm + tháng.
            formatter: { year: '{yyyy}', month: '{MMM}', day: '{MMM}' },
          },
          axisTick: { show: false },
          splitLine: { show: false },
        },
        yAxis: {
          type: 'value',
          scale: false,
          axisLine: { show: false },
          axisTick: { show: false },
          axisLabel: {
            color: TEXT_DIM, fontFamily: 'JetBrains Mono, monospace', fontSize: 11,
            formatter: fmtAxisVnd,
          },
          splitLine: { lineStyle: { color: GRID_COLOR, type: 'solid' } },
        },
        dataZoom: [
          { type: 'inside', filterMode: 'none' },
        ],
        series,
      };
    },

    render(run, ctx) {
      this._lastRun = run;
      this._lastCtx = ctx;
      if (!this.chart) return;
      this.stop(); // huỷ animation đang chạy
      const opt = this._buildOption(run, ctx);
      // `notMerge:true` để mã/mốc đã gỡ được xoá sạch.
      this.chart.setOption(opt, { notMerge: true });
    },

    /**
     * Phát lại: reveal trái→phải bằng cách mở rộng dần cửa sổ index hiển thị,
     * rồi settle về option đầy đủ.
     */
    play() {
      if (!this.chart || !this._lastRun) return;
      this.stop();
      const run = this._lastRun;
      const ctx = this._lastCtx;
      const from = run.startIndex;
      const to = run.endIndex;
      if (to <= from) { this.render(run, ctx); return; }

      const FRAMES = 48;
      let frame = 0;
      const step = () => {
        frame++;
        const t = frame / FRAMES;
        const idx = Math.round(from + (to - from) * t);
        const opt = this._buildOption(run, ctx, idx);
        opt.animation = false;
        this.chart.setOption(opt, { notMerge: true, lazyUpdate: true });
        if (frame >= FRAMES) {
          this.stop();
          const full = this._buildOption(run, ctx);
          full.animation = false;
          this.chart.setOption(full, { notMerge: true });
          return;
        }
        this._playTimer = window.setTimeout(step, 28);
      };
      step();
    },

    stop() {
      if (this._playTimer) {
        window.clearTimeout(this._playTimer);
        this._playTimer = null;
      }
    },

    resize() {
      if (this.chart) this.chart.resize();
    },

    // Lộ palette để app.js gán màu ổn định theo mã cho cards/table.
    paletteFor(order) {
      const map = {};
      order.forEach((t, i) => { map[t] = PALETTE[i % PALETTE.length]; });
      return map;
    },
  };

  window.BacktestChart = BacktestChart;
})();
