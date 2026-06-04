# DATA CONTRACT — hợp đồng dữ liệu giữa `build_data.py` (Python) và frontend (JS)

> Đọc kỹ file này trước khi sửa số liệu hoặc code. Đây là hợp đồng cố định để
> tầng dữ liệu và frontend ăn khớp. Mọi giá là **giá / m² sàn, đơn vị VND**, trên
> **một trục thời gian chung theo THÁNG** (mốc ngày luôn là mùng 1: `YYYY-MM-01`).

Luồng dữ liệu:

```
data/anchors.csv  ─┐
                   ├─►  scripts/build_data.py  ─►  web/data/data.json
data/market_index.csv ─┘   (Python stdlib, nội suy)   web/data/meta.json
                                                        (data/processed/ giữ bản gốc)
web/data/insights.json  ── viết tay, build KHÔNG ghi đè
```

---

## 1. `data/anchors.csv` — bảng giá người-sửa-được (NGUỒN GỐC)

Mỗi dòng = **1 mã** = một (Dự án × Loại căn). Đây là file con người chỉnh trong Excel.

| # | Cột | Kiểu | Ý nghĩa |
|---|-----|------|---------|
| 1 | `key` | chuỗi | Mã định danh duy nhất, không dấu, vd `CELADON_2PN`, `RICHSTAR_3PN`. Dùng làm khóa trong `data.json` / `meta.json`. |
| 2 | `group` | chuỗi | Tên nhóm = **dự án**, vd `Celadon City`. Dùng để gộp mã + tra `insights.json`. |
| 3 | `name` | chuỗi | Tên hiển thị của mã, vd `Celadon City — 2PN`. |
| 4 | `type` | chuỗi | Loại căn: `1PN` · `2PN` · `3PN` · `studio` · `officetel` (mô tả phân khúc). |
| 5 | `area_m2` | số | Diện tích thông thủy/tim tường dùng để quy đổi, vd `68`. |
| 6 | `launch_date` | `YYYY-MM` | Tháng mở bán (mốc neo đầu tiên). |
| 7 | `launch_ppsm` | số | Giá mở bán, **VND / m²**, vd `25000000`. |
| 8 | `handover_date` | `YYYY-MM` | Tháng bàn giao. Trước mốc này **không tính tiền cho thuê**. |
| 9 | `mid_date` | `YYYY-MM` | Một mốc giá ở giữa (để bẻ đường cong sát thực tế hơn). |
| 10 | `mid_ppsm` | số | Giá tại `mid_date`, VND / m². |
| 11 | `current_ppsm` | số | Giá hiện tại (mốc neo cuối), VND / m². |
| 12 | `rental_yield` | số | Tỷ suất cho thuê gộp, **đơn vị % / năm dạng số thực**, vd `4.8` nghĩa là 4,8%/năm. |
| 13 | `confidence` | chuỗi | Độ tin của dòng: `cao` · `vừa` · `thấp`. `thấp` = suy luận từ phân khúc 2PN cùng dự án, cần kiểm chứng. |

**Quy ước**
- Ngày ghi dạng `YYYY-MM` (chỉ năm-tháng), build tự gắn `-01`.
- Giá ghi **đủ số đồng** (`25000000`), KHÔNG ghi đơn vị nghìn/triệu.
- 3 mốc neo theo thứ tự thời gian: `launch_date < mid_date < current` (build dùng để nội suy).
- Header bắt buộc; thứ tự cột đúng như bảng trên.

---

## 2. `data/market_index.csv` — chỉ số thị trường (XƯƠNG SỐNG)

Chỉ số căn hộ khu Tây Sài Gòn theo các mốc tiêu biểu 2010 → 2026. Build **nội suy
log-tuyến tính** ra giá trị từng tháng để làm khung "bo hình" cho mọi mã.

| Cột | Kiểu | Ý nghĩa |
|-----|------|---------|
| `month` | `YYYY-MM` | Mốc thời gian của chỉ số. |
| `index` | số | Giá trị chỉ số (không đơn vị; chỉ tỷ lệ giữa các tháng mới có nghĩa). |

- Chỉ cần ghi **các mốc xương sống** (không cần đủ mọi tháng) — build nội suy phần còn lại.
- Sắp xếp theo `month` tăng dần.

---

## 3. `web/data/data.json` — chuỗi giá theo tháng (build sinh ra)

Định dạng cột (columnar), gọn để frontend nạp nhanh:

```jsonc
{
  "dates": ["2016-01-01", "2016-02-01", ...],   // theo THÁNG, luôn là mùng 1
  "series": {
    "CELADON_2PN": [null, ..., 25000000, 25400000, ...],  // giá VND/m²; null = trước mở bán
    "RICHSTAR_3PN": [...],
    "CPI":          [100.0, 100.3, ...]                    // chỉ số CPI nội suy theo tháng
  }
}
```

- Trục `dates`: hợp nhất theo tháng, từ tháng sớm nhất → tháng hiện tại.
- `null` ở đầu chuỗi = mã **chưa mở bán** ở tháng đó (trước `launch_date`).
- `CPI` là chuỗi đặc biệt dùng để quy lợi nhuận thực (gốc = 100.0).
- Giá trong series là **giá / m²** (chưa nhân diện tích — simulator tự nhân `area`).

---

## 4. `web/data/meta.json` — metadata + phí (build sinh ra)

```jsonc
{
  "assets": {
    "CELADON_2PN": {
      "name": "Celadon City — 2PN",
      "group": "Celadon City",
      "type": "2PN",
      "area": 68,                  // m²
      "handover": "2018-06-01",    // tháng bàn giao (YYYY-MM-01)
      "rental_yield": 0.048,       // PHÂN SỐ/năm (đã chia 100 từ anchors: 4.8 → 0.048)
      "first_date": "2015-06-01"   // tháng đầu có giá (= launch_date)
    }
    // ... mọi key trong anchors.csv
  },
  "groups": ["Celadon City", "Richstar", ...],   // danh sách dự án, để dựng cây chọn
  "presets": { "Tầm 2 tỷ": ["...","..."], ... }, // nhóm chọn nhanh 1-click
  "fees": {
    "buy_tax":     0.005,   // trước bạ khi mua          = 0,5%
    "sell_broker": 0.015,   // môi giới khi bán          = 1,5%
    "sell_tax":    0.02,    // thuế TNCN khi bán         = 2%
    "maintenance": 0.02     // phí bảo trì (gộp vào vốn) = 2%
  }
}
```

Lưu ý chuyển đổi: `rental_yield` trong `anchors.csv` ghi dạng phần trăm (`4.8`), sang
`meta.json` đã là **phân số** (`0.048`). Frontend dùng thẳng phân số.

---

## 5. `web/data/insights.json` — câu chuyện theo DỰ ÁN (viết tay)

Key theo **group** (dự án), KHÔNG theo từng mã căn:

```jsonc
{
  "Celadon City": {
    "name": "Celadon City",
    "story": "2-4 câu tiếng Việt: bối cảnh dự án + diễn biến giá, đọc nhanh.",
    "events": [
      { "date": "2018-06-01", "label": "Bàn giao block đầu" },
      { "date": "2021-03-01", "label": "Mở bán phân khu mới" }
    ]
  }
  // ... mọi group
}
```

- `events[].date` luôn `YYYY-MM-01`. Không chắc mốc nào thì để `events` rỗng.
- File này **không** bị `build_data.py` ghi đè.

---

## 6. Công thức nội suy "neo theo chỉ số"

`build_data.py` không nội suy thẳng tuyến tính giữa 2 mốc giá, mà **bám hình của chỉ số
thị trường** rồi kéo cho chạm đúng giá neo ở 2 đầu. Với mỗi đoạn anchor `a → b` (vd
`launch → mid`, rồi `mid → current`), gọi:

- `Pa`, `Pb` = giá neo tại đầu `a` và cuối `b`.
- `m[t]` = chỉ số thị trường (đã nội suy theo tháng) tại tháng `t`.
- `progress` = tiến độ thời gian trong đoạn, chạy `0 → 1` từ `a` đến `b`.

Công thức cho từng tháng `t` trong đoạn:

```
ppsm_t = Pa * (m[t] / m[a]) * ((Pb/Pa) / (m[b]/m[a])) ^ progress
```

Ý nghĩa:
- `Pa * (m[t]/m[a])` = thả giá đi theo đúng hình thị trường.
- Thừa số mũ `progress` = hệ số chỉnh để **chạm đúng giá neo** `Pb` khi `progress = 1`,
  còn `progress = 0` thì bằng `Pa`. Phần giữa được "bo" theo thị trường thay vì thẳng đuột.

Kết quả: đường giá luôn đi qua đúng 3 mốc neo, nhưng đoạn ở giữa uốn lượn theo chu kỳ
thị trường thật → trực quan và hợp lý hơn nội suy tuyến tính.

---

## 7. Mô hình Simulator — MUA ĐỨT 1 căn (chạy ở frontend, JS)

> Đây KHÔNG phải DCA. Người dùng mua đứt **một căn** lúc mở bán rồi giữ. Lợi nhuận =
> tăng giá vốn + (tùy chọn) tiền cho thuê tích lũy sau bàn giao, đã trừ phí & thuế.

Ký hiệu cho mỗi mã đã chọn: `area` = diện tích, `p[t]` = giá/m² tại tháng `t`,
`y` = `rental_yield` (phân số/năm), phí lấy từ `meta.fees`.

**Vốn mua (bỏ ra lúc mở bán)**
```
von_mua = area * p[launch] * (1 + buy_tax + maintenance)
```

**Giá trị căn theo thời gian**
```
gia_tri[t] = area * p[t]
```

**Tiền cho thuê tích lũy** (chỉ tính từ tháng bàn giao trở đi)
```
thue[t] = thue[t-1] + (t >= handover ? gia_tri[t] * y / 12 : 0)
```
(mỗi tháng cộng thêm `giá trị hiện tại × yield / 12`; trước bàn giao không cộng.)

**Lãi ròng khi bán tại tháng cuối `T`**
```
lai_rong = gia_tri[T] * (1 - sell_broker - sell_tax) + thue[T] - von_mua
```

**Chỉ số hiển thị / mã**: vốn mua, giá trị hiện tại, %lãi trên vốn, **CAGR**, lãi ròng
khi bán; có thể quy lợi nhuận thực bằng cách chia cho `CPI[t] / CPI[launch]`.

**Bật/tắt tiền thuê**: nếu người dùng tắt cho thuê thì bỏ số hạng `thue[T]` (chỉ tính
lãi do tăng giá vốn).
