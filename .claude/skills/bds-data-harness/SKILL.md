---
name: bds-data-harness
description: Orchestrator điều phối vòng đời dữ liệu BĐS Tân Phú — nghiên cứu giá thật, thêm/mở rộng mã căn hộ theo logic tree, cập nhật anchors.csv, build & verify. Dùng BẮT BUỘC cho mọi yêu cầu đổi dữ liệu/giá/mã căn hộ Tân Phú: "nghiên cứu giá", "cập nhật giá", "thêm căn hộ", "mở rộng mã", "rebuild data", "sửa giá", và follow-up "làm lại / cập nhật / bổ sung / sửa / chạy lại". Câu hỏi đơn thuần (không đổi dữ liệu) thì trả lời trực tiếp.
---

# bds-data-harness — Orchestrator

Điều phối team theo pipeline + generate-verify: `bds-price-researcher` (nghiên cứu, fan-out song song) → `bds-data-builder` (gộp + build) → `bds-qa` (verify). Chế độ **sub-agent fan-out**: gọi qua công cụ `Agent`, luôn `model:"opus"`.

> Runtime: agent định nghĩa ở `.claude/agents/*.md`. Nếu subagent_type tùy biến chưa nạp trong phiên, spawn `general-purpose` và YÊU CẦU agent đọc file định nghĩa (`.claude/agents/{name}.md`) + skill liên quan rồi tuân theo.

## Phase 0 — Kiểm context (chọn chế độ chạy)
- `_workspace/` chưa có → **chạy mới**.
- `_workspace/` có + yêu cầu sửa một phần → **chạy lại phần đó** (chỉ gọi agent liên quan).
- `_workspace/` có + đầu vào mới hoàn toàn → đổi tên `_workspace/`→`_workspace_prev/` rồi chạy mới.
Luôn đọc `data/anchors.csv` + chạy `verify_data.py` để biết trạng thái nền (số mã, confidence).

## Phase 1 — Nghiên cứu (fan-out song song)
Xác định dự án cần xử lý. Mỗi dự án spawn 1 `bds-price-researcher` (song song; `run_in_background` khi nhiều). Giao: tên dự án, mã liên quan (key/loại/diện tích), giá anchor hiện tại. Mỗi agent ghi `_workspace/research_{KEY}.md`.

## Phase 2 — Gộp & Build
Spawn 1 `bds-data-builder`: đọc mọi `_workspace/research_*.md` + chỉ thị thêm mã (logic tree) → cập nhật `data/anchors.csv` (giữ 12 seed) → `build_data.py` → `verify_data.py` (nội bộ) → ghi `_workspace/build_diff.md`.

## Phase 3 — QA
Spawn 1 `bds-qa`: chạy `verify_data.py`, đối chiếu boundary data↔frontend, smoke-test Preview nếu có. Trả PASS/FAIL + vấn đề.

## Truyền dữ liệu
File-based qua `_workspace/{NN}_{agent}_{artifact}` + `data/anchors.csv`; kết quả sub-agent qua return value. Sản phẩm chính thức chỉ là `data/anchors.csv` + `web/data/*.json`; `_workspace/` giữ lại để truy vết.

## Xử lý lỗi
Researcher fail → retry 1 lần → vẫn fail thì bỏ qua dự án đó, ghi thiếu trong báo cáo (không chặn pipeline). Builder/QA FAIL → sửa tới PASS. Nguồn mâu thuẫn → giữ cả hai kèm nguồn, để người duyệt chọn.

## Quy tắc bất biến
KHÔNG ghi đè 12 mã seed gốc. Không bịa số. Kết thúc LUÔN báo: mã đã đổi (cũ→mới + nguồn), confidence mới, mã còn `thấp`.

## Test scenarios
- **Bình thường:** "nghiên cứu giá thật cho mọi mã thấp" → fan-out 10 dự án → builder gộp → QA PASS → báo diff.
- **Lỗi:** 1 dự án không có nguồn giá mở bán → researcher giữ ước lượng + `thấp` + note → pipeline vẫn hoàn tất, báo cáo nêu rõ mã còn `thấp`.
