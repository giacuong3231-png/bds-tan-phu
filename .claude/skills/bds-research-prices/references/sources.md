# Nguồn & cách truy vấn giá căn hộ Tân Phú

## 1. batdongsan.com.vn (chính)
- Trang dự án: tìm "`<tên dự án>` batdongsan" → trang có **biểu đồ giá theo thời gian /m²** + giá rao trung bình + tin đang bán.
- Tin rao bán: lọc theo dự án + số phòng ngủ → lấy **trung vị giá/m²** (bỏ tin lệch >30% = ảo/sai).
- Tốt nhất cho: `current_ppsm`, xu hướng gần đây.

## 2. Giá mở bán lịch sử
- Truy vấn: "`<tên dự án>` mở bán giá `<năm launch>`", "`<dự án>` giá gốc chủ đầu tư".
- Nguồn: cafef.vn, CafeLand, batdongsan tin tức, Tuổi Trẻ/Thanh Niên/VnExpress mục BĐS, thông cáo mở bán.
- 2010–2016 thường thưa → có thể chỉ ra khoảng. Không có nguồn rõ → back-calc theo `market_index`, để `confidence=thấp`.

## 3. Giá thuê → rental_yield
- nhatot.com (Nhà Tốt), mogi.vn, batdongsan mục cho thuê: lọc dự án + số PN → **trung vị giá thuê/tháng**.
- `rental_yield = giá_thuê_tháng × 12 ÷ (current_ppsm × area)`.

## 4. Ngày bàn giao
- "`<dự án>` bàn giao", "`<dự án>` nhận nhà `<năm>`" → bài/báo/diễn đàn cư dân.

## Quy tắc ghi nguồn
Với mỗi số `cao/vừa`: ghi `nguồn: <URL hoặc tên bài> (<ngày truy cập>)`. Số `thấp`: ghi `ước lượng: back-calc / suy từ 2PN`.

## Bẫy thường gặp
- Tin rao "giá từ ..." (giá thấp nhất, gây nhiểu nhầm) → dùng trung vị, không dùng min.
- Lẫn diện tích tim tường vs thông thủy → giá/m² lệch ~8–10%. Ưu tiên thông thủy (diện tích sổ).
- Tin môi giới đăng lại trùng → đếm 1 lần.
