#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
build_data.py — Tầng dữ liệu cho web app backtest BĐS (Tây Sài Gòn / Tân Phú).

Pure Python 3 stdlib only (csv, json, math, datetime). KHÔNG pandas / numpy.

Quy trình:
  1. Đọc data/anchors.csv  (bảng giá neo từng mã căn hộ).
  2. Đọc data/market_index.csv  (chỉ số thị trường theo vài mốc xương sống).
  3. Nội suy market_index ra MẢNG THEO THÁNG (log-tuyến tính) cho mọi tháng
     từ 2010-05 đến 2026-06.  -> m[]  (trục dates[] = ngày đầu mỗi tháng "YYYY-MM-01").
  4. Với mỗi mã, "nội suy neo theo chỉ số": chạm đúng giá launch tại tháng launch,
     đúng giá mid tại tháng mid (nếu hợp lệ), và đúng current_ppsm tại 2026-06.
  5. Sinh series CPI (3.5%/năm gộp theo tháng) cùng độ dài dates[].
  6. Xuất data/processed/data.json + meta.json, rồi copy sang web/data/.

Chạy:
    python scripts/build_data.py
hoặc:
    "C:\\Program Files\\Python312\\python.exe" scripts\\build_data.py
"""

import csv
import json
import math
import shutil
import sys
import io
from datetime import date
from pathlib import Path

# ---- Bảo đảm stdout in được tiếng Việt trên console Windows (cp1252) ----------
try:
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8", errors="replace")
except Exception:
    pass

# ---- Đường dẫn ----------------------------------------------------------------
ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
PROCESSED_DIR = DATA_DIR / "processed"
WEB_DATA_DIR = ROOT / "web" / "data"

ANCHORS_CSV = DATA_DIR / "anchors.csv"
MARKET_CSV = DATA_DIR / "market_index.csv"

START_MONTH = (2010, 5)      # 2010-05
END_MONTH = (2026, 6)        # 2026-06
CURRENT_YM = (2026, 6)       # tháng "hiện tại" — giá phải chạm current_ppsm tại đây
CPI_ANNUAL = 0.035           # lạm phát ~3.5%/năm
GENERATED_AT = "2026-06-03"

# Phí giao dịch BĐS (fraction).
FEES = {
    "buy_tax": 0.005,        # thuế/phí mua (trước bạ + phí)
    "sell_broker": 0.015,    # phí môi giới khi bán
    "sell_tax": 0.02,        # thuế TNCN khi bán (2% giá trị)
    "maintenance": 0.02,     # phí vận hành/bảo trì quy năm (so với giá trị)
}

# Preset gợi ý (chỉ giữ key thực sự tồn tại trong assets — lọc ở cuối).
PRESETS_RAW = {
    "2PN phổ biến": ["CELA-EM-2PN", "RICH-2PN", "CARI7-2PN", "LOTU-2PN", "TECC-2PN"],
    "So 3 phân khu Celadon": ["CELA-RB-2PN", "CELA-EM-2PN", "CELA-DM-2PN"],
    "Giá mềm": ["LOTU-2PN", "TECC-2PN", "ANGI-2PN", "CARI5-2PN"],
    "Cao cấp": ["CELA-DM-2PN", "CELA-DM-3PN", "CELA-EM-DUP", "ORIE-PH", "RESG-PH"],
    "Trung cấp": ["CELA-EM-2PN", "RICH-2PN", "CARI7-2PN", "ORIE-2PN", "MELO-2PN"],
}


# ---- Tiện ích tháng -----------------------------------------------------------
def ym_to_index(y, m):
    """Số tháng tuyệt đối (để trừ ra khoảng cách tháng)."""
    return y * 12 + (m - 1)


def parse_ym(s):
    """'YYYY-MM' -> (year, month).  Chấp nhận cả 'YYYY-MM-DD' (lấy 7 ký tự đầu)."""
    s = s.strip()[:7]
    y, m = s.split("-")
    return int(y), int(m)


def build_month_axis(start, end):
    """Danh sách (y, m) liên tục từ start tới end (bao gồm cả 2 đầu)."""
    out = []
    i0 = ym_to_index(*start)
    i1 = ym_to_index(*end)
    for i in range(i0, i1 + 1):
        y = i // 12
        m = i % 12 + 1
        out.append((y, m))
    return out


def ym_to_iso(y, m):
    """(y, m) -> 'YYYY-MM-01' (ngày đầu tháng cho ECharts time-axis)."""
    return f"{y:04d}-{m:02d}-01"


# ---- Đọc CSV ------------------------------------------------------------------
def read_anchors(path):
    rows = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if not r.get("key"):
                continue
            rows.append({
                "key": r["key"].strip(),
                "group": r["group"].strip(),
                "name": r["name"].strip(),
                "type": r["type"].strip(),
                "area_m2": float(r["area_m2"]),
                "launch_date": r["launch_date"].strip(),
                "launch_ppsm": float(r["launch_ppsm"]),
                "handover_date": r["handover_date"].strip(),
                "mid_date": r["mid_date"].strip(),
                "mid_ppsm": float(r["mid_ppsm"]),
                "current_ppsm": float(r["current_ppsm"]),
                "rental_yield": float(r["rental_yield"]),
                "confidence": r["confidence"].strip(),
            })
    return rows


def read_market_index(path):
    """-> danh sách (ym_index, value) đã sort theo thời gian."""
    pts = []
    with open(path, "r", encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        for r in reader:
            if not r.get("month"):
                continue
            y, m = parse_ym(r["month"])
            pts.append((ym_to_index(y, m), float(r["index"])))
    pts.sort(key=lambda p: p[0])
    return pts


# ---- Nội suy chỉ số thị trường ra mảng theo tháng (log-tuyến tính) ------------
def interpolate_market(pts, axis):
    """
    pts: [(ym_index, value), ...] đã sort.
    axis: [(y, m), ...] mọi tháng cần giá trị.
    Trả về list value cùng độ dài axis. Nội suy LOG-tuyến tính giữa 2 mốc liền kề;
    ngoài biên thì giữ phẳng (clamp) ở mốc gần nhất.
    """
    if not pts:
        raise ValueError("market_index.csv rỗng")

    out = []
    for (y, m) in axis:
        ti = ym_to_index(y, m)
        # Trước mốc đầu / sau mốc cuối -> clamp.
        if ti <= pts[0][0]:
            out.append(pts[0][1])
            continue
        if ti >= pts[-1][0]:
            out.append(pts[-1][1])
            continue
        # Tìm khoảng [a, b] bao quanh ti.
        for k in range(len(pts) - 1):
            a_i, a_v = pts[k]
            b_i, b_v = pts[k + 1]
            if a_i <= ti <= b_i:
                if b_i == a_i:
                    out.append(a_v)
                else:
                    frac = (ti - a_i) / (b_i - a_i)
                    # log-tuyến tính: v = a_v * (b_v/a_v) ** frac
                    val = a_v * (b_v / a_v) ** frac
                    out.append(val)
                break
    return out


# ---- Nội suy giá 1 mã theo "neo theo chỉ số" ---------------------------------
def build_asset_series(asset, axis, market, axis_index_of):
    """
    Trả về list giá ppsm (int) cùng độ dài axis; null (None) trước tháng launch.

    Mỗi đoạn (a, Pa) -> (b, Pb), tháng t in [a..b]:
        progress = (t - a) / (b - a)
        ppsm_t  = Pa * (m[t]/m[a]) * ((Pb/Pa) / (m[b]/m[a])) ** progress
    -> chạm đúng Pa tại a và Pb tại b.
    """
    n = len(axis)
    series = [None] * n

    L = parse_ym(asset["launch_date"])
    Pa_launch = asset["launch_ppsm"]
    C = CURRENT_YM
    Pc = asset["current_ppsm"]

    # mid chỉ dùng nếu L < M < C (chặt chẽ theo trục thời gian).
    M_valid = False
    if asset["mid_date"]:
        M = parse_ym(asset["mid_date"])
        if ym_to_index(*L) < ym_to_index(*M) < ym_to_index(*C):
            M_valid = True

    if M_valid:
        segments = [(L, Pa_launch, M, asset["mid_ppsm"]),
                    (M, asset["mid_ppsm"], C, Pc)]
    else:
        segments = [(L, Pa_launch, C, Pc)]

    for (a_ym, Pa, b_ym, Pb) in segments:
        ai = ym_to_index(*a_ym)
        bi = ym_to_index(*b_ym)
        span = bi - ai
        ma = market[axis_index_of[ai]]
        mb = market[axis_index_of[bi]]
        ratio_target = (Pb / Pa) / (mb / ma)  # phần lệch so với thị trường
        for ti in range(ai, bi + 1):
            idx = axis_index_of[ti]
            mt = market[idx]
            progress = 0.0 if span == 0 else (ti - ai) / span
            ppsm = Pa * (mt / ma) * (ratio_target ** progress)
            series[idx] = int(round(ppsm))

    return series


# ---- CPI ----------------------------------------------------------------------
def build_cpi(axis):
    """Chỉ số CPI: base 100.0 tại tháng đầu, +3.5%/năm gộp theo tháng."""
    monthly = (1.0 + CPI_ANNUAL) ** (1.0 / 12.0)
    out = []
    v = 100.0
    for i in range(len(axis)):
        out.append(round(v, 4))
        v *= monthly
    return out


# ---- Ghi JSON UTF-8 -----------------------------------------------------------
def write_json(path, obj):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", encoding="utf-8") as f:
        json.dump(obj, f, ensure_ascii=False, separators=(",", ":"))


def main():
    # 1) Đọc input.
    anchors = read_anchors(ANCHORS_CSV)
    market_pts = read_market_index(MARKET_CSV)

    # 2) Trục tháng + nội suy thị trường.
    axis = build_month_axis(START_MONTH, END_MONTH)
    axis_index_of = {ym_to_index(y, m): i for i, (y, m) in enumerate(axis)}
    market = interpolate_market(market_pts, axis)

    dates = [ym_to_iso(y, m) for (y, m) in axis]
    n_months = len(dates)

    # 3) Series từng mã.
    series = {}
    for a in anchors:
        series[a["key"]] = build_asset_series(a, axis, market, axis_index_of)

    # 4) CPI.
    series["CPI"] = build_cpi(axis)

    # 5) Kiểm tra độ dài đồng nhất.
    for k, arr in series.items():
        assert len(arr) == n_months, f"series {k} dài {len(arr)} != {n_months}"

    # 6) data.json
    data_obj = {"dates": dates, "series": series}

    # 7) meta.json
    assets_meta = {}
    groups_order = []
    for a in anchors:
        g = a["group"]
        if g not in groups_order:
            groups_order.append(g)
        ly, lm = parse_ym(a["launch_date"])
        hy, hm = parse_ym(a["handover_date"])
        assets_meta[a["key"]] = {
            "name": a["name"],
            "group": a["group"],
            "type": a["type"],
            "area": a["area_m2"],
            "handover": ym_to_iso(hy, hm),
            "rental_yield": round(a["rental_yield"] / 100.0, 5),  # 4.8 -> 0.048
            "first_date": ym_to_iso(ly, lm),                       # = launch
            "confidence": a["confidence"],
        }

    # presets: chỉ giữ key tồn tại trong assets.
    valid_keys = set(assets_meta.keys())
    presets = {}
    for name, keys in PRESETS_RAW.items():
        kept = [k for k in keys if k in valid_keys]
        if kept:
            presets[name] = kept

    meta_obj = {
        "generated_at": GENERATED_AT,
        "base_currency": "VND",
        "assets": assets_meta,
        "groups": groups_order,
        "presets": presets,
        "fees": FEES,
    }

    # 8) Ghi processed + copy sang web/data.
    write_json(PROCESSED_DIR / "data.json", data_obj)
    write_json(PROCESSED_DIR / "meta.json", meta_obj)
    WEB_DATA_DIR.mkdir(parents=True, exist_ok=True)
    shutil.copyfile(PROCESSED_DIR / "data.json", WEB_DATA_DIR / "data.json")
    shutil.copyfile(PROCESSED_DIR / "meta.json", WEB_DATA_DIR / "meta.json")

    # 9) Báo cáo.
    print("=" * 64)
    print("BUILD DATA — BĐS Tây Sài Gòn")
    print("=" * 64)
    print(f"Số mã (assets)      : {len(anchors)}")
    print(f"Số nhóm (groups)    : {len(groups_order)}")
    print(f"Số tháng (dates)    : {n_months}  [{dates[0]} -> {dates[-1]}]")
    print(f"Số series (kể CPI)  : {len(series)}")
    print(f"Presets giữ lại     : {list(presets.keys())}")

    # Vài giá trị mẫu để kiểm tra "chạm neo".
    def at(key, ym):
        idx = axis_index_of[ym_to_index(*ym)]
        return series[key][idx]

    print("-" * 64)
    print("Mẫu CELA-EM-2PN:")
    print(f"  2017-06 (launch) = {at('CELA-EM-2PN',(2017,6)):>12,}  (kỳ vọng 32,000,000)")
    print(f"  2021-08 (mid)    = {at('CELA-EM-2PN',(2021,8)):>12,}  (kỳ vọng 48,000,000)")
    print(f"  2026-06 (current)= {at('CELA-EM-2PN',(2026,6)):>12,}  (kỳ vọng 56,000,000)")
    print(f"  2023-06 (đáy)    = {at('CELA-EM-2PN',(2023,6)):>12,}")
    print("Mẫu LOTU-2PN (mã đời dài nhất):")
    print(f"  2010-05 (launch) = {at('LOTU-2PN',(2010,5)):>12,}  (kỳ vọng 15,000,000)")
    print(f"  2026-06 (current)= {at('LOTU-2PN',(2026,6)):>12,}  (kỳ vọng 31,000,000)")
    print(f"Market index 2021-08 = {market[axis_index_of[ym_to_index(2021,8)]]:.1f} (đỉnh)")
    print(f"Market index 2023-06 = {market[axis_index_of[ym_to_index(2023,6)]]:.1f} (đáy)")
    print("Đã ghi: data/processed/{data,meta}.json + copy sang web/data/.")
    print("=" * 64)


if __name__ == "__main__":
    main()
