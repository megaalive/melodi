# Inventaris kontrol — Ronde 2

Penempatan: **T0** selalu terlihat; **T1** saat pilihan/konteks; **T2** panel/sheet; **T3** Command Palette/Lanjutan; **T4** hapus dari UI. Frekuensi merupakan perkiraan dari tugas produk, bukan analytics.

| Kontrol | Tugas pemusik | Frekuensi | Usulan |
|---|---|---:|---|
| Nama lagu, key, meter | Mengenali konteks kerja | sering | Nama ringkas T0; key/meter sebagai status T0 |
| Project | Berpindah/menyimpan proyek | sering | T0; subaksi simpan/buka/bagikan di menu T2; Project → Simpan lagu ditargetkan dua gestur |
| Lagu Baru | Mulai menangkap ide | sering | T2 dalam Project; empty state tetap bisa langsung dipakai |
| Contoh frasa | Mendapat titik awal | sesekali | T2, tampil hanya jika diminta |
| Buka dari Browser, Buka file | Memulihkan/membuka karya | sesekali | T2 |
| Simpan lagu ke Browser | Menyimpan karya | sering | T2 dalam menu Project; simpan file/ekspor T2; jalur lama tiga klik dan usulan dua gestur dicatat di measurements.md |
| Bagikan | Mengirim/membawa karya | sesekali | T2, tidak bersaing dengan Play |
| Undo, Redo | Membatalkan/mengulang edit | sering | T0 desktop; T3/menu ringkas di ponsel |
| Command Palette | Menemukan aksi atau mengirim perintah | sesekali | Pemicu T0 desktop; tersedia di Menu pada ponsel; aksi jarang/presisi T3 |
| Pengaturan bahasa/tema | Mengubah preferensi | jarang | T2; lewat Menu pada ponsel |
| Play/Pause | Mendengar ide | sangat sering | T0, satu slot visual dominan |
| Stop | Menghentikan/mereset playback | sering | T0 |
| BPM | Mengubah feel | sesekali | T0 ringkas |
| Loop on/off | Mengulang bagian | sering saat evaluasi | T0 |
| Range/seek numerik, tick start/end | Navigasi presisi/otomasi | jarang | T3; jalur utama tanpa kolom angka |
| Drag range loop, reset range | Mengulang frasa | sesekali | Drag di ruler; reset T1 saat range aktif |
| Ikuti playback | Menjaga playhead terlihat | sesekali | T2; posisi aktif bisa ditampilkan sebagai status |
| Piano Roll | Menulis/mengedit melodi | sering | T0/home |
| Drum Roll | Membuat pola drum | sesekali | T0 saat mode Drum aktif |
| Score | Membaca/mengedit notasi | sesekali | T0 saat mode Score aktif |
| Lirik | Menulis dan memetakan lirik | sesekali | T0 saat mode Lirik aktif |
| Gitar | Melihat posisi nada di fretboard | sesekali | T0 desktop; T2 di Lainnya pada ponsel |
| Split | Melihat Roll dan Score bersama | sesekali | T4 sebagai mode; fungsi menjadi tata letak Score T2 |
| Mixer | Menyeimbangkan bagian/kanal | sesekali | Pemicu T0 di transport desktop; isi popover/sheet T2 |
| Chord | Mendapat/mengubah harmoni | sesekali | T2 sheet; saran dari key dan phrase/loop aktif tampak saat dibuka tanpa perlu seleksi nada; edit kontekstual T1 |
| Gap Melody / Isi celah | Mencari alternatif di antara anchor | inti namun sesekali | Pemicu T1 setelah dua anchor; kandidat langsung di atas roll T1 |
| Pilih/Gambar Piano Roll | Memilih atau menambah nada | sangat sering | T0 dekat kanvas; Draw langsung aktif pada lagu kosong |
| Snap, Zoom | Mengatur presisi dan framing | sesekali | T2 di ponsel, T0 ringkas desktop |
| Lipat Piano Roll | Membebaskan ruang vertikal | jarang | T4 bila tidak terbukti melayani tugas inti |
| Select/Draw Drum | Memilih atau menggambar hit | sesekali | T0 saat mode Drum aktif |
| Groove/preset drum | Memulai iringan ritmis | sesekali | Satu preset mulai tampak T0 pada Drum kosong untuk J4; koleksi preset lain T2 |
| Pilih hit drum | Memilih kick/snare/hat | sesekali | Di grid T0 mode Drum |
| Velocity, pan, volume, mute, solo | Membentuk dan menyeimbangkan hit/kanal | jarang–sesekali | T1 untuk hit; Mixer/Expression T2 |
| Transpose semitone/oktaf | Mengubah pitch pilihan | sering | T1, satu ketukan per aksi |
| Ubah durasi | Mengubah panjang pilihan | sering | T1, satu ketukan |
| Anchor | Melindungi batas ide dari generator | sesekali | T1; penanda A tampak pada nada |
| Lock | Menjaga hasil yang diterima | sesekali | T1; bentuk/teks terkunci selain warna |
| Duplikat | Mengulang/mengembangkan nada | sering | T1 |
| Hapus pilihan | Menghilangkan nada/hit | sering | T1; tetap tersedia di luar context menu |
| Copy/Paste | Memindahkan materi | sesekali | T1 saat pilihan; shortcut tetap didukung |
| Clear selection | Melepas fokus seleksi | sesekali | Escape/klik kosong; tombol terpisah T4 jika redundan |
| Expression mode: bend/volume/pan/vibrato | Membentuk artikulasi/dinamika | jarang | T2; ringkasan/entry T1 saat pilihan |
| Edit/reset kurva ekspresi | Mengubah artikulasi detail | jarang | T2 |
| Generate, Regenerate, Clear candidates | Mencari/mengganti variasi | sesekali | Generate T1; regenerasi/clear T2 atau T3 |
| Audition per candidate, candidate 1–8 | Membandingkan ide | sesekali | Strip di atas roll T1; satu scrub berkelanjutan melewati ≥3 kandidat sekaligus mengaudisi dan memilih yang tersorot saat dilepas; Putar/prev/next dan tombol 1–8 tetap tersedia |
| Accept candidate | Menyimpan pilihan generator | sesekali | T1 di samping kandidat |
| Generated source/mark | Mengenali asal nada | sesekali | Status terlihat pada nada, bukan tombol utama |
| Tick, seed, style, voice range, syllable count | Eksperimen presisi/otomasi | jarang | T3 Advanced; tetap tersedia bagi agent |
| Select numeric range, Add Note command | Menjalankan operasi presisi/otomasi | jarang | T3; `window.melodi.commands` dan availableActions dipertahankan |
| Textarea lirik | Menulis baris | sesekali | T0 di mode Lirik |
| Syllable chip / map / unmap | Memetakan lirik ke nada | sesekali | T1 saat chip atau nada dipilih; auto-map jelas dapat dibatalkan |
| Layout/ukuran Score | Membaca partitur sesuai kebutuhan | sesekali | T2; Split menjadi salah satu tata letak |
| Edit keyboard Score | Mengubah pitch/durasi dari notasi | sesekali | T1 saat note terpilih |
| Tuning/Capo di Guitar | Membaca posisi gitar | jarang | T2 |
| Help/tooltips | Belajar kontrol | jarang | T2 kontekstual; instruksi pertama selalu tampak di empty state |
| Context menu note/chord | Aksi sekunder | sesekali | Fallback aksesibilitas tetap; hapus item duplikat yang sudah tersedia T1 (T4) |
| Status playback/current note/bar/chord | Memahami posisi lagu | sering dilihat | Status ringkas T0; detail sekunder T2 |

Semua aksi tetap melewati command layer yang sama. Hook `data-action`, `data-entity`, `data-focus-key`, `window.melodi.commands`, dan `availableActions` adalah kontrak automation, bukan kewajiban mempertahankan susunan DOM lama.
