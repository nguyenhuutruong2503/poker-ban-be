# 🃏 Poker Bạn Bè — Texas Hold'em Multiplayer Real-time

Game poker Texas Hold'em chơi online với bạn bè, real-time thật (không phải làm mới
trang để cập nhật). Luật chuẩn phổ biến nhất: mù nhỏ/mù lớn cố định, tối đa 6
người/bàn, tự động chia lượt.

## 1. Cấu trúc dự án

```
poker-project/
├── server.js              Máy chủ chính (Express + Socket.io)
├── package.json           Danh sách thư viện cần cài
├── game/
│   ├── Deck.js             Bộ bài 52 lá, xáo bài
│   ├── HandEvaluator.js    Tính bài mạnh nhất (so hạng poker)
│   └── Table.js            "Bộ não" ván bài: chia bài, cược, chia pot
└── public/                 Giao diện web (chạy trên trình duyệt)
    ├── index.html
    ├── style.css
    └── client.js
```

**Cách đọc code gợi ý theo thứ tự dễ hiểu nhất:**
`game/Deck.js` → `game/HandEvaluator.js` → `game/Table.js` → `server.js` → `public/client.js`

Mỗi file đều có chú thích tiếng Việt giải thích logic. `Table.js` là file quan
trọng nhất — nó mô phỏng toàn bộ luật chơi.

## 2. Chạy thử trên máy của bạn

Bạn đã có Node.js và VS Code, nên chỉ cần:

1. Mở thư mục `poker-project` bằng VS Code.
2. Mở Terminal trong VS Code (menu **Terminal → New Terminal**).
3. Cài thư viện cần thiết:
   ```
   npm install
   ```
4. Chạy server:
   ```
   npm start
   ```
5. Mở trình duyệt vào `http://localhost:3000`
6. Mở thêm vài tab/trình duyệt khác (hoặc nhờ bạn bè cùng mạng LAN vào IP máy
   bạn) để test nhiều người chơi cùng lúc.

Khi 2 người đã vào cùng một "mã bàn", người nào cũng có thể bấm **Bắt đầu ván
mới** để chia bài.

## 3. Học Git/GitHub từ đầu (cần để deploy)

Git là công cụ lưu lịch sử code, GitHub là nơi lưu code trên mạng để các dịch
vụ hosting như Render lấy code về chạy.

### Bước 1 — Cài Git
Tải tại https://git-scm.com/downloads, cài đặt như bình thường (Next liên
tục là được).

### Bước 2 — Tạo tài khoản GitHub
Vào https://github.com, đăng ký tài khoản miễn phí.

### Bước 3 — Đưa code lên GitHub
Trong Terminal, ở thư mục `poker-project`, chạy lần lượt:

```
git init
git add .
git commit -m "Ban dau: poker bạn bè"
```

Sau đó vào GitHub, bấm **New repository** (nút dấu +  góc trên bên phải),
đặt tên (ví dụ `poker-ban-be`), **để chế độ Public**, bấm **Create
repository**. GitHub sẽ hiện sẵn 2-3 dòng lệnh — copy đúng đoạn có dạng:

```
git remote add origin https://github.com/ten-ban/poker-ban-be.git
git branch -M main
git push -u origin main
```

Dán vào Terminal và Enter. Nếu được hỏi đăng nhập, làm theo hướng dẫn trên
màn hình (GitHub Desktop hoặc token) — lần đầu hơi lằng nhằng nhưng chỉ cần
làm một lần.

Từ nay, mỗi khi bạn sửa code và muốn cập nhật lên GitHub:
```
git add .
git commit -m "Mô tả bạn sửa gì"
git push
```

## 4. Deploy lên Render (miễn phí)

1. Vào https://render.com, đăng ký/đăng nhập bằng tài khoản GitHub.
2. Bấm **New +** → **Web Service**.
3. Chọn repository `poker-ban-be` bạn vừa đẩy lên.
4. Điền cấu hình:
   - **Build Command**: `npm install`
   - **Start Command**: `npm start`
   - **Instance Type**: Free
5. Bấm **Create Web Service**. Render sẽ tự build và chạy, mất khoảng 2-5
   phút.
6. Khi xong, Render cho bạn một link dạng
   `https://poker-ban-be.onrender.com` — gửi link này cho bạn bè là vào chơi
   được, không cần cài gì cả.

**Lưu ý gói miễn phí:** server sẽ "ngủ" sau ~15 phút không ai truy cập, và
mất khoảng 30-50 giây để "thức dậy" ở lượt truy cập đầu tiên sau đó — báo
trước cho bạn bè để họ không tưởng bị lỗi.

## 5. Cách chơi

- Mỗi người vào cùng **mã bàn** (tự đặt tên bất kỳ, ví dụ `ban-cua-tui`) sẽ
  ngồi chung bàn.
- Đủ từ 2 người trở lên, ai cũng bấm được **Bắt đầu ván mới**.
- Mù nhỏ = 10 chip, mù lớn = 20 chip, mỗi người bắt đầu với 1000 chip.
- Hết chip thì tự động ngồi ngoài chờ ván sau (không có cách "nạp thêm" — có
  thể tự thêm tính năng này sau).
- Có bộ đếm giờ 30 giây mỗi lượt, hết giờ tự động check hoặc úp bài.
- **Bảng xếp hạng** (biểu tượng 🏆) lưu lại tổng lời/lỗ chip của từng người
  qua các ván, dùng để "khoe" ai giỏi nhất hội.

## 6. Đã tự rà soát và sửa lỗi (bản cập nhật)

Sau khi code xong bản đầu, mình tự kiểm tra lại và tìm ra + sửa các lỗi sau:

- **Lỗi nghiêm trọng nhất**: người vào bàn giữa ván bị "kẹt" ngồi ngoài vĩnh viễn,
  không bao giờ được vào chơi. Đã sửa: khi ván đang diễn ra kết thúc, ai còn chip
  đều tự động được xếp vào ván tiếp theo.
- **Kết nối lại giữ nguyên chip**: trước đây mất mạng/đổi tab là mất trắng, giờ
  trong vòng 2 phút, quay lại với đúng tên là được ngồi lại đúng chỗ, giữ nguyên
  số chip (trang web cũng tự động vào lại bàn cũ khi bạn F5 hoặc mất mạng, không
  cần gõ tên lại).
- Sửa trường hợp hiếm: người chơi hết sạch chip ngay từ lúc đặt tiền mù không còn
  bị gán nhầm lượt chơi.
- Sửa vị trí "nút dealer" không còn bị lệch sau khi có người rời bàn.
- Sửa tin nhắn hiển thị sai số tiền khi ai đó gọi (call) nhưng không đủ chip.
- Thêm kiểm tra: chỉ người đang ngồi ở bàn mới bấm được "Bắt đầu ván".

## 7. Những điều mình đơn giản hóa (biết trước để không bất ngờ)

- **Bảng xếp hạng lưu vào 1 file `leaderboard.json` trên server** — đơn
  giản, dễ hiểu, nhưng nếu Render restart server (gói free có thể tự
  restart định kỳ) thì dữ liệu này có thể mất. Muốn bền hơn cần chuyển sang
  một cơ sở dữ liệu thật (ví dụ: một bước học tiếp theo tốt!).
- **Chưa có xác thực đăng nhập thật** — chỉ nhập tên, chưa chặn trùng tên
  ác ý hay giả danh bạn bè. Đủ dùng cho nhóm bạn bè tin tưởng nhau.
- **Chưa có tính năng mua/nạp thêm chip giữa ván.**
- **Side pot (khi có người all-in ít tiền hơn)** đã được xử lý, nhưng đây
  là phần logic phức tạp nhất — nếu chơi nhiều thấy chỗ nào tính sai, gửi
  lại tình huống cụ thể để mình sửa.
- **Ghế của người mất kết nối được giữ 2 phút** để họ có thể quay lại — nghĩa là
  nếu bàn đủ 6 người và có người rớt mạng, ghế của họ vẫn tính là "đang chiếm chỗ"
  trong 2 phút đó, người mới chưa vào thay được ngay.

## 8. Gợi ý học tiếp

- Đọc kỹ `game/Table.js`, thử tự thêm tính năng nhỏ như "mua thêm chip".
- Thử đổi giao diện trong `style.css` theo phong cách riêng của bạn.
- Học thêm về Socket.io qua tài liệu chính thức: https://socket.io/docs/
