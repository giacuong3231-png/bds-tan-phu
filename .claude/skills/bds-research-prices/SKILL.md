---
name: bds-research-prices
description: Phương pháp nghiên cứu giá căn hộ Quận Tân Phú từ nguồn thật — tìm giá/m² mở bán, giá/m² hiện tại, ngày bàn giao, suất cho thuê; tam giác hóa nhiều nguồn; gán confidence. Dùng khi nghiên cứu/cập nhật/kiểm chứng giá cho anchors.csv.
---

# bds-research-prices

Mục tiêu: với mỗi mã (dự án × loại căn), tìm 4 số CÓ NGUỒN — `launch_ppsm`, `current_ppsm`, `handover_date`, `rental_yield` — và gán `confidence`.

## Nguồn (chi tiết truy vấn: references/sources.md)
- **batdongsan.com.vn**: trang dự án có biểu đồ "giá theo thời gian" + tin rao hiện tại → tốt cho giá hiện tại & xu hướng.
- **CafeLand / cafef.vn / báo (Tuổi Trẻ, Thanh Niên, VnExpress)**: tin mở bán → giá mở bán lịch sử.
- **nhatot / mogi / chợ tốt nhà**: tin cho thuê → tính rental yield.
- Hồ sơ 10 dự án (chủ đầu tư, năm, phân khúc, bàn giao): references/tan-phu-projects.md.

## Cách làm
1. **Giá hiện tại:** trung vị giá rao bán /m² cho đúng loại căn (bỏ tin ảo lệch >30%).
2. **rental_yield:** trung vị giá thuê/tháng ÷ giá căn hiện tại × 12. Khoảng điển hình: cao cấp 3.5–4.5%, trung cấp 4.5–5.5%, bình dân/cũ 5–6%.
3. **Giá mở bán:** tìm tin mở bán năm `launch_date`. Không có → back-calc `launch_ppsm ≈ current_ppsm × m[launch]/m[current]` (m = market_index) → `confidence=thấp`.
4. **Ngày bàn giao:** tin/bài về thời điểm bàn giao dự án.

## Quy tắc confidence
- `cao`: ≥2 nguồn độc lập khớp (±10%).
- `vừa`: 1 nguồn rõ ràng.
- `thấp`: suy luận / back-calc / không nguồn trực tiếp.
Ghi nguồn (URL hoặc tên bài + ngày) cho mỗi số `cao/vừa`.

## Trung thực (vì sao)
Giá mở bán xa (2010–2016) hiếm có nguồn online; ép số "đẹp" sẽ làm sai lệch %lãi của cả app. Thà `thấp` mà thật còn hơn `cao` mà bịa — người dùng (Andrew) coi trọng độ chính xác và sẽ rà lại các dòng `thấp`.
