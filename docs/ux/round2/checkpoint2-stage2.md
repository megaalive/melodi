# Checkpoint 2 — Stage 2: task flows and canvas

Tanggal: 2 Oktober 2026

Status: implementasi Proposed dan pemeriksaan preview selesai; UAT pemilik di perangkat fisik masih terbuka.

Baseline historis Stage 2 adalah `origin/main` pada `a123a05` (build `20261001.43`). Build UI saat ini `20261002.67`. Perubahan mengikuti usulan Checkpoint 1: roll menjadi tempat utama untuk menangkap ide, aksi yang relevan muncul dekat kanvas, dan kontrol jarang tetap di Project/Lainnya/panel. Skema Song, format Share, command layer, dan jalur audio yang ada tetap dipakai.

## Perubahan yang terlihat oleh pemusik

- Lagu kosong langsung membuka alat Gambar dengan cue sapuan empat titik; titik pertama diaudisi saat disentuh. Satu sapuan menyimpan frasa sebagai nada pengguna.
- Dua nada dapat dipilih bersama dan menjadi batas sementara untuk **Isi celah**. Kandidat hadir di dock dekat/di atas roll; scrub mengaudisi dan memilih kandidat saat dilepas. Kontrol prev/next tetap tersedia. Seed dan tick rinci tidak ditampilkan di jalur utama.
- Bar seleksi satu baris menampilkan Isi celah, pitch ±1, panjang 1/4, Duplikat, dan Hapus. Lainnya menampung pitch oktaf, panjang alternatif, Anchor, Lock, dan Expression.
- Mixer desktop dibuka sebagai popover dari transport; pada ponsel, satu peek membuka sheet bertab Chord/Mixer.
- Chord menyiapkan saran saat sheet dibuka; menerima saran menutup sheet. Drum menyediakan preset Pop yang mengisi groove sesuai meter/range loop. Lirik mendapat aksi pemetaan otomatis. Project menyediakan **Save song** langsung ke Browser.
- Pada ponsel, header Project/Menu, transport, lima tujuan navigasi, kanvas, dan peek Chord/Mixer tetap berada di layar. Di landscape, mode/alat menjadi rail samping. Perbaikan terakhir membuat grid Drum memakai tinggi yang tersisa, sehingga empat baris instrumen tampak pada 844×390.

## Bukti visual dan pemeriksaan

- [Roll kosong, ponsel 390×844](evidence/after/portrait-empty-390x844.png) dan [roll berisi lagu, ponsel 390×844](evidence/after/portrait-roll-390x844.png).
- [Roll berisi lagu, desktop 1280×800](evidence/after/desktop-roll-1280x800.png).
- Preview final diperiksa lagi pada 390×844 dan 1280×800: bar seleksi satu baris muat, Expression terbuka tanpa label peek pecah vertikal atau menu aksi menutupi roll, dan Mixer desktop tampil sebagai popover. Gambar di atas berasal dari pass visual terdahulu, bukan tangkapan layar pass final.
- Aplikasi juga diperiksa di preview pada 844×390 landscape. Grid Drum kini menampilkan Crash, Ride, Open HH, dan Closed HH dalam area kanvas; ekspor screenshot landscape tidak berhasil karena capture browser habis waktu, jadi tidak ada gambar landscape yang diklaim sebagai bukti tersimpan.
- Preview mengonfirmasi struktur responsif pada 390×844, 844×390, dan 1280×800. Ini inspeksi visual/otomasi browser, bukan tes pengguna. Audio benar-benar terdengar, waktu nada pertama, gesture satu tangan fisik, audit kontras AA menyeluruh, dan perjalanan kandidat scrub melewati tiga alternatif **NOT VERIFIED**.
- `npm test -- --test-reporter=dot`: **491 lulus, 0 gagal**. `npm run check` dan `git diff --check` juga lulus pada build saat ini.

## Perjalanan J1–J7

Angka setelah adalah urutan aksi rancangan yang tersedia pada UI; angka itu bukan hasil pengukuran manusia. Waktu dan UAT perangkat belum direkam. Baseline hanya memuat angka yang benar-benar dicatat di checkpoint sebelumnya.

| Tugas | Sebelum | Sesudah pada UI/kode | Waktu dan hasil manusia |
|---|---|---|---|
| J1 — tangkap ide, desktop | 6 gestur di sandbox; bunyi pertama tidak terverifikasi | 2 aksi rancangan: satu sapuan empat titik, lalu Play. Fixture menguji empat titik tersimpan dan satu audition awal. | NOT RECORDED; audio/≤3 detik NOT VERIFIED |
| J1 — tangkap ide, ponsel | NOT RECORDED | Urutan UI yang sama, 2 aksi rancangan | NOT RECORDED; satu tangan/audio NOT VERIFIED |
| J2 — isi celah, desktop dan ponsel | Hitungan tidak direkam | Target 5: satu marquee untuk dua batas, Isi celah, satu scrub melewati ≥3 kandidat, Terima, Kunci | Scrub ≥3 alternatif dan hitungan manusia NOT VERIFIED; waktu NOT RECORDED |
| J3 — ubah nada, desktop | Hitungan tidak direkam | Transpose, ubah panjang, Duplikat, Hapus tersedia langsung; satu aksi per tombol | Interaksi UI diuji; waktu manusia NOT RECORDED |
| J3 — ubah nada, ponsel | Empat aksi masing-masing satu ketukan pada audit sebelumnya | Empat aksi tetap langsung di bar satu baris | Perangkat fisik/satu tangan NOT VERIFIED; waktu NOT RECORDED |
| J4 — beri iringan, desktop dan ponsel | Perjalanan penuh tidak direkam | Target 5 jika Loop sudah aktif: buka Chord, Terima, Drum, Pop groove, Play; satu aksi untuk Loop jika perlu | Saran/preset/playback state dicek terpisah; perjalanan penuh dan audio NOT VERIFIED; waktu NOT RECORDED |
| J5 — lirik, desktop dan ponsel | Perjalanan penuh tidak direkam | Isi satu baris, Auto-map, Play | Pemetaan/timing manusia NOT RECORDED; bunyi NOT VERIFIED |
| J6 — simpan, desktop dan ponsel | Simpan Browser memerlukan 3 klik pada jalur baseline | Project → Save song, 2 aksi; jalur Browser Library dan draft tetap tersedia | Implementasi diuji; reload oleh pemilik dan waktu NOT RECORDED |
| J7 — satu tangan, ponsel | Perangkat sentuh fisik NOT VERIFIED | Target minimal 44px dan alur ringkas ditinjau pada emulasi 390×844 | Perangkat fisik dan seluruh J1–J3 satu tangan NOT VERIFIED |

## Sisa yang perlu ditutup pemilik

Ikuti [owner-uat.md](owner-uat.md) pada perangkat sungguhan. Catat jumlah aksi dan stopwatch untuk desktop 1280×800 serta ponsel 390×844; ulangi J1–J3 dengan satu tangan. Jangan ubah status `NOT VERIFIED` menjadi lulus berdasarkan screenshot, fixture, atau emulasi.
