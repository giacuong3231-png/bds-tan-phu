---
name: bds-rebuild-verify
description: Build lại dữ liệu BĐS Tân Phú (anchors.csv → web/data/*.json) và kiểm tra toàn vẹn tự động bằng verify_data.py. Dùng sau mỗi lần sửa anchors.csv/market_index.csv, hoặc khi cần xác nhận dữ liệu đúng hợp đồng trước khi giao.
---

# bds-rebuild-verify

## Build
`python scripts/build_data.py` (chạy từ gốc `D:\BĐS`). Đọc `data/anchors.csv` + `data/market_index.csv` → nội suy "neo theo chỉ số" → ghi `data/processed/{data,meta}.json` + copy sang `web/data/`. Idempotent (chạy lại cho kết quả như nhau).

Python trên Windows: thử `python`, fallback `"C:\Program Files\Python312\python.exe"`. Đặt `PYTHONUTF8=1` để in tiếng Việt đúng.

## Verify (bắt buộc, deterministic)
`python .claude/skills/bds-rebuild-verify/scripts/verify_data.py` → exit 0 = PASS. Script tự assert:
- trục thời gian `2010-05`→`2026-06` theo tháng; mọi series dài = `dates`;
- mỗi mã chạm ĐÚNG `launch/mid/current_ppsm`; `null` đúng trước launch;
- `CPI` base 100 tăng đều; `market_index` có đỉnh 2021-08 + đáy 2023-06 + hồi phục;
- keys nhất quán (`series` ↔ `meta.assets` ↔ `anchors`); `presets`/`insights`/`groups` khớp;
- `rental_yield` ∈ [3%,7%]; `area` > 0.

KHÔNG bàn giao nếu verify FAIL. Đọc dòng `[FAIL]` để biết mã/bất biến nào sai. Thêm bất biến mới → sửa chính script này.

## Smoke-test app (khi có Preview MCP)
Serve `python -m http.server 8777 --directory web` (hoặc `launch.json` tên `bds-web`). Eval: số nút `.asset` == số mã; cards toán khớp; toggle thuê/lạm phát đổi số; canvas vẽ.

## Vì sao tách script
Các assertion lặp lại mỗi lần build. Đóng gói `scripts/verify_data.py` để chạy 1 lệnh thay vì kiểm tay — nhanh, không bỏ sót, dễ tái dùng cho CI sau này.
