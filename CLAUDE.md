# CLAUDE.md — Dự án BĐS Tân Phú (D:\BĐS)

App **"Nhìn lại quá khứ — Mua căn hộ Tân Phú"**: backtest mua đứt căn hộ Quận Tân Phú (clone của D:\Stock). Frontend Alpine.js + ECharts (`web/`); tầng dữ liệu `data/anchors.csv` + `data/market_index.csv` → `scripts/build_data.py` → `web/data/*.json`. Serve: `python -m http.server 8777 --directory web`.

## Harness: BĐS Tân Phú — Data Lifecycle

**Mục tiêu:** nghiên cứu giá → cập nhật anchors → build → verify dữ liệu BĐS một cách tái lập, an toàn, có kiểm chứng.

**Trigger:** Mọi việc liên quan dữ liệu/giá/mã căn hộ BĐS Tân Phú — "nghiên cứu giá", "cập nhật giá", "thêm/mở rộng mã căn hộ", "rebuild data", "sửa anchors", kể cả follow-up "làm lại / cập nhật / bổ sung / sửa / chạy lại" → dùng skill **`bds-data-harness`**. Câu hỏi đơn thuần (không đổi dữ liệu) thì trả lời trực tiếp.

**Quy tắc bất biến:** KHÔNG ghi đè 12 mã seed gốc (`CELA-RB-2PN`…`ANGI-2PN`) — chỉ đối chiếu & báo. Số liệu phải có nguồn hoặc đánh dấu `confidence=thấp`; không bịa.

**Lịch sử thay đổi:**
| Ngày | Thay đổi | Đối tượng | Lý do |
|------|----------|-----------|-------|
| 2026-06-03 | Khởi tạo harness (3 agent + 4 skill + verify_data.py) | toàn bộ `.claude/` | Tự động hóa vòng đời dữ liệu BĐS |
