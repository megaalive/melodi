# Checkpoint 2 — Stage 1: UX shell

Tanggal pemeriksaan: 1 Oktober 2026. Implementasi ini mengubah susunan dan respons UI; kontrak lagu, command, generator, audio, serta format simpan/bagikan tidak diubah.

## Baseline dan perubahan

- Baseline: `origin/main` pada `b1744eaf09d6981033f8d6ca90d5107479578414`, build `20261001.42`.
- Build pengembangan sesudah perubahan: `20261001.43` (meta build dan seluruh query cache modul diselaraskan).
- Header studio di desktop tetap menampilkan Project, riwayat, Command Palette, dan Pengaturan. Pada ponsel portrait, Project berada di samping mode; pada landscape Project berada di transport. Riwayat, Command Palette, dan Pengaturan masuk ke Lainnya pada layout ringkas.
- Mode Guitar tersedia di nav desktop, di Lainnya pada ponsel. Pemicu Chord berada di samping mode pada desktop dan ponsel portrait; di rail landscape, pemicunya masuk Lainnya. Mixer berada di transport desktop dan Lainnya pada layout ringkas. Gap Melody tetap ada di Lainnya.
- Garis besar lagu bergabung dengan transport. Pada ponsel, setiap sel seek memiliki sasaran minimum 44px dan sel dapat digulir; pada lebar ≤380px label BPM, Loop, dan Range/Seek disembunyikan secara visual, tetapi tetap tersedia untuk teknologi bantu.
- Score Split tetap memanggil mode `combined` yang ada. Pemeriksaan memastikan Song, seleksi note, serta daftar `availableActions` tidak berubah.
- Pemicu panel memindahkan fokus ke tombol tutup panel di desktop maupun layout ringkas. Saat Guitar aktif dalam menu tertutup, ringkasan Lainnya menampilkan Guitar dan label aksesibel menyebut mode aktif.

## Audit T1–T12

Status di bawah membandingkan temuan Ronde 2 dengan implementasi yang ada pada baseline. `STALE` berarti masalah tidak tampak lagi pada audit sebelumnya; `FALSE` berarti klaim awal tidak terbukti; `PARTIAL` berarti perubahan Stage 1 hanya menangani sebagian masalah.

| Temuan | Status | Catatan Stage 1 |
|---|---|---|
| T1 — kontrol mode ganda | STALE | Guitar dipindah ke Lainnya pada layout ringkas; Split berada di kontrol tata letak Score. Select lama tetap tersembunyi sebagai hook kompatibilitas. |
| T2 — chrome atas padat/terpisah | PARTIAL | Menu aplikasi dikelompokkan dan overview masuk ke transport; identitas lagu, transport, mode, dan kanvas masih zona terpisah. |
| T3 — header Piano Roll padat | STALE | Kontrol Chord, Mixer, dan kandidat generator sudah dipindahkan dari header Roll pada tahap terdahulu. Stage 1 merapikan chrome di sekitarnya. |
| T4 — edit note jauh dari seleksi | STALE | Bilah aksi seleksi kontekstual sudah ada; tidak diubah di tahap ini. |
| T5 — friksi transport | PARTIAL | Overview masuk ke transport dan detail playback disederhanakan pada layout ringkas; kontrol range numerik tetap tersedia di Lanjutan. |
| T6 — Select/Draw sulit ditemukan | PARTIAL | Tidak ada perubahan perilaku pada Stage 1; panduan gestur pertama belum diuji ulang. |
| T7 — Generate bukan aksi utama | PARTIAL | Pemicu Gap Melody dikelompokkan di Lainnya; kandidat langsung di kanvas dan audition tetap pekerjaan tahap berikutnya. |
| T8 — terlalu banyak disclosure | PARTIAL | Project, riwayat, palette, dan Pengaturan dikelompokkan untuk layout ringkas; pengaturan masih disclosure bersarang. |
| T9 — tinggi chrome ponsel | PARTIAL | Geometri CSS ringkas: header 36px + dock transport/nav 88px = 124px atau 14,7% dari 844px. Belum diukur pada viewport runtime 390×844. |
| T10 — kontrol hit Drum | STALE | Perbaikan kontrol hit dan ukuran target sudah ada sebelumnya; tidak disentuh tahap ini. |
| T11 — Score read-only | FALSE | Audit sebelumnya membuktikan Score dapat diedit; Split hanya menambahkan akses tata letak. |
| T12 — Lyrics hanya teks | STALE | Chip dan pemetaan lirik sudah tersedia sebelum Stage 1; tidak disentuh tahap ini. |

## Verifikasi

- `npm test -- --test-reporter=tap`: **480 lulus, 0 gagal**.
- `npm run check`: **lulus**.
- `git diff --check`: **lulus**.
- `tests/studio-interaction.test.js`: fokus panel desktop/ponsel, penanda Guitar, posisi pemicu desktop/portrait/landscape, dan invariansi Split diuji.
- Preview browser desktop lokal diperiksa pada **1270×720**. Mixer tampil netral di transport, Chord sejajar dengan nav, Lainnya hanya berisi Gap Melody di desktop, dan fokus keyboard berpindah ke tombol tutup panel Mixer.
- Screenshot setelah perubahan tidak tersimpan sebagai file; capture CUA hanya tersedia saat sesi preview. Bukti visual sebelum perubahan ada di `evidence/before/`. Karena ukuran desktop tidak cocok persis, tidak ada klaim perbandingan piksel 1280×800.
- Runtime **390×844** portrait dan **844×390** landscape belum diverifikasi. Ukuran 44px dan rasio chrome di atas adalah pembacaan CSS, bukan hasil pengukuran browser/perangkat. J1–J7, gestur satu tangan, audio pertama, dan hasil pendengaran belum diuji ulang.
- Codebase Memory MCP gagal dihubungi (`Transport closed`) pada status, indexing, dan pencarian graph; audit dilanjutkan dengan diff/source dan pengujian lokal.

## Jejak perjalanan J1–J7

| Tugas | Sebelum | Sesudah Stage 1 |
|---|---|---|
| J1 — tangkap ide | 6 gestur sandbox kosong pada konfigurasi desktop baseline; audio pertama belum diverifikasi. | Input nada tidak berubah. Tidak diukur ulang; perubahan chrome desktop hanya diuji pada 1270×720. |
| J2 — kembangkan ide | Alur anchor → Gap Melody → Generate → audition → accept → lock pernah dilaporkan; hitungan gestur tidak direkam. | Pemicu Gap Melody ada di Lainnya; alur kandidat tidak berubah. Tidak diukur ulang; kandidat langsung di kanvas tetap Stage 2. |
| J3 — ubah nada | Empat aksi bilah seleksi ponsel pernah diuji satu ketukan per aksi; bilah lama setinggi 106px. | Bilah seleksi tidak berubah. Geometri 390×844 dan satu tangan tidak diverifikasi ulang. |
| J4 — beri iringan | Saran Chord dan Loop diuji terpisah; perjalanan penuh tidak direkam. | Pemicu Chord terlihat dekat mode pada portrait dan ada di Lainnya pada landscape. Saran dan perjalanan penuh tidak diuji ulang. |
| J5 — lirik | Textarea/chip/mapping pernah diuji terpisah; alur penuh tidak direkam. | Tidak ada perubahan perilaku; tidak diukur ulang. |
| J6 — simpan/buka | Simpan ke Browser memerlukan 3 klik pada jalur baseline; draft pulih setelah reload. | Project tetap T0: di samping mode pada portrait, di transport pada landscape. Jalur simpan/buka tidak dijalankan ulang. |
| J7 — satu tangan | Browser emulasi diperiksa; perangkat sentuh fisik dan waktu tidak diverifikasi. | Belum diuji ulang pada perangkat sentuh. |

## Sisa pekerjaan

Stage 1 siap untuk review kode dan desktop. Sebelum menyatakan Checkpoint 2 selesai, ukur viewport portrait/landscape yang ditentukan dan jalankan UAT J1–J7. Stage 2 masih mencakup alur pemilihan/generasi kandidat, perilaku loop, serta Drum; Stage 3 mencakup polish visual.
