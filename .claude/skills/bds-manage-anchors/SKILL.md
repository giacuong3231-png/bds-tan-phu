---
name: bds-manage-anchors
description: Quản lý file data/anchors.csv của app BĐS Tân Phú — thêm mã căn hộ theo logic tree đầy đủ, quy ước đặt key, suy giá loại căn từ 2PN, sửa CSV an toàn đúng 13 cột. Dùng khi thêm/mở rộng/sửa mã căn hộ trong anchors.
---

# bds-manage-anchors

`data/anchors.csv` là nguồn sự thật của app. 13 cột:
`key,group,name,type,area_m2,launch_date,launch_ppsm,handover_date,mid_date,mid_ppsm,current_ppsm,rental_yield,confidence`
(`rental_yield` ghi dạng số phần trăm, vd `4.8`; `*_date` dạng `YYYY-MM`; `*_ppsm` VND/m² số nguyên.)

## Logic tree đầy đủ + diện tích
Danh sách 10 dự án × loại căn (~36 mã) + key chuẩn + diện tích đại diện: **references/logic-tree.md**.

## Quy ước key
`{DỰÁN}-{LOẠI}`. Dự án: CELA-RB / CELA-EM / CELA-DM (3 phân khu Celadon), RICH, MELO, ORIE, CARI7, CARI5, RESG, LOTU, TECC, ANGI. Loại: `1PN` / `2PN` / `3PN` / `DUP` (Duplex) / `PH` (Penthouse) / `SKY` (SkyVilla). Vd `CELA-DM-SKY`.

## Thêm mã
1. **Diện tích:** lấy từ logic-tree.md.
2. **Giá:** ưu tiên research thật (skill `bds-research-prices`). Khi chưa research được, suy từ dòng 2PN CÙNG dự án theo chênh lệch giá/m² điển hình: **1PN +~8% · 3PN −~5% · Penthouse/Duplex +~20% · SkyVilla +~30%**. Cùng `launch_date`/`handover`/`mid_date` của dự án. Đánh `confidence=thấp` cho dòng suy ra.

## Sửa an toàn (vì sao)
- **Giữ nguyên 12 dòng seed gốc** (`CELA-RB-2PN`…`ANGI-2PN`) — đó là số Andrew tự xác minh; ghi đè = mất nguồn sự thật.
- Đúng 13 cột, không thêm/bớt cột; UTF-8; dấu "·" trong `group`/`name` giữ nguyên.
- `key` duy nhất — không trùng (build dùng key làm khóa).
- Sau khi sửa: build + verify (skill `bds-rebuild-verify`); không giao nếu verify FAIL.
