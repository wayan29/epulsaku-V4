# ePulsaku - Aplikasi Transaksi Produk Digital

Selamat datang di ePulsaku! Aplikasi web Next.js yang dirancang untuk memfasilitasi transaksi produk digital seperti pulsa, token listrik, top-up game, dan lainnya, dengan integrasi ke provider seperti Digiflazz dan TokoVoucher.

## Daftar Isi

1.  [Fitur Utama](#1-fitur-utama)
2.  [Prasyarat Server](#2-prasyarat-server)
3.  [Langkah-langkah Instalasi](#3-langkah-langkah-instalasi)
    *   [3.1. Clone Repository](#31-clone-repository)
    *   [3.2. Instal Node.js dan Git](#32-instal-nodejs-dan-git)
    *   [3.3. Instal MongoDB](#33-instal-mongodb)
    *   [3.4. Konfigurasi Variabel Lingkungan (.env)](#34-konfigurasi-variabel-lingkungan-env)
    *   [3.5. Instal Dependensi Aplikasi](#35-instal-dependensi-aplikasi)
    *   [3.6. Build Aplikasi](#36-build-aplikasi)
    *   [3.7. Menjalankan Aplikasi dengan PM2](#37-menjalankan-aplikasi-dengan-pm2)
4.  [Penting: Keamanan File .env di Produksi](#4-penting-keamanan-file-env-di-produksi)
5.  [Konfigurasi Pasca-Instalasi](#5-konfigurasi-pasca-instalasi)
    *   [5.1. Pengaturan Web Server (Nginx)](#51-pengaturan-web-server-nginx)
    *   [5.2. Buat Akun Admin Pertama](#52-buat-akun-admin-pertama)
    *   [5.3. Konfigurasi Admin Settings](#53-konfigurasi-admin-settings)
    *   [5.4. Konfigurasi Webhook Provider](#54-konfigurasi-webhook-provider)
    *   [5.5. Konfigurasi Notifikasi Telegram](#55-konfigurasi-notifikasi-telegram)
6.  [Struktur Proyek](#6-struktur-proyek)

---

## 1. Fitur Utama

*   **Frontend**: Next.js dengan React, ShadCN UI, dan Tailwind CSS.
*   **Backend**: Next.js API Routes dan Server Actions.
*   **Manajemen Pengguna**: Pendaftaran (hanya untuk super_admin pertama), login, ganti password, ganti PIN, dan manajemen peran (super_admin, admin, staf) dengan hak akses dinamis.
*   **Provider Produk Digital**: Terintegrasi dengan Digiflazz dan TokoVoucher.
*   **Form Order Dinamis**: Halaman pemesanan yang disesuaikan untuk Pulsa, Token Listrik, Top Up Game, dan layanan digital lainnya.
*   **Riwayat Transaksi**: Laporan transaksi yang detail, dapat difilter, dengan pengecekan status otomatis untuk transaksi yang pending.
*   **Laporan Profit**: Halaman ringkasan pendapatan, modal, dan profit dengan filter tanggal dan opsi cetak/simpan ke PDF.
*   **Pengaturan Harga**: Kemampuan untuk mengatur harga jual kustom untuk setiap produk dari Digiflazz & TokoVoucher.
*   **Webhook**: Handler webhook untuk update status transaksi otomatis dari provider.
*   **Admin Dashboard**: Halaman khusus untuk mengelola kredensial API, webhook, dan notifikasi Telegram secara aman (data sensitif dienkripsi di database).
*   **Notifikasi Telegram**: Notifikasi real-time untuk setiap transaksi (sukses, gagal, dll.) ke admin dan pengguna terkait.
*   **Alat Bantu**: Cek Nickname Game, Cek ID Pelanggan PLN, dan Cek Operator Seluler.
*   **Asisten AI**: Fitur chat dengan AI Gemini untuk bantuan.

## 2. Prasyarat Server

Sebelum memulai, pastikan VPS Anda (misalnya Ubuntu 22.04 LTS) memiliki:
*   Akses root atau pengguna dengan hak `sudo`.
*   Koneksi internet yang stabil.
*   (Opsional) Nama domain yang sudah diarahkan ke IP VPS Anda jika ingin menggunakan HTTPS.

Software yang perlu diinstal:
*   **Node.js**: Versi 18.x atau 20.x direkomendasikan.
*   **npm** atau **Yarn**: Biasanya terinstal bersama Node.js.
*   **Git**: Untuk clone repository.
*   **MongoDB**: Bisa diinstal lokal di VPS atau menggunakan layanan cloud seperti MongoDB Atlas.
*   **PM2**: Process Manager untuk Node.js, sangat penting untuk produksi.
*   **(Sangat Direkomendasikan) Nginx**: Sebagai reverse proxy untuk keamanan dan performa.

## 3. Langkah-langkah Instalasi

### 3.1. Clone Repository

Clone repository ini ke direktori yang Anda inginkan di server.
```bash
git clone [URL_REPOSITORY_ANDA] ePulsaku
cd ePulsaku
```
Ganti `[URL_REPOSITORY_ANDA]` dengan URL Git repository proyek Anda.

### 3.2. Instal Node.js dan Git

Cara termudah untuk menginstal Node.js adalah melalui NodeSource.
```bash
# Perbarui sistem Anda
sudo apt update && sudo apt upgrade -y

# Instal Git
sudo apt install -y git

# Instal Node.js 20.x (direkomendasikan)
curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
sudo apt-get install -y nodejs

# Verifikasi instalasi
node -v  # Seharusnya menampilkan v20.x.x
npm -v
```

### 3.3. Instal MongoDB

Jika Anda ingin menginstal MongoDB secara lokal di VPS Ubuntu.
```bash
sudo apt update
sudo apt install -y mongodb
sudo systemctl start mongodb
sudo systemctl enable mongodb # Agar berjalan otomatis saat boot
# Verifikasi
mongo --eval 'db.runCommand({ connectionStatus: 1 })'
```
Atau, Anda bisa menggunakan layanan cloud seperti MongoDB Atlas dan dapatkan Connection String URI Anda.

### 3.4. Konfigurasi Variabel Lingkungan (.env)

Buat file `.env` di root direktori proyek (`ePulsaku/.env`). Ini adalah langkah paling penting.

```bash
# Salin dari contoh jika ada, atau buat baru
cp .env.example .env 
# atau jika tidak ada .env.example
touch .env
```

Buka file `.env` dan isi dengan konfigurasi berikut.

```dotenv
# Konfigurasi Database MongoDB
# Ganti dengan string koneksi Anda jika menggunakan MongoDB Atlas atau konfigurasi custom
MONGODB_URI="mongodb://localhost:27017"
MONGODB_DB_NAME="ePulsakuDB"

# URL Aplikasi / Auth
# PENTING: gunakan satu host kanonik yang sama untuk app dan auth di produksi.
# Contoh produksi: https://app.domainanda.com
BETTER_AUTH_URL="http://localhost:9002"
NEXT_PUBLIC_APP_URL="http://localhost:9002"
# Dipertahankan untuk kompatibilitas kode lama yang masih membaca base URL publik.
NEXT_PUBLIC_BASE_URL="http://localhost:9002"

# Kunci Keamanan (SANGAT PENTING!)
# Buat kunci-kunci ini dengan perintah 'openssl rand -hex 32' atau 'openssl rand -hex 64'
# ENCRYPTION_KEY harus 32 byte (64 karakter hex)
ENCRYPTION_KEY="<ganti_dengan_kunci_hex_64_karakter_anda>"
# Disarankan diisi khusus untuk Better Auth agar secret sesi tidak bergantung pada fallback.
BETTER_AUTH_SECRET="<ganti_dengan_secret_better_auth_anda>"
# Fallback lama untuk token/sesi jika BETTER_AUTH_SECRET belum diisi.
JWT_SECRET="<ganti_dengan_kunci_random_panjang_anda>"

# Kunci API untuk Google AI (Gemini)
# Diperlukan untuk fitur seperti "Chat AI Gemini"
GEMINI_API_KEY="<ganti_dengan_kunci_API_google_ai_anda>"

# Konfigurasi Dashboard / Zona Waktu
# Gunakan identifier dari IANA Time Zone Database (e.g., Asia/Jakarta, Asia/Makassar, Asia/Jayapura)
TIMEZONE="Asia/Makassar"
# Opsional: set true untuk menampilkan log performa query dashboard di server log.
LOG_DASHBOARD_PERF="false"
# Opsional: ambang batas query dashboard lambat dalam milidetik.
DASHBOARD_SLOW_QUERY_MS="300"
```

**Cara Membuat Kunci Keamanan:**

Jalankan perintah ini di terminal Anda untuk membuat kunci yang aman:

1.  **Untuk ENCRYPTION_KEY (harus 64 karakter hex):**
    ```bash
    openssl rand -hex 32
    ```
    Contoh output: `e8a3a31c5a7e1c2b8d9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8a9b0c1d` (JANGAN GUNAKAN CONTOH INI). Salin output dari terminal Anda ke `.env`.

2.  **Untuk JWT_SECRET (bisa lebih panjang, 64 karakter hex sudah sangat baik):**
    ```bash
    openssl rand -hex 64
    ```
    Contoh output: `a1b2c3...` (JANGAN GUNAKAN CONTOH INI). Salin output ini ke `.env`.
    
3.  **Untuk GEMINI_API_KEY:**
    Dapatkan kunci API Anda dari Google AI Studio (sebelumnya MakerSuite). Kunjungi [https://makersuite.google.com/app/apikey](https://makersuite.google.com/app/apikey).


**PENTING:**
*   Ganti `mongodb://localhost:27017` dengan string koneksi MongoDB Atlas Anda jika menggunakannya.
*   **Sangat penting untuk mengisi `BETTER_AUTH_URL`, `NEXT_PUBLIC_APP_URL`, dan `NEXT_PUBLIC_BASE_URL`** dengan satu URL domain publik yang sama setelah aplikasi di-deploy (misalnya, `https://app.domainanda.com`).
*   **Sangat disarankan mengisi `BETTER_AUTH_SECRET`** secara khusus untuk Better Auth agar secret sesi tidak bergantung pada fallback `JWT_SECRET`.
*   `LOG_DASHBOARD_PERF` dan `DASHBOARD_SLOW_QUERY_MS` bersifat opsional untuk debugging dan tuning performa dashboard.
*   **JANGAN PERNAH** membagikan atau mempublikasikan isi file `.env` Anda, terutama kunci keamanannya.
*   Kredensial untuk Digiflazz, TokoVoucher, dan Telegram akan dikelola melalui halaman Admin Settings di aplikasi web setelah admin pertama login, jadi tidak perlu dimasukkan ke dalam `.env`.

### 3.5. Instal Dependensi Aplikasi

Dari root direktori proyek (`ePulsaku/`):
```bash
npm install
```

### 3.6. Build Aplikasi

Untuk produksi, build aplikasi Next.js:
```bash
npm run build
```

### 3.7. Menjalankan Aplikasi dengan PM2

PM2 adalah process manager yang akan menjaga aplikasi Anda tetap berjalan dan memudahkannya untuk dikelola.

Instal PM2 secara global:
```bash
sudo npm install pm2 -g
```

Skrip `start` di `package.json` sudah dikonfigurasi untuk menjalankan aplikasi di port `9002`.
Mulai aplikasi Anda dengan PM2:
```bash
pm2 start npm --name "ePulsaku-web" -- start
```

Beberapa perintah PM2 yang berguna:
*   `pm2 list`: Melihat daftar semua proses yang dikelola PM2.
*   `pm2 logs ePulsaku-web`: Melihat log aplikasi secara real-time.
*   `pm2 restart ePulsaku-web`: Merestart aplikasi.
*   `pm2 stop ePulsaku-web`: Menghentikan aplikasi.
*   `pm2 delete ePulsaku-web`: Menghapus aplikasi dari PM2.
*   `pm2 startup`: Membuat PM2 berjalan otomatis saat server boot (ikuti instruksi yang muncul).
*   `pm2 save`: Menyimpan konfigurasi proses PM2 saat ini agar dapat dipulihkan setelah reboot.

Aplikasi Anda sekarang seharusnya berjalan di `http://localhost:9002` atau `http://IP_VPS_ANDA:9002`.

## 4. Penting: Keamanan File `.env` di Produksi

File `.env` berisi informasi yang sangat sensitif. Mengelolanya dengan benar sangat penting untuk keamanan aplikasi Anda.

*   **JANGAN PERNAH COMMIT FILE `.env` KE GIT:** Ini adalah aturan paling penting. Pastikan file `.env` ada di dalam file `.gitignore` Anda. Jika tidak, tambahkan baris `.env` ke dalamnya. Membocorkan file ini ke repositori publik sama dengan memberikan kunci aplikasi Anda kepada siapa saja.

*   **GUNAKAN VARIABEL LINGKUNGAN HOSTING:** Untuk lingkungan produksi (live server), praktik terbaik adalah **TIDAK** mengunggah file `.env` sama sekali. Sebaliknya, gunakan fitur *Environment Variables* yang disediakan oleh platform hosting Anda (misalnya, Vercel, Netlify, Firebase App Hosting, DigitalOcean App Platform, dll.). Ini adalah cara paling aman untuk mengelola kunci API dan rahasia lainnya.

*   **JIKA HARUS MENGGUNAKAN FILE DI VPS:** Jika Anda mendeploy di VPS tradisional dan harus menggunakan file, pastikan izin file `.env` sangat ketat. Gunakan perintah `chmod 600 .env` yang berarti hanya pengguna yang memiliki file tersebut yang dapat membaca dan menulisnya. Jangan biarkan file ini dapat dibaca oleh pengguna lain di server.

*   **VARIABEL `NEXT_PUBLIC_`:** Ingat, hanya variabel yang diawali dengan `NEXT_PUBLIC_` yang akan terekspos ke browser sisi klien. Jangan pernah menempatkan kunci API, rahasia, atau data sensitif lainnya dalam variabel dengan awalan ini.

## 5. Konfigurasi Pasca-Instalasi

### 5.1. Pengaturan Web Server (Nginx)

Untuk produksi, sangat disarankan menggunakan Nginx sebagai reverse proxy. Ini berguna untuk menangani koneksi HTTPS (SSL), menyajikan aset statis, dan keamanan tambahan.

Buat file konfigurasi baru di `/etc/nginx/sites-available/epulsaku`:
```bash
sudo nano /etc/nginx/sites-available/epulsaku
```
Isi dengan konfigurasi berikut (ganti `domainanda.com` dengan domain Anda):
```nginx
server {
    listen 80;
    server_name domainanda.com www.domainanda.com;

    location / {
        proxy_pass http://localhost:9002; # Port aplikasi Next.js (sesuai package.json)
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }
}
```
Aktifkan konfigurasi dan restart Nginx:
```bash
sudo ln -s /etc/nginx/sites-available/epulsaku /etc/nginx/sites-enabled/
sudo nginx -t # Test konfigurasi
sudo systemctl restart nginx
```
Untuk **HTTPS dengan Let's Encrypt (sangat direkomendasikan)**, gunakan Certbot:
```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d domainanda.com -d www.domainanda.com
```
Certbot akan otomatis memodifikasi konfigurasi Nginx Anda untuk HTTPS.

### 5.2. Buat Akun Admin Pertama

*   Akses website Anda melalui browser (misalnya, `http://IP_VPS_ANDA:9002` atau `https://domainanda.com`).
*   Karena belum ada pengguna, Anda akan diarahkan ke halaman pendaftaran (`/signup`).
*   Daftarkan akun admin pertama Anda. Akun ini akan menjadi `super_admin` dan memiliki semua hak akses.
*   Setelah akun pertama dibuat, halaman `/signup` akan dinonaktifkan secara otomatis.

### 5.3. Konfigurasi Admin Settings

*   Setelah login dengan akun `super_admin` Anda, navigasikan ke menu Akun > Akun & Pengaturan > Admin Credentials.
*   Masukkan semua kredensial API yang diperlukan untuk Digiflazz (Username, API Key, Webhook Secret, Allowed IPs) dan TokoVoucher (Member Code, Signature, API Key/Secret, Allowed IPs).
*   (Opsional) Masukkan kredensial untuk Notifikasi Telegram (Bot Token dan Chat ID).
*   Simpan pengaturan. Anda akan diminta memasukkan password akun admin Anda untuk konfirmasi. Data sensitif akan dienkripsi di database menggunakan `ENCRYPTION_KEY` Anda.

### 5.4. Konfigurasi Webhook Provider

*   **Digiflazz:**
    *   Login ke dashboard Digiflazz Anda.
    *   Masuk ke menu Atur Koneksi > API > Webhook.
    *   Atur URL Webhook ke: `[NEXT_PUBLIC_BASE_URL_ANDA]/api/webhook/digiflazz` (ganti `[NEXT_PUBLIC_BASE_URL_ANDA]` dengan URL publik aplikasi Anda, misal `https://app.domainanda.com/api/webhook/digiflazz`).
    *   Masukkan **Secret Key Webhook** yang sama dengan yang Anda masukkan di Admin Settings aplikasi Anda.
*   **TokoVoucher:**
    *   Login ke dashboard TokoVoucher Anda.
    *   Cari bagian pengaturan Webhook/Callback.
    *   Atur URL Webhook ke: `[NEXT_PUBLIC_BASE_URL_ANDA]/api/webhook/tokovoucher`.
    *   Pastikan Anda sudah mengisi Member Code dan Key/Secret API TokoVoucher Anda di Admin Settings aplikasi.

### 5.5. Konfigurasi Notifikasi Telegram

Jika Anda ingin menerima notifikasi transaksi melalui Telegram:
1.  **Buat Bot Telegram**: Cari "BotFather" di Telegram, kirim `/newbot`, ikuti instruksi, dan simpan **Bot Token** yang diberikan.
2.  **Dapatkan Chat ID**:
    *   **Pribadi**: Kirim pesan apa saja ke bot baru Anda. Buka browser dan kunjungi `https://api.telegram.org/bot[TOKEN_BOT_ANDA]/getUpdates`. Ganti `[TOKEN_BOT_ANDA]`. Cari `"chat":{"id":xxxxxxxx?, ...}`. Angka `xxxxxxxxx` adalah Chat ID Anda.
    *   **Grup**: Tambahkan bot ke grup, kirim pesan, lalu gunakan URL `getUpdates` di atas. Chat ID grup biasanya dimulai dengan tanda minus (`-`).
3.  **Masukkan di Admin Settings**: Masukkan Bot Token dan Chat ID (bisa beberapa, pisahkan dengan koma) di halaman Admin Credentials dan simpan.

## 6. Struktur Proyek

Berikut adalah gambaran umum tentang bagaimana file dan folder diatur dalam proyek ini.

```
ePulsaku/
├── src/
│   ├── app/                                  # Direktori utama Next.js App Router
│   │   ├── (app)/                            # Grup route untuk halaman yang memerlukan autentikasi
│   │   │   ├── account/                      # Halaman manajemen akun (ganti password, PIN, dll)
│   │   │   ├── admin-settings/
│   │   │   ├── dashboard/
│   │   │   ├── layanan/
│   │   │   ├── management/
│   │   │   ├── order/
│   │   │   ├── price-settings/
│   │   │   ├── profit-report/
│   │   │   ├── receipt/
│   │   │   ├── tokovoucher-price-settings/
│   │   │   ├── tools/
│   │   │   └── layout.tsx                    # Layout utama untuk semua halaman di dalam grup (app)
│   │   ├── (auth)/                           # Grup route untuk halaman autentikasi (login, signup)
│   │   │   ├── login/
│   │   │   ├── signup/
│   │   │   └── layout.tsx                    # Layout sederhana untuk halaman autentikasi
│   │   ├── api/                              # Route API untuk backend
│   │   │   ├── auth/                         # API untuk login, logout, signup
│   │   │   └── webhook/                      # API untuk menerima webhook dari provider
│   │   ├── globals.css                       # File CSS global & definisi tema ShadCN
│   │   └── layout.tsx                        # Root layout untuk seluruh aplikasi
│   ├── ai/                                   # Semua file terkait Genkit AI
│   │   ├── flows/                            # Berisi semua alur (flows) Genkit
│   │   │   ├── tokovoucher/                  # Alur spesifik untuk provider TokoVoucher
│   │   │   └── ... (banyak file flow)        # Setiap file mewakili satu fungsi/aksi AI
│   │   ├── dev.ts                            # File untuk menjalankan Genkit di mode development
│   │   └── genkit.ts                         # Konfigurasi utama Genkit & inisialisasi plugin
│   ├── components/                           # Komponen React yang dapat digunakan kembali
│   │   ├── account/                          # Komponen khusus untuk halaman manajemen akun
│   │   ├── auth/                             # Komponen untuk form login & signup
│   │   ├── core/                             # Komponen inti aplikasi (Header, Proteksi Route, dll)
│   │   ├── dashboard/                        # Komponen untuk halaman dashboard
│   │   ├── order/                            # Komponen untuk shell form order
│   │   ├── products/                         # Komponen kartu produk
│   │   ├── transactions/                     # Komponen untuk menampilkan item transaksi
│   │   └── ui/                               # Komponen UI dari ShadCN (Button, Card, dll)
│   ├── contexts/                             # React Context Providers
│   │   └── AuthContext.tsx                   # Mengelola state autentikasi & data pengguna di seluruh aplikasi
│   ├── data/                                 # !! PENTING: Folder untuk database berbasis file JSON !!
│   │   └── *.json                            # File-file ini berfungsi sebagai database
│   ├── hooks/                                # Custom React hooks
│   │   ├── use-mobile.tsx
│   │   └── use-toast.ts
│   └── lib/                                  # Logika & utilitas pendukung (server-side)
│       ├── admin-settings-utils.ts         # Fungsi untuk enkripsi/dekripsi & manajemen kredensial admin
│       ├── auth-utils.ts                     # Konstanta, tipe, dan utilitas terkait autentikasi
│       ├── client-utils.ts                   # Utilitas yang aman untuk digunakan di sisi klien
│       ├── db-price-settings-utils.ts        # Fungsi untuk mengelola harga custom di database
│       ├── mongodb.ts                        # Abstraksi untuk membaca/menulis ke database file JSON
│       ├── notification-utils.ts             # Logika untuk memformat & mengirim notifikasi Telegram
│       ├── price-settings-utils.ts           # Utilitas harga custom untuk sisi klien (localStorage)
│       ├── transaction-utils.ts              # Fungsi CRUD untuk data transaksi
│       ├── user-utils.ts                     # Fungsi CRUD untuk data pengguna (termasuk hash password/PIN)
│       └── utils.ts                          # Utilitas umum dari ShadCN (seperti `cn` untuk classname)
├── public/                                   # Aset statis (gambar, favicon, dll)
├── .env                                      # !! SANGAT RAHASIA: File untuk variabel lingkungan !!
├── next.config.ts                            # Konfigurasi Next.js
└── package.json                              # Daftar dependensi dan skrip proyek
```

---

Semoga berhasil dengan instalasi ePulsaku!
