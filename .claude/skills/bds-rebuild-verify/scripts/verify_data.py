#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
verify_data.py — Kiểm tra tự động tính toàn vẹn dữ liệu BĐS Tân Phú.

Chạy SAU mỗi lần build_data.py. Khẳng định (assert) mọi bất biến giữa
anchors.csv / market_index.csv (đầu vào) và web/data/{data,meta,insights}.json
(đầu ra). In PASS/FAIL từng nhóm; exit code != 0 nếu có lỗi → QA/CI bắt được.

Chỉ dùng standard library. Chạy từ gốc dự án:  python .claude\\skills\\bds-rebuild-verify\\scripts\\verify_data.py
"""
import csv
import json
import sys
from pathlib import Path

try:
    sys.stdout.reconfigure(encoding="utf-8")
    sys.stderr.reconfigure(encoding="utf-8")
except Exception:
    pass

EXPECT_FIRST = "2010-05-01"
EXPECT_LAST = "2026-06-01"
RENTAL_MIN, RENTAL_MAX = 0.03, 0.07

fails = []
warns = []


def check(cond, msg):
    if cond:
        print(f"  [PASS] {msg}")
    else:
        print(f"  [FAIL] {msg}")
        fails.append(msg)


def warn(cond, msg):
    if not cond:
        print(f"  [WARN] {msg}")
        warns.append(msg)


def find_root():
    cands = [Path.cwd()]
    try:
        cands.append(Path(__file__).resolve().parents[4])
    except Exception:
        pass
    if len(sys.argv) > 1:
        cands.insert(0, Path(sys.argv[1]))
    for c in cands:
        if (c / "data" / "anchors.csv").exists():
            return c
    print("[FATAL] Không tìm thấy gốc dự án (data/anchors.csv).")
    sys.exit(2)


def load(root):
    with open(root / "data" / "anchors.csv", encoding="utf-8") as f:
        anchors = list(csv.DictReader(f))
    mkt = {}
    with open(root / "data" / "market_index.csv", encoding="utf-8") as f:
        for r in csv.DictReader(f):
            mkt[r["month"]] = float(r["index"])
    with open(root / "web" / "data" / "data.json", encoding="utf-8") as f:
        data = json.load(f)
    with open(root / "web" / "data" / "meta.json", encoding="utf-8") as f:
        meta = json.load(f)
    with open(root / "web" / "data" / "insights.json", encoding="utf-8") as f:
        ins = json.load(f)
    return anchors, mkt, data, meta, ins


def main():
    root = find_root()
    print(f"Gốc dự án: {root}\n")
    anchors, mkt, data, meta, ins = load(root)
    dates = data["dates"]
    series = data["series"]
    assets = meta["assets"]
    didx = {d: i for i, d in enumerate(dates)}

    print("== 1. Trục thời gian ==")
    check(dates[0] == EXPECT_FIRST, f"dates[0] == {EXPECT_FIRST} (thực: {dates[0]})")
    check(dates[-1] == EXPECT_LAST, f"dates[-1] == {EXPECT_LAST} (thực: {dates[-1]})")
    check(all(d.endswith("-01") for d in dates), "mọi date dạng YYYY-MM-01 (theo tháng)")
    check(len(dates) == len(set(dates)), "không có date trùng")

    print("\n== 2. Độ dài series ==")
    bad = [k for k, v in series.items() if len(v) != len(dates)]
    check(not bad, f"mọi series dài = {len(dates)} (sai: {bad[:5]})")

    print("\n== 3. CPI ==")
    cpi = series.get("CPI")
    check(cpi is not None, "series CPI tồn tại")
    if cpi:
        check(abs(cpi[0] - 100.0) < 1e-6, f"CPI base 100 (thực: {cpi[0]})")
        check(all(cpi[i] <= cpi[i + 1] + 1e-9 for i in range(len(cpi) - 1)), "CPI tăng đều (monotonic)")

    print("\n== 4. Anchors chạm đúng giá neo ==")
    miss = 0
    for a in anchors:
        k = a["key"]
        s = series.get(k)
        if s is None:
            check(False, f"{k}: có series trong data.json")
            miss += 1
            continue
        for tag, mcol, pcol in (("launch", "launch_date", "launch_ppsm"),
                                ("mid", "mid_date", "mid_ppsm"),
                                ("current", None, "current_ppsm")):
            month = "2026-06" if tag == "current" else a.get(mcol, "").strip()
            if not month or not a.get(pcol, "").strip():
                continue
            if tag == "mid" and not (a["launch_date"] < month < "2026-06"):
                continue
            iso = month + "-01"
            if iso not in didx:
                check(False, f"{k}: tháng {month} có trong trục")
                continue
            got = s[didx[iso]]
            exp = int(float(a[pcol]))
            check(got == exp, f"{k} @{month}: {got} == {exp} ({tag})")
    # null trước launch, non-null từ launch
    for a in anchors:
        k = a["key"]
        s = series.get(k)
        if not s:
            continue
        li = didx.get(a["launch_date"] + "-01")
        if li is None:
            continue
        before_ok = all(s[i] is None for i in range(li))
        after_ok = all(s[i] is not None for i in range(li, len(s)))
        check(before_ok, f"{k}: null đúng trước launch {a['launch_date']}")
        check(after_ok, f"{k}: non-null từ launch tới hết")

    print("\n== 5. Market index (nhịp sốt/đóng băng) ==")
    need = ["2020-06", "2021-08", "2023-06", "2024-06"]
    if all(m in mkt for m in need):
        peak, trough = mkt["2021-08"], mkt["2023-06"]
        check(peak > mkt["2020-06"], f"tăng vào sốt: 2021-08={peak} > 2020-06={mkt['2020-06']}")
        check(peak > trough, f"đóng băng sau sốt: 2021-08={peak} > đáy 2023-06={trough}")
        check(mkt["2024-06"] > trough, f"hồi phục: 2024-06={mkt['2024-06']} > đáy={trough}")
    else:
        check(False, f"market_index có đủ mốc {need}")

    print("\n== 6. Nhất quán keys (boundary) ==")
    skeys = set(series.keys()) - {"CPI"}
    akeys = set(assets.keys())
    check(skeys == akeys, f"series keys == meta.assets keys (lệch: {(skeys ^ akeys)})")
    anchor_keys = {a["key"] for a in anchors}
    check(anchor_keys == akeys, f"anchors keys == meta.assets keys (lệch: {(anchor_keys ^ akeys)})")

    print("\n== 7. Presets & groups & insights ==")
    for pname, keys in meta.get("presets", {}).items():
        bad = [k for k in keys if k not in assets]
        check(not bad, f"preset '{pname}' chỉ chứa key tồn tại (thiếu: {bad})")
    groups_meta = set(meta.get("groups", []))
    groups_asset = {a.get("group") for a in assets.values()}
    check(groups_asset <= groups_meta, f"mọi group của asset có trong meta.groups (lệch: {groups_asset - groups_meta})")
    check(set(ins.keys()) == groups_meta, f"insights keys == meta.groups (lệch: {set(ins.keys()) ^ groups_meta})")

    print("\n== 8. Giá trị hợp lệ ==")
    for k, m in assets.items():
        ry = m.get("rental_yield")
        warn(ry is not None and RENTAL_MIN <= ry <= RENTAL_MAX, f"{k}: rental_yield {ry} trong [{RENTAL_MIN},{RENTAL_MAX}]")
        check(isinstance(m.get("area"), (int, float)) and m["area"] > 0, f"{k}: area > 0")
        check(bool(m.get("handover")) and bool(m.get("first_date")), f"{k}: có handover & first_date")

    # Thống kê confidence
    conf = {}
    for a in anchors:
        conf[a["confidence"]] = conf.get(a["confidence"], 0) + 1

    print("\n" + "=" * 56)
    print(f"Tổng mã: {len(anchors)} | nhóm: {len(groups_meta)} | tháng: {len(dates)}")
    print(f"Confidence: {conf}")
    print(f"Cảnh báo (WARN): {len(warns)} | Lỗi (FAIL): {len(fails)}")
    if fails:
        print("KET QUA: FAIL")
        for m in fails:
            print(f"   - {m}")
        sys.exit(1)
    print("KET QUA: PASS")
    sys.exit(0)


if __name__ == "__main__":
    main()
