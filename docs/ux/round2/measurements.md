# Baseline tugas — sebelum implementasi Ronde 2

Build yang diamati: main/build42, 1 Oktober 2026. Draft yang terbuka di origin `127.0.0.1:55889` hanya dibaca. Uji input dilakukan di salinan statis pada port `55890`, origin/localStorage berbeda.

| Tugas | Desktop 1280×800 sebelum | Ponsel 390×844 sebelum | Waktu / batas verifikasi |
|---|---|---|---|
| J1 Tangkap ide | **6 gestur** di sandbox kosong: pilih Gambar, 4 klik nada, Play. | Screenshot dan layout diperiksa; rangkaian tugas belum diukur. | Waktu **NOT RECORDED**. Status Playing terlihat sesudah Play; bunyi audio pertama **NOT VERIFIED**. |
| J2 Kembangkan ide | Jalur lama anchors → panel Gap Melody → Generate → audition → accept → lock pernah dilaporkan PR #35; hitungan tidak dicatat. | Percobaan Ronde 1 parsial; hitungan tidak dicatat. | **NOT RECORDED** |
| J3 Ubah nada | Kontrol terpilih tersedia; hitungan historis tidak direkam. | Pada viewport browser 390px, transpose +1 semitone, durasi 1/4, duplicate, delete masing-masing bekerja dengan **1 ketukan**. | Waktu **NOT RECORDED**; emulasi viewport memakai mouse, bukan satu tangan fisik. Bilah lama dua baris, tinggi 106px. |
| J4 Beri iringan | Chord suggestion/Apply dan loop diuji terpisah di Ronde 1, bukan perjalanan penuh; hitungan tidak dicatat. | Perjalanan penuh tidak direkam. | **NOT RECORDED** |
| J5 Lirik | Textarea/chip/mapping pernah diuji terpisah; perjalanan satu baris penuh tidak direkam. | Perjalanan penuh tidak direkam. | **NOT RECORDED** |
| J6 Simpan/buka lagi | Save-to-browser pada sandbox memerlukan **3 klik** (Project → Simpan ke Browser → Simpan lagu). Reload menampilkan Draft lokal dipulihkan; empat nada tetap terlihat. | Tidak diukur terpisah. | Waktu **NOT RECORDED**. Share tidak diuji. |
| J7 Satu tangan mobile | Tidak berlaku. | Browser emulasi diperiksa saja; interaksi satu tangan/perangkat sentuh **NOT VERIFIED**. | **NOT RECORDED** |

Ronde 1 tidak menyimpan stopwatch/gestur lengkap J1–J7. Hitungan sandbox di atas adalah hitungan input untuk jalur tertentu, bukan tes partisipan. Waktu Playwright/CUA tidak dipakai sebagai waktu manusia karena memasukkan latensi otomasi dan tidak menangkap pencarian kontrol atau respons audio. Uji keluaran suara memerlukan telinga/perangkat pemilik. Hasil sesudah desain akan dicatat pada konfigurasi viewport yang sama dengan fixture awal yang sama.

## Target desain untuk Checkpoint 2 (belum diukur)

Ini hitungan langkah dari wireframe, bukan hasil sesudah implementasi. Setiap baris tetap **NOT VERIFIED** sampai alurnya berjalan di aplikasi pada desktop 1280×800 dan ponsel 390×844; J7 juga butuh perangkat sentuh sungguhan.

| Tugas | Jalur usulan dan gestur target | Status |
|---|---|---|
| J1 Tangkap ide | 2: satu sapuan empat titik dengan bunyi/audition pada titik pertama; satu ketukan Putar untuk mendengar frasa. Bunyi pertama target ≤3 detik. | Hipotesis input; prototype, audio, gestur, dan waktu **NOT VERIFIED**. |
| J2 Kembangkan ide | 5: sapu rentang untuk memilih dua batas (dipakai sebagai anchor sementara) → Isi celah → satu scrub melewati ≥3 kandidat (audition + memilih kandidat tersorot saat dilepas) → Terima → Kunci. Tombol Anchor tetap melindungi batas secara permanen saat dibutuhkan. | Kandidat langsung di atas roll; scrub, pilihan yang dilepas, hitungan, audition, dan waktu **NOT VERIFIED**. |
| J3 Ubah nada | 1 per aksi: naik/turun, panjang, duplikat, hapus melalui bilah T1 satu baris. | Geometri touch target dan satu tangan **NOT VERIFIED**. |
| J4 Beri iringan | 6: buka Chord → terima saran dari key dan phrase/loop aktif (tanpa memilih nada; `Gunakan` menutup sheet otomatis) → Drum → pilih preset groove yang terlihat → aktifkan Loop → Play. | Saran harus tersedia tanpa seleksi nada dan satu preset terlihat saat Drum kosong; penutupan otomatis dan perjalanan penuh **NOT VERIFIED**. |
| J5 Lirik | 4: Lirik → ketik satu baris → Petakan otomatis → Play. | Perjalanan penuh dan hasil mapping **NOT VERIFIED**. |
| J6 Simpan/buka lagi | Simpan: 2, Project → Simpan lagu; reload memulihkan draft. Share: Project → Bagikan. Buka: Project → pilih draft tersimpan; keduanya tersedia tetapi tak memiliki batas gestur khusus pada brief. | Jalur target belum ada di wireframe interaktif dan **NOT VERIFIED**; Share/open belum diuji. |
| J7 Satu tangan ponsel | Jalankan J1–J3 tanpa mencari kontrol; target interaksi satu tangan. | **NOT VERIFIED** pada perangkat sentuh fisik. |
