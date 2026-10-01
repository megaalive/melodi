# Melodi Ronde 2 — Checkpoint 1

**Status:** proposal for owner review; no product source changed. The design gallery is [wireframes/index.html](wireframes/index.html). Its four selectors cover all 120 combinations (five modes × three viewports × four states × two themes). The gallery is static; it is not an implemented or user-tested interface.

**Bukti wireframe:** [desktop kosong](evidence/proposed/desktop-empty.png), [desktop pilihan J3](evidence/proposed/desktop-selected-j3.png), [desktop tema terang](evidence/proposed/desktop-selected-light.png), [ponsel kosong J1](evidence/proposed/mobile-empty-j1.png), [ponsel Drum kosong](evidence/proposed/mobile-drum-empty.png), [ponsel pilihan J3](evidence/proposed/mobile-selected-j3.png), [ponsel kandidat J2](evidence/proposed/mobile-candidate-j2.png), [sheet Chord](evidence/proposed/mobile-chord-panel.png), [landscape Drum kosong](evidence/proposed/landscape-empty-drum.png), dan [landscape kandidat J2](evidence/proposed/landscape-candidate-j2.png). Gambar memperlihatkan galeri statis beserta frame wireframe; semuanya bukti desain, bukan rekaman aplikasi hasil implementasi.

## Pengalaman yang diusulkan

Jadikan Piano Roll rumah untuk menangkap ide. Satu bilah tipis menampung identitas lagu dan Project; transport selalu jelas; lima mode berada pada satu navigasi; kanvas memegang sebagian besar layar; aksi pilihan muncul dekat kanvas. Guitar sejajar dengan Piano Roll, Drum, Score, dan Lirik di desktop; di ponsel Guitar ada dalam Lainnya. Split menjadi pilihan tata letak Score di T2, bukan mode ketujuh. Mixer dibuka dari transport sebagai popover; Chord dan Expression tersedia di sheet kontekstual.

Saat lagu kosong, kanvas langsung siap menangkap ide dan menjelaskan gestur pertama. Usulan J1 adalah satu sapuan empat titik dengan audition langsung pada titik pertama, lalu satu ketukan Putar untuk mendengar frasa. Ini hipotesis interaksi yang harus diprototipekan; jangan dihitung lulus sebelum diuji. Saat dua anchor dipilih, “Isi celah” muncul di T1; bayangan kandidat dan kontrol audition/terima/kunci tampil di atas roll. Project membuka menu simpan dalam dua gestur: Project → Simpan lagu. Angka tick dan seed hanya ada di Lanjutan/Command Palette. Detail Mixer, Chord, ekspresi, snap, zoom, dan presisi seek tidak memenuhi ruang kerja saat idle.

## Keputusan yang diminta

| Keputusan | Opsi A | Opsi B | Rekomendasi |
|---|---|---|---|
| Cara memenuhi J1 ≤4 gestur sambil memasukkan empat nada dan mendengar frasa | Mode gambar langsung aktif; satu tap/klik per nada, tiap nada langsung diaudisi. Total empat gestur, tetapi bukan playback frasa. | Satu sapuan pendek menggambar kontur empat nada; satu Play memutar frasa. | **B.** Memenuhi makna “masukkan empat nada lalu dengar frasanya” dalam dua gestur; perlu prototype/validasi pemetaan sapuan sebelum implementasi. |
| Navigasi mode ponsel | Lima tab tetap, Guitar menggantikan Lainnya. | Roll, Drum, Score, Lirik, Lainnya; Guitar di Lainnya. | **B.** Lima tujuan paling sering tampak tanpa membuat target mode sempit. |
| Split | Tetap sebagai tab terpisah. | Opsi “Tampilkan Score di bawah Roll” pada tata letak Score. | **B.** Menjaga lima tujuan utama dan makna Split tetap eksplisit. |
| Membandingkan kandidat J2 | Ketuk Putar berulang untuk mendengar kandidat satu per satu. | Satu scrub/geser berkelanjutan melewati sedikitnya tiga kandidat mengaudisi tiap kandidat dan memilih kandidat yang sedang tersorot saat dilepas. Tombol Putar/prev/next tetap tersedia. | **B.** Satu sapuan memilih dua batas sebagai anchor sementara, lalu Isi celah, scrub-audition yang memilih kandidat, Terima, Kunci: 5 gestur. Tombol Anchor tetap untuk perlindungan permanen. |
| Menandai batas J2 | Ketuk Anchor pada tiap nada, lalu Isi celah. | Dua nada yang dipilih menjadi anchor sementara untuk tindakan Isi celah; tombol Anchor tetap tersedia untuk perlindungan permanen. | **B.** Memasukkan pemilihan dua batas dalam satu gestur tanpa menghilangkan kontrol Anchor. |
| Saran chord J4 | Harus memilih rentang nada sebelum membuka Chord. | Buka Chord untuk melihat saran dari key dan phrase/loop aktif; tidak perlu seleksi tambahan. | **B.** Menjaga jalur iringan ≤6 gestur dan tetap memberi konteks saran. `Gunakan` menerima saran sekaligus menutup sheet. Jalur: Chord → terima → Drum → groove preset → Loop → Play. |
| Aksi pada nada terpilih di ponsel | Bilah dua baris tetap seperti sekarang. | Satu baris geser; pitch, panjang, duplikat, hapus langsung tersedia, aksi lain setelah geser. | **B.** Menghemat tinggi tanpa menyembunyikan empat aksi J3 di balik panel. |
| Panel ponsel | Panel samping menetap. | Peek ringkas di bawah yang membuka sheet dan selalu dapat ditutup satu ketukan. | **B.** Menjaga kanvas tampak sambil memberi satu tempat untuk Chord/Mixer. |
| Simpan J6 | Project → Simpan ke Browser → Simpan lagu (jalur sekarang). | Project → Simpan lagu; simpan lokal selesai tanpa langkah konfirmasi kedua. | **B.** Memenuhi target dua gestur tanpa mengubah format Song/Share; perlu verifikasi command yang tersedia sebelum implementasi. Jalur Bagikan dan Buka juga tetap di Project, tanpa target hitungan khusus. |

## Anggaran kontrol default

Hitungan ini mencakup kontrol interaktif yang tampak pada bilah atas, transport, mode, alat kanvas, dan pemicu panel. Judul/status baca-saja dan gestur di dalam kanvas tidak dihitung. Menu Project, Menu aplikasi, isi popover, dan sheet tidak terbuka pada keadaan default.

| Desktop 1280×800 | Jumlah |
|---|---:|
| Header: Project, Undo, Redo, Command Palette, Pengaturan | 5 |
| Transport: Play/Pause, Stop, seek, BPM, Loop, Mixer popover | 6 |
| Lima mode utama: Roll, Drum, Score, Lirik, Gitar | 5 |
| Alat kanvas: Pilih, Gambar, Snap, Zoom | 4 |
| Pemicu sheet Chord | 1 |
| **Total** | **21 / maks. 24** |

| Ponsel 390×844 | Jumlah |
|---|---:|
| Header: Project dan Menu (Undo/Redo/Command/Settings) | 2 |
| Transport: Play/Pause, Stop, BPM, Loop | 4 |
| Nav bawah: Roll, Drum, Score, Lirik, Lainnya (Gitar) | 5 |
| Alat kanvas: Pilih dan Gambar | 2 |
| Peek panel Chord/Mixer | 1 |
| **Total** | **14 / maks. 14** |

Pada ponsel tegak, zona chrome tetap atas/bawah yang diusulkan berjumlah 40 + 40 + 44 = 124px (14,7% dari tinggi 844px). Judul/Pilih/Gambar menumpang sebagai overlay 44px di batas kanvas; cue langkah pertama adalah badge ringkas di dalam grid, bukan baris chrome. Peek sheet setinggi 44px juga overlay, sehingga tidak menambah tinggi baris chrome. Grid dasar membentang y=80–800 (720px); area yang tidak tertutup toolbar dan peek adalah 632px saat kosong (74,9% viewport), 540px saat strip kandidat 92px tampil (64,0%), dan 588px saat baris seleksi 44px tampil (69,7%). Pada landscape 844×390, rail mode mengambil 58px di kiri dan header/transport memakai 68px di atas agar seluruh target sentuh 44px muat. Grid dasar y=68–390 (322px); area tak tertutup peek saat kosong 278px (71,3%), strip kandidat 88px 234px (60%), dan baris seleksi 44px 278px (71,3%). Peek landscape mulai di kanan rail agar tidak menutupi tombol Select/Draw. Hitungan ini mengikuti canvas pada galeri dan masih berupa geometri wireframe; scroll/tugas nyata harus dibuktikan saat implementasi.

## Pemeriksaan lima detik

Galeri mencantumkan tebakan aksi pertama untuk masing-masing 20 pasangan mode/keadaan dan tiga ukuran. Ini adalah inspeksi statis 5 detik, bukan tes pengguna. Status `jelas` hanya berarti sasaran dapat dikenali di wireframe, bukan membuktikan orang baru akan menemukannya. Alur kosong yang diusulkan: Roll—sapuan empat titik; Drum—pilih groove atau gambar hit; Score—ketuk `Mulai di Roll` untuk mulai memasukkan nada; Lirik—fokus pada bidang teks; Guitar—Buka Roll. Seleksi menunjukkan `Isi gap` untuk dua batas serta kontrol edit satu nada; kandidat menonjolkan `Bandingkan 3`; panel terbuka memberi judul dan `Tutup` yang terlihat. Lihat matriks cek di bagian bawah dokumen.

Status nada memakai label U (pengguna), G (generator), A (anchor), teks terkunci, serta outline/handle pilihan—bukan warna saja. Ember dipakai untuk anchor, locked, playhead, dan fokus. Galeri memeriksa pasangan teks dan status tertentu pada tema gelap/terang; audit AA seluruh komponen, termasuk fokus, ikon, dan kontrol non-teks, masih diperlukan sebelum implementasi.

## Cek hierarki lima detik

Prediksi berikut mencatat titik masuk per ukuran untuk setiap pasangan mode/keadaan. `Jelas pada wireframe` menilai affordance visual statis, bukan hasil tes dengan pengguna. Jika pemilik melihat sasaran lain atau tidak menemukan aksi pertama, itu adalah revisi desain sebelum Checkpoint 2.

| Mode/keadaan | Desktop 1280×800 | Ponsel 390×844 | Landscape 844×390 |
|---|---|---|---|
| Roll · kosong | Seret satu frasa pada grid; Play tetap tampak di transport. | Sapukan satu frasa di grid; Play ada di bilah atas. | Sapukan pada grid lebar; Play ada di transport atas. |
| Roll · pilihan | Tekan Isi celah untuk dua batas terpilih; edit nada ada di bar. | Ketuk Isi celah di bilah satu baris; aksi J3 terlihat. | Ketuk Isi celah pada bar yang menempel kanvas. |
| Roll · kandidat | Seret scrub kandidat melewati ≥3 pilihan; lepas pada kandidat yang dipilih. | Geser strip kandidat untuk mendengar ≥3 dan memilih; target sentuh utama 44px. | Seret scrub kandidat melewati ≥3 pilihan pada strip di atas grid. |
| Roll · panel | Tutup panel Chord di sisi kanan; Mixer dari transport. | Tutup peek/sheet dengan satu tombol Tutup. | Tutup panel ringkas tanpa menggeser grid vertikal. |
| Drum · kosong | Tekan preset groove atau Gambar hit pada grid. | Ketuk preset groove yang tampak; Play ada di bar atas. | Ketuk groove atau gambar hit pada grid empat baris. |
| Drum · pilihan | Gunakan Velocity, Duplikat, atau Hapus di bar hit. | Ketuk Duplikat/Hapus pada bar T1 satu baris. | Ketuk aksi hit langsung di samping grid. |
| Drum · kandidat | Scrub untuk mendengar/memilih ≥3 groove; lalu Terima. | Geser strip kandidat untuk audition/memilih; lalu Terima. | Scrub kandidat dari strip di atas pola. |
| Drum · panel | Tutup panel groove tanpa seleksi hit palsu. | Ketuk Tutup pada sheet pola. | Ketuk Tutup dari panel overlay; pola tetap tampak. |
| Score · kosong | Klik `Mulai di Roll` pada staf untuk mulai memasukkan nada. | Ketuk `Mulai di Roll` pada area staf. | Ketuk `Mulai di Roll` pada staf; mode tetap pada rail samping. |
| Score · pilihan | Klik aksi pitch/panjang pada not terpilih. | Ketuk edit not yang terlihat dekat staf. | Ketuk aksi not pada bar T1 dekat kanvas. |
| Score · kandidat | Scrub melewati ≥3 kandidat; staf menunjukkan not bayangan. | Geser strip kandidat untuk audition/memilih kandidat. | Scrub ≥3 kandidat tanpa meninggalkan partitur. |
| Score · panel | Tutup panel layout/ekspresi di sisi kanan. | Ketuk Tutup; opsi Roll + Score tetap di sheet. | Tutup overlay layout; rail mode tetap tampak. |
| Lirik · kosong | Klik bidang teks ber-outline dan mulai mengetik. | Ketuk bidang teks ber-outline lalu ketik satu baris. | Ketuk area teks lebar dan mulai mengetik. |
| Lirik · pilihan | Petakan atau lepas suku kata terpilih. | Ketuk Petakan/Lepas di bar T1. | Ketuk aksi mapping di samping baris lirik. |
| Lirik · kandidat | Scrub untuk audition/memilih; lirik tak berubah. | Geser strip kandidat; teks tetap terlihat. | Audisi kandidat di strip tanpa menutup lirik. |
| Lirik · panel | Tutup panel pemetaan di sisi kanan. | Ketuk Tutup pada sheet pemetaan. | Ketuk Tutup overlay; baris teks tetap tampak. |
| Gitar · kosong | Klik Pilih nada di Roll untuk membuat pitch. | Ketuk Pilih nada di Roll dari affordance di neck. | Gunakan Roll dari rail, lalu pilih nada di grid. |
| Gitar · pilihan | Buka Roll/ubah sumber; fret menunjukkan note terpilih. | Ketuk Roll dari Lainnya untuk memilih nada. | Ketuk Roll di rail samping. |
| Gitar · kandidat | Scrub kandidat di strip atas roll; fret ikut preview. | Geser strip kandidat di atas roll. | Bandingkan dari strip atas roll. |
| Gitar · panel | Tutup panel tuning/capo. | Ketuk Tutup pada sheet tuning/capo. | Tutup panel overlay tuning/capo. |

Semua 20 kombinasi mode/keadaan ditargetkan memiliki sasaran pertama yang tampak di desktop, ponsel, dan landscape. Status wireframe saat ini: **prediksi desain; belum diuji pada orang baru**.

## Bukti lokal sebelum perubahan

Aplikasi build42 dibaca pada draft pengguna tanpa mengubahnya. Interaksi dilakukan pada server statis lokal di port terpisah agar penyimpanan draft tetap terisolasi. Lihat [keadaan kosong desktop](evidence/before/empty-desktop-1280x800.jpg), [ponsel tegak](evidence/before/empty-mobile-390x844.jpg), [landscape](evidence/before/empty-landscape-844x390.jpg), dan [workspace berisi nada](evidence/before/desktop-1280x800.jpg). Catatan kontrol/tugas ada di [control-inventory.md](control-inventory.md) dan [measurements.md](measurements.md).

Belum ada metrik waktu manusia dari Ronde 1. Di sandbox, J1 desktop memerlukan enam gestur untuk jalur sekarang (Pilih Gambar, empat input nada, Play); Playback berubah menjadi Playing, tetapi keluaran audio dan waktu first-sound tidak dapat diverifikasi melalui browser ini. J3 diuji pada viewport 390px: transpose, panjang, duplikat, dan hapus masing-masing satu ketukan; bilah lama tetap dua baris/106px. Simpan ke Browser memerlukan tiga klik, dan reload menampilkan Draft lokal dipulihkan. Seluruh waktu tugas tetap **NOT RECORDED**; otomatisasi browser tidak mewakili waktu manusia. Uji sentuh fisik **NOT VERIFIED**.

## Batas checkpoint

Ini adalah spek visual dan keputusan, tanpa perubahan aplikasi atau kontrak data. Jika disetujui, Checkpoint 2 dimulai bertahap per perubahan besar, lewat command layer yang sama dan tanpa mengubah skema Song, Share, atau audio engine. Setelah implementasi, Checkpoint 3 merekam ulang J1–J7 sebelum/sesudah dan menyiapkan `owner-uat.md` untuk perangkat sungguhan.
