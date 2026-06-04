# Nhìn lại quá khứ — Mua căn hộ Tân Phú

> Nếu lúc mở bán bạn **mua đứt một căn hộ** ở Quận Tân Phú và giữ tới hôm nay,
> **giờ lời ròng bao nhiêu?** Web app tĩnh, tương tác: chọn vài căn (Dự án × Loại căn)
> và một khoảng thời gian → app vẽ biểu đồ giá trị theo thời gian và bảng %lãi / CAGR,
> đã trừ phí & thuế, có thể cộng thêm tiền cho thuê tích lũy sau khi bàn giao.

Mỗi dự án kèm một **câu chuyện ngắn** + **mốc sự kiện trên đồ thị** để dễ đọc, dễ chia sẻ.

---

## ⚠️ Tuyên bố độ chính xác (đọc trước khi tin con số)

**Đây là công cụ tham khảo XU HƯỚNG, KHÔNG phải định giá chính thức.**

- ✅ **Giá mở bán & giá hiện tại** là các số **neo tham khảo từ nguồn thật** (rao bán,
  môi giới, tin thị trường). Đây là phần đáng tin nhất.
- 🟡 **Chỉ số thị trường và toàn bộ đoạn giá nằm GIỮA hai mốc neo** là **MÔ HÌNH ƯỚC
  LƯỢNG** — được nội suy theo hình của thị trường khu Tây Sài Gòn, KHÔNG phải giao dịch
  thực từng tháng.
- 🔴 Các mã đánh dấu `confidence = thấp` được **suy luận từ phân khúc 2PN cùng dự án**
  (vì thiếu dữ liệu trực tiếp) — **cần kiểm chứng lại** trước khi dùng.

Số liệu là điểm khởi đầu để hình dung, không thay thế thẩm định giá hay tư vấn chuyên môn.

---

## App trông như thế nào (mô tả)

Giao diện tối (dark theme). Bên trái là **cây chọn**: gập theo từng **dự án**, mở ra
chọn từng **loại căn** (1PN / 2PN / 3PN…). Chọn xong và đặt khoảng thời gian (mở bán →
hôm nay), khu vực chính hiện:

- **Biểu đồ đường** (ECharts): giá trị căn theo thời gian, kèm đường "vốn mua" và mốc
  sự kiện của dự án; rê chuột xem giá từng tháng.
- **Bảng kết quả / mỗi căn**: vốn mua, giá trị hiện tại, **%lãi trên vốn**, **CAGR**,
  lãi ròng khi bán (đã trừ phí & thuế), tiền cho thuê tích lũy (bật/tắt được).
- **Panel câu chuyện**: bối cảnh dự án + các mốc đáng nhớ.

---

## Cách chạy

App là web tĩnh; tầng dữ liệu build bằng Python rồi serve qua HTTP.

**Bước 1 — build dữ liệu** (đọc 2 file CSV → sinh JSON cho web):

```bat
cd D:\BĐS
python scripts\build_data.py
```

**Bước 2 — mở web** (cần HTTP vì mở `file://` trực tiếp sẽ bị chặn CORS):

```bat
cd web
python -m http.server 8777
```

Rồi mở trình duyệt tại **http://localhost:8777**.

> `build_data.py` chỉ dùng **Python 3 standard library** — không cần `pip install` gì
> cả. Yêu cầu Python 3.8+ (xem `requirements.txt`).

---

## Cập nhật số liệu (KHÔNG cần biết code)

Toàn bộ số liệu nằm trong **2 file CSV**, sửa bằng Excel là đủ:

1. **Sửa giá / cho thuê / ngày bàn giao** → mở `data\anchors.csv` bằng Excel.
   Mỗi dòng là một loại căn của một dự án. Bạn có thể chỉnh:
   - `launch_ppsm`, `mid_ppsm`, `current_ppsm` — giá / m² (ghi đủ số đồng, vd `25000000`).
   - `rental_yield` — tỷ suất cho thuê (số %/năm, vd `4.8`).
   - `handover_date`, `launch_date`, `mid_date` — các mốc tháng (`YYYY-MM`).
   - `confidence` — `cao` / `vừa` / `thấp` nếu muốn đánh dấu độ tin.
2. **Đổi "hình" thị trường (tùy chọn)** → chỉnh `data\market_index.csv` (các mốc chỉ số
   khu Tây Sài Gòn). Chỉ động vào nếu muốn đường giá uốn theo chu kỳ khác.
3. **Chạy lại** `python scripts\build_data.py` — xong. **KHÔNG cần đụng tới code.**

Mẹo Excel: lưu đúng định dạng **CSV (UTF-8)**, giữ nguyên hàng tiêu đề và thứ tự cột.
Chi tiết từng cột: xem `DATA-CONTRACT.md`.

---

## 10 dự án & các loại căn (logic cây chọn Tân Phú)

Mỗi **dự án** (`group`) gồm nhiều **loại căn** (`type`), mỗi loại căn là **một mã**
(`key`) có giá và lịch riêng. Cây chọn trên web dựng đúng theo cấu trúc này:

```
Dự án (group)                    Loại căn (type)
─────────────────────────────    ──────────────────────────
Celadon City                  →  studio · 1PN · 2PN · 3PN
Richstar (Novaland)           →  1PN · 2PN · 3PN
Jamila / khu Tân Phú lân cận  →  1PN · 2PN · 3PN
The Garden / Aeon Mall        →  studio · 1PN · 2PN
Carillon                      →  1PN · 2PN · 3PN
Âu Cơ Tower                   →  2PN · 3PN
Res Green Tower               →  1PN · 2PN
Florita / căn hộ trung cấp    →  1PN · 2PN · 3PN
Officetel / căn nhỏ           →  studio · officetel
Căn cao cấp mới bàn giao      →  2PN · 3PN
```

> Danh sách dự án và loại căn được lấy **trực tiếp từ `data\anchors.csv`** (cột `group`
> và `type`) khi build — sửa CSV là cây chọn tự đổi theo, không phải sửa code. Số dòng
> mỗi dự án do bạn quyết định trong CSV.

---

## Phí & thuế đang giả lập

Mô phỏng áp các mức phí/thuế cấu hình trong `meta.json → fees` (chỉnh được):

| Khoản | Mức | Khi nào |
|-------|-----|---------|
| Trước bạ | **0,5%** | khi **mua** (cộng vào vốn) |
| Phí bảo trì | **2%** | khi **mua** (cộng vào vốn) |
| Môi giới | **1,5%** | khi **bán** (trừ vào tiền về tay) |
| Thuế TNCN | **2%** | khi **bán** (trừ vào tiền về tay) |

Công thức đầy đủ (vốn mua, giá trị, tiền thuê, lãi ròng): xem `DATA-CONTRACT.md` §7.

---

## Cấu trúc thư mục

```
D:\BĐS\
├─ README.md · DATA-CONTRACT.md · requirements.txt
├─ data\
│  ├─ anchors.csv          # bảng giá người-sửa-được (nguồn gốc)
│  ├─ market_index.csv     # chỉ số thị trường (xương sống)
│  └─ processed\           # data.json + meta.json (bản build gốc)
├─ scripts\
│  └─ build_data.py        # Python stdlib thuần: CSV → JSON (nội suy)
└─ web\
   ├─ index.html
   ├─ css\style.css
   ├─ js\{app,chart,data,simulator}.js   # Alpine.js + ECharts
   └─ data\{data.json, meta.json, insights.json}
```

Stack: frontend tĩnh **Alpine.js + ECharts** (dark theme), serve bằng
`python -m http.server`. Tầng dữ liệu: `anchors.csv` + `market_index.csv` →
`build_data.py` → `data.json` / `meta.json`; `insights.json` viết tay.

---

## Miễn trừ trách nhiệm

Công cụ này dùng để **nhìn lại quá khứ, tham khảo xu hướng và học hỏi** — KHÔNG phải
khuyến nghị đầu tư hay định giá chính thức. Giá mở bán/hiện tại là số neo tham khảo; chỉ
số thị trường và đoạn giá giữa các mốc là **mô hình ước lượng** và có thể sai số (nhất là
các mã `confidence = thấp`). Hiệu suất quá khứ không đảm bảo cho tương lai. Hãy tự kiểm
chứng số liệu trước khi ra bất kỳ quyết định tài chính nào.
