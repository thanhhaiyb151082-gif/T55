# QUIZ SURVIVAL – HOÁ HỌC CHALLENGE (chế độ tính điểm)

Ứng dụng trò chơi trắc nghiệm thời gian thực, **tính điểm và xếp hạng**, sử dụng **Node.js, Express và Socket.IO**.

## 1. Chức năng

- **10 câu hỏi** Hoá học 10 (Kết nối tri thức), chương Bảng tuần hoàn các nguyên tố hoá học (Bài 6–8). Số câu và thời gian chỉnh trong `config/game.config.js`.
- **20 giây** cho mỗi câu hỏi (mặc định).
- **Nhạc đếm ngược 20 giây** (`public/js/music.js`): nhạc ngũ cung vui nhẹ, không lời, 120 BPM, được tổng hợp bằng Web Audio API nên không dùng bài hát có bản quyền và không cần tải file. Nửa đầu thong thả, nửa sau thêm nhịp phách, 5 giây cuối có tiếng "tích" mỗi giây, hết giờ có một hồi chuông nhẹ. Nhạc bám theo đồng hồ của máy chủ nên người vào lại giữa chừng nghe đúng đoạn đang chạy. **Trang quản trị bật nhạc mặc định** (nối loa/máy chiếu của giáo viên); **điện thoại người chơi tắt mặc định** để cả lớp không cùng ồn, học sinh dùng tai nghe tự bấm nút "Nhạc" để bật (lựa chọn được nhớ). Muốn bật sẵn trên máy người chơi, đổi `defaultOn: false` thành `true` trong `public/js/player.js`. Trình duyệt chỉ phát âm thanh sau khi người dùng chạm/bấm vào trang, nên trang quản trị có tiếng sau lần đăng nhập đầu tiên.
- **Xáo trộn riêng cho từng người chơi:** mỗi người nhận 10 câu theo một thứ tự ngẫu nhiên riêng, và bốn đáp án A–D của mỗi câu cũng được xáo riêng. Trong cùng một vòng, mỗi người đang làm một câu khác nhau. Máy chủ lưu kế hoạch xáo của từng người (`src/core/shuffle.js`), quy đổi chữ cái người chơi bấm về đáp án gốc để chấm điểm, và gửi giải thích đã sắp lại đúng theo thứ tự người đó nhìn thấy.
- **Không ai bị loại.** Mọi người chơi đều làm đủ 10 câu.
- **Tính điểm:** trả lời đúng **+10 điểm**, trả lời sai hoặc không trả lời **0 điểm** (chỉnh `pointsPerCorrect`, `pointsPerWrong`).
- **Xếp hạng từ cao đến thấp theo tổng điểm.** Cùng điểm thì người có tổng thời gian trả lời đúng ít hơn xếp trên; hai người trùng cả điểm lẫn thời gian thì đồng hạng. Đặt `tieBreakByTime: false` nếu muốn cùng điểm là đồng hạng.
- **Giải thích từng đáp án sau mỗi câu:** khi hết giờ, màn hình người chơi hiện câu hỏi của chính mình, đáp án đúng, đáp án mình đã chọn, lý do **vì sao đúng và vì sao các phương án còn lại sai**, số bạn chọn mỗi phương án (tính trên những người đã làm câu đó), điểm câu vừa rồi, tổng điểm, hạng và Top 5.
- Kết thúc câu 10: bảng xếp hạng chung cuộc (Top 10) trên điện thoại người chơi; trang quản trị hiện Top 3.
- Mỗi người chỉ được gửi một đáp án trong mỗi câu; máy chủ chấm điểm, người chơi không thể lấy đáp án từ trình duyệt trước khi hết giờ.
- Trang quản trị có mật khẩu: bắt đầu, chuyển câu, đặt lại; xem tiến độ vòng, bảng xếp hạng đầy đủ, thống kê tích luỹ theo từng câu hỏi (tỉ lệ đúng, phân bố A/B/C/D theo thứ tự gốc) và **xuất kết quả CSV** (mở được bằng Excel).
- Tải lại trang giữa chừng vẫn thấy đúng câu hỏi, đáp án đã chọn, điểm, hạng và phần giải thích.
- Trạng thái chính của game lưu trong RAM của một tiến trình Node.js. Có endpoint `/health`.

> **Lưu ý về dữ liệu:** Đây là phiên bản RAM-first. Nếu tiến trình khởi động lại, dữ liệu người chơi và trạng thái đang chạy sẽ mất. Hãy bấm **Xuất CSV** ở trang quản trị ngay khi kết thúc để lưu kết quả. Không triển khai nhiều instance/replica cho phiên bản này.

## 2. Cấu trúc thư mục

```text
quiz-survival/
├── package.json
├── server.js
├── .env.example
├── .gitignore
├── README.md
├── config/
│   └── game.config.js      (số câu, thời gian, điểm, cách xếp hạng)
├── data/
│   └── questions.json      (10 câu hỏi + giải thích từng đáp án)
├── src/
│   ├── core/
│   │   ├── shuffle.js      (xáo câu hỏi/đáp án cho từng người)
│   │   ├── playerView.js   (dựng câu hỏi riêng của người chơi)
│   │   ├── gameState.js
│   │   ├── gameEngine.js   (vòng đời game, gửi đáp án + giải thích)
│   │   ├── timerEngine.js
│   │   ├── answerEngine.js (nhận và kiểm tra đáp án)
│   │   ├── rankingEngine.js(chấm điểm, bảng xếp hạng)
│   │   ├── adminAuth.js
│   │   └── validateQuestions.js
│   └── socket/
│       └── index.js
└── public/
    ├── images/
    ├── index.html
    ├── admin.html
    ├── css/ (style.css, admin.css)
    └── js/  (player.js, admin.js)
```

## 3. Chạy thử trên máy tính

### Yêu cầu

- Node.js 20 trở lên.
- npm.

### Các bước

1. Giải nén thư mục dự án.
2. Mở Terminal/Command Prompt tại thư mục `quiz-survival`.
3. Cài thư viện:

```bash
npm install
```

4. Tạo file `.env` từ `.env.example`.

macOS/Linux:

```bash
cp .env.example .env
```

Windows PowerShell:

```powershell
Copy-Item .env.example .env
```

5. Mở `.env`, thay mật khẩu quản trị:

```env
PORT=3000
NODE_ENV=development
ADMIN_PASSWORD=thay-bang-mat-khau-rieng-dai-va-kho-doan
```

Không chia sẻ mật khẩu này cho người chơi và không đưa file `.env` lên GitHub.

6. Khởi chạy:

```bash
npm start
```

Mở:

- Người chơi: http://localhost:3000/
- Quản trị: http://localhost:3000/admin
- Kiểm tra server: http://localhost:3000/health

Để dừng server, nhấn `Ctrl + C`.

## 4. Upload dự án lên GitHub

### Cách A – Upload bằng giao diện website GitHub

1. Đăng nhập GitHub.
2. Chọn **New repository**.
3. Đặt tên, ví dụ `quiz-survival`.
4. Chọn Public hoặc Private tùy nhu cầu.
5. Không cần tạo README, `.gitignore` hoặc license mới nếu dự án đã có các file này.
6. Tạo repository.
7. Trong repository, chọn **Add file → Upload files**.
8. Kéo thả các thư mục và file của dự án vào vùng upload. Đảm bảo giữ nguyên cấu trúc thư mục.
9. Không upload `node_modules/` và `.env`.
10. Nhập nội dung commit, ví dụ `Initial Quiz Survival project`, rồi chọn **Commit changes**.

GitHub hướng dẫn thao tác tại:
https://docs.github.com/en/repositories/working-with-files/managing-files/adding-a-file-to-a-repository

### Cách B – Upload bằng Git trên máy tính

Mở Terminal tại thư mục dự án:

```bash
git init
git add .
git commit -m "Initial Quiz Survival project"
git branch -M main
git remote add origin https://github.com/USERNAME/quiz-survival.git
git push -u origin main
```

Thay `USERNAME` bằng tên tài khoản GitHub và kiểm tra URL repository trước khi chạy lệnh.

Nếu Git yêu cầu đăng nhập, hoàn tất bước xác thực theo hướng dẫn của GitHub.

## 5. Triển khai lên Render

Render chạy ứng dụng Express dưới dạng **Web Service**, không phải Static Site, vì ứng dụng cần Node.js và WebSocket.

Tài liệu chính thức:
- https://render.com/docs/deploy-node-express-app
- https://render.com/docs/web-services
- https://render.com/docs/free

### Các bước

1. Đăng nhập https://render.com/
2. Kết nối tài khoản GitHub.
3. Chọn **New → Web Service**.
4. Chọn repository `quiz-survival`.
5. Cấu hình:

| Trường | Giá trị |
|---|---|
| Name | `quiz-survival-ai` |
| Runtime | Node |
| Build Command | `npm install` |
| Start Command | `npm start` |
| Health Check Path | `/health` |

6. Chọn gói dịch vụ phù hợp. Nếu chỉ thử nghiệm, kiểm tra xem Free instance có đang được cung cấp cho tài khoản và khu vực của bạn hay không.
7. Trong phần **Environment Variables**, thêm:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | Mật khẩu quản trị riêng, dài và khó đoán |

Không cần tự đặt `PORT`; Render cấp biến này cho ứng dụng.

8. Chọn **Create Web Service** và chờ quá trình build/deploy hoàn tất.
9. Render cấp địa chỉ dạng:

```text
https://quiz-survival-ai.onrender.com
```

Đây là ví dụ minh họa; tên miền thật do Render cấp.

10. Truy cập:
    - Trang người chơi: `https://TEN-MIEN-RENDER/`
    - Trang quản trị: `https://TEN-MIEN-RENDER/admin`
    - Health check: `https://TEN-MIEN-RENDER/health`

Sau khi kết nối GitHub, các lần push lên nhánh đã liên kết có thể kích hoạt tự động deploy.

### Lưu ý rất quan trọng khi dùng Render Free

- Free Web Service có thể tự sleep sau thời gian không có hoạt động và cần thời gian khởi động lại khi có lượt truy cập mới.
- Tiến trình khởi động lại sẽ làm mất trạng thái đang lưu trong RAM.
- Không nên dùng gói miễn phí làm hạ tầng duy nhất cho một sự kiện quan trọng cần hoạt động liên tục.
- Nếu tổ chức sự kiện trực tiếp, nên cân nhắc instance luôn hoạt động, thử nghiệm trước và có phương án dự phòng.

## 6. Triển khai lên Railway

Tài liệu chính thức:
- https://docs.railway.com/quick-start
- https://railway.com/guides/express

### Các bước

1. Đăng nhập https://railway.com/
2. Tạo Project mới.
3. Chọn **Deploy from GitHub Repo**.
4. Kết nối GitHub nếu Railway yêu cầu.
5. Chọn repository `quiz-survival`.
6. Railway tự nhận diện ứng dụng Node.js từ `package.json`.
7. Mở phần **Variables** của service và thêm:

| Key | Value |
|---|---|
| `NODE_ENV` | `production` |
| `ADMIN_PASSWORD` | Mật khẩu quản trị riêng |

Không cần tự đặt `PORT` nếu Railway đã cấp biến này.

8. Chờ Railway build và deploy.
9. Mở phần **Settings → Networking** của service.
10. Chọn **Generate Domain** để tạo URL public.
11. Truy cập domain vừa tạo:
    - Người chơi: `https://TEN-MIEN-RAILWAY/`
    - Quản trị: `https://TEN-MIEN-RAILWAY/admin`

Kiểm tra log nếu deployment thất bại. Đảm bảo lệnh start là `npm start`.

### Chi phí Railway

Railway có thể yêu cầu gói dịch vụ hoặc thanh toán theo mức sử dụng. Chính sách, credit dùng thử và giá có thể thay đổi; hãy kiểm tra trang Pricing trước khi triển khai:
https://railway.com/pricing

## 7. Cách vận hành trò chơi

1. Ban tổ chức mở `/admin`, nhập mật khẩu quản trị.
2. Người chơi quét QR hoặc mở URL trang chủ, nhập họ tên và lớp/đơn vị.
3. Ban tổ chức kiểm tra danh sách người tham gia rồi nhấn **Bắt đầu câu 1**. Sau khi bắt đầu, không đăng ký thêm người mới.
4. Mỗi câu có 20 giây; máy chủ tự động đóng câu khi hết giờ và chấm điểm (đúng +10, sai/bỏ trống 0).
5. Ngay sau khi hết giờ, mỗi người chơi thấy đáp án đúng của câu mình vừa làm, giải thích từng đáp án, điểm và hạng. Vì mỗi người làm một câu khác nhau trong cùng vòng nên không chiếu chung một câu để chữa; trang quản trị có bảng thống kê tích luỹ theo từng câu (tỉ lệ đúng, phân bố lựa chọn) để giáo viên chữa bài theo quan niệm sai phổ biến sau khi kết thúc.
6. Giáo viên nhấn **Chuyển sang câu tiếp theo** khi đã chữa xong (không bị giới hạn thời gian chữa bài).
7. Sau câu 10, hệ thống công bố bảng xếp hạng chung cuộc. Nhấn **Xuất CSV** để lưu bảng điểm (hạng, họ tên, lớp, tổng điểm, số câu đúng, điểm từng câu).

## 8. Quy tắc thời gian và công bằng

- Thời hạn mỗi câu do máy chủ quyết định bằng đồng hồ đơn điệu `performance.now()`; đồng hồ ở trình duyệt chỉ để hiển thị.
- Đáp án gửi sau hạn bị từ chối; mỗi người chỉ gửi một đáp án mỗi câu.
- Điểm chỉ phụ thuộc đúng/sai, **không phụ thuộc tốc độ**. Thời gian trả lời chỉ dùng để phân hạng giữa những người **bằng điểm** (có thể tắt bằng `tieBreakByTime: false`).
- Tốc độ mạng vẫn ảnh hưởng đến thời điểm máy chủ nhận đáp án; nên dùng Wi-Fi ổn định và chạy thử tại địa điểm tổ chức.

## 9. Các giới hạn của phiên bản hiện tại

1. Trạng thái game lưu trong RAM; restart/redeploy làm mất phiên đang chạy.
2. Chỉ nên chạy một instance/replica.
3. Đăng ký người mới khóa khi trò chơi đã bắt đầu; người đã có mã kết nối có thể vào lại khi tiến trình vẫn còn. Tối đa `maxPlayers` (mặc định 300) người.
4. Chưa có database; kết quả được lưu bằng nút **Xuất CSV**.
5. Chưa có trang trình chiếu riêng; có thể chiếu trang quản trị (đã hiện câu hỏi, đáp án, giải thích, bảng xếp hạng) hoặc phát triển thêm `screen.html`.
6. Bộ 10 câu trong `data/questions.json` (Bài 6–8, chương Bảng tuần hoàn, Hoá học 10 – Kết nối tri thức) do trợ lý soạn; giáo viên cần rà soát nội dung, đáp án và phần giải thích trước khi dùng.

## 10. Checklist trước ngày tổ chức

- [ ] Đã triển khai thành công và mở được URL public.
- [ ] Đã đổi mật khẩu quản trị.
- [ ] Đã kiểm tra trên điện thoại Android và iPhone.
- [ ] Đã thử đăng ký nhiều người chơi.
- [ ] Đã thử trả lời đúng, sai và không trả lời; kiểm tra điểm +10 / 0.
- [ ] Đã kiểm tra thời hạn 20 giây.
- [ ] Đã mở trên 2–3 điện thoại và thấy thứ tự câu, thứ tự đáp án khác nhau; đáp án đúng vẫn được chấm đúng.
- [ ] Đã kiểm tra phần giải thích đáp án hiện đúng sau mỗi câu.
- [ ] Đã kiểm tra bảng xếp hạng và nút Xuất CSV.
- [ ] Đã kiểm tra tải lại trang giữa chừng và kết nối lại.
- [ ] Đã thử tải với số lượng người dự kiến.
- [ ] Đã có mạng Internet và phương án dự phòng.

**Khuyến nghị:** Không thử nghiệm lần đầu ngay trong sự kiện. Hãy tổ chức một buổi chạy thử với số lượng thiết bị tương đương số người chơi thực tế.

## 11. Đăng nhập quản trị và xử lý lỗi mật khẩu

Từ phiên bản này, trang `/admin` gửi mật khẩu bằng `POST /api/admin/login` (HTTPS), nhận lại một mã phiên (8 giờ) rồi mới kết nối Socket.IO. Mật khẩu không còn đi qua Socket.IO.

- Mật khẩu đọc từ biến môi trường `ADMIN_PASSWORD` (Render: **Environment**). Khoảng trắng/xuống dòng thừa và dấu nháy bao quanh được tự loại bỏ.
- Mở `/health`: trường `adminPasswordConfigured` là `true` nghĩa là server đã nhận được biến (không hiển thị giá trị).
- **Nếu trang admin báo "Máy chủ chưa có biến ADMIN_PASSWORD"** (trên Render):
  1. Vào dịch vụ → **Environment** → **Add Environment Variable**: Key `ADMIN_PASSWORD`, Value là mật khẩu bạn chọn.
  2. Bấm **Save, rebuild, and deploy** (hoặc **Manual Deploy → Deploy latest commit**) và chờ trạng thái **Live**.
  3. Mở `https://TEN-MIEN-RENDER/health`, thấy `"adminPasswordConfigured": true` là xong, rồi đăng nhập `/admin`.
  Tên biến phải viết đúng `ADMIN_PASSWORD`; file `.env` chỉ có tác dụng khi chạy trên máy tính, không được đưa lên GitHub nên Render không đọc được.
- Tối đa 10 lần thử đăng nhập / 15 phút / IP.
- Khởi động lại server thì mã phiên mất, cần đăng nhập lại.

> Chế độ xáo trộn bật mặc định, không cần cấu hình. Các lời giải thích trong `explanations` **không nên nhắc tới chữ cái phương án** (ví dụ "như đáp án A") vì chữ cái mỗi người thấy khác nhau; hãy nhắc bằng nội dung.

## 12. Thay câu hỏi, thay lĩnh vực và thêm hình ảnh

**Thay câu hỏi.** Sửa `data/questions.json`. Mỗi câu có dạng:

```json
{
  "id": 1,
  "question": "Nội dung câu hỏi",
  "image": "/images/q1.png",
  "options": { "A": "...", "B": "...", "C": "...", "D": "..." },
  "correctAnswer": "C",
  "explanations": {
    "A": "Chưa đúng. Lý do đáp án A sai...",
    "B": "Chưa đúng. Lý do đáp án B sai...",
    "C": "Đúng. Lý do đáp án C đúng...",
    "D": "Chưa đúng. Lý do đáp án D sai..."
  }
}
```

- **`explanations` là bắt buộc** và phải có đủ 4 đáp án A, B, C, D. Nên bắt đầu bằng "Đúng." hoặc "Chưa đúng." rồi nêu lý do ngắn gọn; nếu đáp án sai phản ánh một lỗi hay gặp thì nói rõ lỗi đó.
- `image` là tùy chọn. Đặt file ảnh trong `public/images/` và ghi đường dẫn bắt đầu bằng `/images/`.
- Nên đặt tên ảnh trung tính (`q1.png`, `q3.png`). Tên như `cau1-maltose.png` làm lộ chủ đề câu hỏi vì trình duyệt tải trước ảnh khi người chơi vào phòng.
- Công thức hóa học viết bằng ký tự Unicode (H₂O, CH₃COOC₂H₅, C₆H₁₂O₆); công thức phức tạp (công thức cấu tạo, sơ đồ, thí nghiệm) dùng ảnh.
- Ảnh nên nhẹ (dưới khoảng 200 KB) để tải nhanh trên mạng của người chơi.
- Nên xáo trộn vị trí đáp án đúng và giữ các phương án có độ dài gần bằng nhau để không đoán được.

**Đổi số câu, thời gian, điểm số.** Sửa `config/game.config.js`: `totalRounds`, `durationMs`, `pointsPerCorrect`, `pointsPerWrong`, `tieBreakByTime`, `maxPlayers`. Số câu trong `questions.json` phải bằng `totalRounds`. Giao diện người chơi và quản trị tự lấy các giá trị này từ máy chủ.

**Kiểm tra khi khởi động.** Máy chủ kiểm tra `questions.json` và cấu hình ngay khi chạy. Nếu thiếu đáp án, thiếu giải thích, `correctAnswer` sai, số câu không khớp `totalRounds` hoặc thiếu file ảnh, máy chủ dừng và ghi rõ lỗi trong log (Render > Logs).

**Đổi sang lĩnh vực khác.** Ngoài `questions.json`, đổi tên hiển thị trong `public/index.html`, `public/admin.html` và ô logo `.brand-mark`; đổi màu ở biến `:root` trong `public/css/style.css`.
