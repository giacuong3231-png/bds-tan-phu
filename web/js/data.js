/**
 * data.js — Nạp và lộ dữ liệu giá BĐS (theo m²), metadata, và insights.
 *
 * Thứ tự nạp:
 *   1. ./data/data.json   (pipeline output — dữ liệu thật)
 *   2. ./data/meta.json
 *   3. ./data/insights.json
 *   4. Nếu THIẾU file nào → fallback sang mock tối thiểu (đúng shape BĐS) bên dưới.
 *
 * Export một promise duy nhất: window.dataReady
 * Resolve với: { dates, series, meta, insights, dateIndex }
 *
 * HỢP ĐỒNG DỮ LIỆU (xem simulator.js để biết chi tiết):
 *   - dates THEO THÁNG (YYYY-MM-01)
 *   - series["<key>"] = giá/m² (VND int), null trước ngày mở bán; series.CPI = chỉ số
 *   - meta.assets["<key>"] = { name, group, type, area(m²), handover, rental_yield, first_date }
 *   - meta.groups = thứ tự hiển thị nhóm ; meta.presets ; meta.fees
 *   - insights KEY THEO group: { "<group>": { name, story, events:[{date,label}] } }
 */

(function () {
  'use strict';

  // ─── Mock tối thiểu (đúng shape BĐS, luôn có sẵn, không cần mạng) ─────────────
  const MOCK_META = {
    generated_at: 'mock',
    base_currency: 'VND',
    assets: {
      DEMO_2PN: {
        name: 'Căn 2PN mẫu', group: 'Demo', type: 'apartment',
        area: 70, handover: '2018-01-01', rental_yield: 0.05, first_date: '2015-01-01',
      },
      DEMO_3PN: {
        name: 'Căn 3PN mẫu', group: 'Demo', type: 'apartment',
        area: 95, handover: '2019-01-01', rental_yield: 0.045, first_date: '2016-01-01',
      },
    },
    groups: ['Demo'],
    presets: {
      'Demo': ['DEMO_2PN', 'DEMO_3PN'],
    },
    fees: {
      buy_tax: 0.005, sell_broker: 0.015, sell_tax: 0.02, maintenance: 0.02,
    },
  };

  const MOCK_INSIGHTS = {
    Demo: {
      name: 'Phân khu Demo',
      story: 'Dữ liệu mẫu dùng khi chưa nạp được data thật. Mỗi căn được mua đứt tại ngày mở bán; giá trị thay đổi theo giá/m² và cộng thêm tiền cho thuê sau bàn giao.',
      events: [
        { date: '2018-01-01', label: 'Bàn giao' },
      ],
    },
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  /** Thử fetch một file JSON. Trả về object đã parse hoặc null nếu lỗi. */
  async function tryFetch(url) {
    try {
      const resp = await fetch(url);
      if (!resp.ok) return null;
      return await resp.json();
    } catch (e) {
      console.warn('[data.js] Could not load', url, '—', e.message);
      return null;
    }
  }

  /** Trộn mock meta với meta thật (thật ưu tiên, mock lấp chỗ trống). */
  function mergeMeta(real) {
    if (!real) return MOCK_META;
    return {
      ...MOCK_META,
      ...real,
      assets: { ...(real.assets || {}) },
      groups: (real.groups && real.groups.length) ? real.groups : MOCK_META.groups,
      presets: { ...(real.presets || {}) },
      fees: { ...MOCK_META.fees, ...(real.fees || {}) },
    };
  }

  /** Trộn mock insights với insights thật (KEY THEO group). */
  function mergeInsights(real) {
    if (!real) return MOCK_INSIGHTS;
    return { ...real };
  }

  // ─── Main loader ─────────────────────────────────────────────────────────────

  window.dataReady = (async function () {
    // Thử nạp song song cả ba file pipeline.
    const [realData, realMeta, realInsights] = await Promise.all([
      tryFetch('./data/data.json'),
      tryFetch('./data/meta.json'),
      tryFetch('./data/insights.json'),
    ]);

    let dates, series;

    if (realData && realData.dates && realData.series) {
      dates  = realData.dates;
      series = realData.series;
      console.info('[data.js] Loaded real data.json —', dates.length, 'tháng');
    } else {
      // Fallback: thử sample-data.json, rồi stub tối thiểu.
      console.warn('[data.js] data.json thiếu/lỗi — thử sample-data.json');
      const sample = await tryFetch('./data/sample-data.json');
      if (sample && sample.dates && sample.series) {
        dates  = sample.dates;
        series = sample.series;
        console.info('[data.js] Loaded sample-data.json —', dates.length, 'điểm');
      } else {
        // Cuối cùng: stub nội tuyến (giá/m² theo tháng) để trang không bao giờ trắng.
        console.warn('[data.js] sample-data.json cũng thiếu — dùng stub cứng');
        dates = ['2015-01-01', '2018-01-01', '2021-01-01', '2024-01-01', '2026-06-01'];
        series = {
          DEMO_2PN: [22000000, 30000000, 42000000, 55000000, 62000000],
          DEMO_3PN: [null,     33000000, 46000000, 60000000, 68000000],
          CPI:      [100.0,    112.0,    122.0,    134.0,    142.0],
        };
      }
    }

    const meta     = mergeMeta(realMeta);
    const insights = mergeInsights(realInsights);

    // Build map tra nhanh date → index.
    const dateIndex = Object.create(null);
    for (let i = 0; i < dates.length; i++) dateIndex[dates[i]] = i;

    return { dates, series, meta, insights, dateIndex };
  })();

})();
