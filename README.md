# 🍄 TorioJump - Unfair Mario Web & Unity Demo

[![Unity](https://img.shields.io/badge/Unity-2022.3+-black?logo=unity&logoColor=white)](https://unity.com/)
[![Vite](https://img.shields.io/badge/Vite-JS/TS-646CFF?logo=vite&logoColor=white)](https://vitejs.dev/)
[![Status](https://img.shields.io/badge/Status-Troll_Mode_Active-red)](#)

Một dự án trình diễn vật lý nhân vật 2D phong cách "Super Mario Arcade" kết hợp với các cơ chế **Troll (Unfair)** cực kỳ ức chế nhưng đầy thú vị. Dự án bao gồm bản Controller chuyên sâu cho Unity và một bản Demo chơi ngay trên Web.

---

## 🕹️ Tính năng nổi bật

### 🏃 Vật lý nhân vật "Precision Arcade"
- **Variable Jump Height**: Nhảy cao thấp tùy thuộc vào thời gian giữ phím Space.
- **Apex Hang Time**: Giảm trọng lực ở đỉnh bước nhảy để kiểm soát trên không tốt hơn.
- **Coyote Time & Jump Buffering**: Các kỹ thuật giúp điều khiển trở nên mượt mà và "tha thứ" cho người chơi.
- **Double Jump**: Nhảy đôi cực mạnh để chinh phục các địa hình Parkour.

### 😈 Cơ chế Troll (Unfair Mechanics)
- **Meteorite Troll**: Thiên thạch bất thình lình rơi xuống đầu khi bạn đi qua tọa độ kích hoạt.
- **NPC Shooter**: Kẻ địch đứng canh gác liên tục bắn đạn về phía bạn.
- **Fake Win Sequence**: Khi bạn tưởng mình đã thắng tại Cửa Vàng, một ngón giữa khổng lồ sẽ hiện ra và một quả thiên thạch siêu to sẽ đè bẹp bạn!
- **Dynamic Messaging**: Hệ thống thông báo cá nhân hóa cực lầy lội "[Tên bạn] Gà Quá Haha".

### 🔊 Âm thanh & Hình ảnh
- **Synthesized Audio**: Âm thanh arcade boing/oof được tổng hợp trực tiếp bằng Web Audio API.
- **Rainbow UI**: Hiệu ứng chữ đổi màu rực rỡ và rung lắc khi troll.

---

## 🚀 Cách chạy dự án

### 🌐 Bản Web Demo (Vite)
Để chơi bản Web ngay trên máy của bạn:
1. Truy cập thư mục `web-mario`:
   ```bash
   cd web-mario
   ```
2. Cài đặt thư viện:
   ```bash
   npm install
   ```
3. Chạy server:
   ```bash
   npm run dev
   ```
4. Mở trình duyệt tại: `http://localhost:5173`

### 🎮 Bản Unity Controller
1. Mở thư mục gốc bằng **Unity Editor** (Khuyến nghị 2022.3+).
2. Tìm Script tại: `Assets/Scripts/PlayerController.cs`.
3. Gắn Script vào GameObject có `Rigidbody2D` và `BoxCollider2D`.
4. Cấu hình các thông số (Speed, Jump Force, Coyote Time,...) ngay trong **Inspector**.

---

## ⌨️ Điều khiển (Controls)

| Phím | Hành động |
| :--- | :--- |
| `A` / `D` hoặc `←` / `→` | Di chuyển trái / phải |
| `Space` / `W` | Nhảy (Nhấn 2 lần để Nhảy Đôi) |
| `Nhập tên` | Để cá nhân hóa độ "Gà" của bạn |

---

## 🛠️ Công nghệ sử dụng
- **Unity C#**: Cho logic vật lý 2D chuyên nghiệp.
- **TypeScript & Vite**: Cho bản Web Demo mượt mà.
- **HTML5 Canvas**: Rendering hiệu suất cao.
- **Web Audio API**: Xử lý âm thanh không cần file ngoài.

---

## ✍️ Tác giả
Dự án được thực hiện với tình yêu dành cho dòng game 2D Platformer và mong muốn mang lại tiếng cười (hoặc sự ức chế) cho người chơi.

**Chúc bạn chơi vui và không bị "Gà Quá Haha"!** 🎮🔥
