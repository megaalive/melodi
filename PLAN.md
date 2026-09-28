# Melodi — Rencana Pengembangan

## Tujuan

Melodi adalah songwriting workbench berbasis browser untuk membantu pengguna mengembangkan melodi yang sudah mereka tentukan sendiri. Tool tidak mengambil alih komposisi: nada acuan, lirik, dan keputusan yang sudah dikunci pengguna tetap menjadi sumber utama. Generator hanya mengisi celah, membuat variasi, dan membantu mengembangkan frase, chorus, bridge, harmoni, serta accompaniment sederhana.

Target awal harus berjalan penuh di GitHub Pages.

## Kontrak proyek

- Runtime: vanilla HTML, CSS, dan JavaScript ES Modules.
- Tidak memakai React, Vue, Svelte, Electron, backend, database server, atau cloud pada baseline.
- Source code menggunakan bahasa Inggris.
- Komentar kode memakai Bahasa Indonesia yang natural dan hanya bila membantu.
- UI bilingual: Indonesia dan English.
- Bahasa default UI: Indonesia.
- Istilah musik yang sudah umum tetap memakai istilah aslinya bila terjemahannya terasa janggal, misalnya Tempo, Key, Chord, Verse, Chorus, Bridge, Piano Roll, MIDI, Loop, Vocal, Bass, Drum, Swing.
- Copy UI singkat, natural, dan tidak terasa seperti hasil generate mesin.
- Nada/lirik buatan user adalah source material.
- Anchor dan locked note tidak boleh diubah generator.
- Canonical song model menjadi source of truth; UI, score renderer, dan player hanya menjadi view dari model yang sama.
- Semua path asset harus aman untuk deployment GitHub Pages pada subpath repository.


## Kontrak akses agent / LLM

Melodi harus nyaman dipakai manusia sekaligus dapat dioperasikan secara stabil oleh browser agent, Computer Use, Codex, atau tool serupa. Jangan membuat automation bergantung pada koordinat layar.

- Semua aksi utama harus punya semantic HTML yang benar: `button`, `input`, `select`, `textarea`, label, dan focus state.
- Semua kontrol penting harus punya nama/label stabil dan state yang dapat dibaca.
- Semua entity penting memakai ID stabil: note, section, lyric syllable, chord, candidate.
- Piano Roll dan score boleh memakai SVG/Canvas untuk visual, tetapi operasi utamanya wajib punya jalur semantic/command yang tidak bergantung drag pixel.
- Jangan membuat fungsi penting hanya tersedia lewat hover, gesture, atau context menu.
- Drag-and-drop wajib punya alternatif edit eksplisit untuk pitch, start, duration, assignment, dan posisi.
- UI dan automation harus memanggil command layer yang sama agar perilakunya identik.
- Expose read-only state dan bounded command API pada halaman untuk automation lokal; jangan expose secret atau capability sensitif.
- Tambahkan stable `data-*` hooks untuk entity/action penting. Hook automation tidak boleh bergantung pada class CSS visual.
- Keyboard flow dan Command Palette dianggap bagian fitur, bukan aksesori.
- State seperti selection, current section, current tick, locked notes, dan candidate aktif harus dapat dibaca tanpa screenshot.
- Accessibility dan agentability dikerjakan bersama: semantic DOM, ARIA yang benar, keyboard navigation, deterministic focus, dan status text.
- Perubahan layout/tema tidak boleh mematahkan selector automation yang sudah menjadi kontrak.

### Command layer minimum

Command layer mulai kecil dan bertambah sesuai release. Bentuk API internal harus setara dengan operasi UI, misalnya:

```text
getSong
getSelection
addNote
updateNote
deleteNote
setLyrics
setAnchor
setLocked
selectRange
play
pause
stop
```

Release berikutnya menambah command seperti `generateGap`, `acceptCandidate`, `setChord`, `createSection`, dan export.

### Agent state

Sediakan snapshot state ringkas yang machine-readable, minimal memuat:

```text
song id/title
tempo/key/time signature
current section
current tick
selection
locked/anchor entities yang relevan
available actions untuk context saat ini
```

Tidak perlu membuat UI bot terpisah. Targetnya adalah UI manusia yang semantic dan predictable, dengan command/state surface yang bisa dipakai agent bila tersedia.

## Struktur awal

```text
/
├── index.html
├── .nojekyll
├── README.md
├── PLAN.md
├── package.json
├── src/
│   ├── app.js
│   ├── core/
│   ├── generation/
│   ├── audio/
│   ├── notation/
│   ├── storage/
│   ├── io/
│   ├── i18n/
│   └── ui/
├── styles/
├── assets/
├── vendor/
└── tests/
```

## R0 — Fondasi dan canonical song model

### Task

- Bootstrap struktur repo.
- Tambahkan lint/test minimal tanpa bundler wajib.
- Siapkan i18n `id` dan `en`, default `id`.
- Tetapkan convention source English + komentar Indonesia.
- Pastikan resource memakai relative path agar aman di GitHub Pages.
- Buat application command layer; UI tidak boleh memodifikasi canonical model lewat jalur ad-hoc.
- Tetapkan stable entity IDs dan stable automation hooks (`data-entity`, `data-action`, dan identifier sejenis).
- Buat read-only agent state snapshot awal.
- Pastikan semua aksi R0 yang punya UI memakai semantic HTML, keyboard access, dan label yang stabil.
- Buat model dasar:
  - `Song`
  - `Note`
  - `Phrase`
  - `Section`
  - `Lyrics`
  - `LyricSyllable`
  - `Chord`
  - `Scale`
  - `Timing`
- Gunakan integer tick dengan PPQ tetap sebagai timing internal.
- Pisahkan raw lyric text dari syllable mapping.
- Satu syllable harus bisa terkait ke satu atau beberapa note.
- Tambahkan state note:
  - `source: user | generated`
  - `anchor`
  - `locked`
- Tambahkan serialize/deserialize project.
- Tulis invariant tests:
  - ID note unik.
  - Durasi note > 0.
  - Tick integer.
  - Anchor tidak berubah oleh operasi generator.
  - Locked note tidak berubah.
  - Serialize → deserialize tidak mengubah data.

### Selesai bila

Model dapat mewakili `C4-E4-A4-G4` plus lirik tanpa ketergantungan ke UI. Operasi dasarnya juga dapat dilakukan lewat command layer tanpa klik koordinat layar.

---

## R1 — Player dasar

### Task

- Buat Web Audio transport.
- Implement:
  - Play
  - Pause
  - Stop
  - Seek
  - Loop
  - Tempo
- Gunakan audio clock dan look-ahead scheduler, bukan `setTimeout` sebagai clock utama.
- Buat guide synth ringan untuk melody.
- Emit playback state:
  - `currentTick`
  - `currentNoteId`
  - `currentSection`
- Buat demo empat nada untuk validasi scheduler.

### Selesai bila

`C4-E4-A4-G4` bisa dimainkan stabil pada beberapa tempo dan loop tidak terasa drift.

---

## R2 — Piano Roll dan lyrics capture

### Task

- Render pitch rows, beat/bar grid, notes, selection, dan playhead.
- Editing:
  - add
  - move
  - resize
  - delete
  - multi-select
  - copy/paste
- Snap awal:
  - 1/4
  - 1/8
  - 1/16
- Tambahkan aksi Anchor dan Lock.
- Buat visual state yang subtle untuk user/generated/anchor/locked.
- Tambahkan quick lyric capture.
- Buat syllable editor:
  - split
  - merge
  - move
  - assign ke note
  - extend melisma
- Tambahkan autosave draft lokal.
- Tambahkan `New Idea` untuk menyimpan ide kasar tanpa harus membuat struktur lagu lengkap.

### Selesai bila

User bisa memasukkan empat anchor, menulis lirik, reload browser, lalu state tetap kembali.

---

## R3 — Not balok dan synchronized playback

### Task

- Gunakan VexFlow sebagai renderer, bukan source of truth.
- Render:
  - treble staff
  - measures
  - rests
  - time signature
  - key signature
  - notes
  - chord symbols
  - lyrics
- Sinkronkan score dengan canonical model.
- Highlight note dan syllable aktif saat playback.
- Tambahkan Follow Mode.
- Tambahkan view:
  - Score
  - Piano Roll
  - Score + Piano Roll
  - Lyrics
- Pastikan perubahan dari Piano Roll langsung tercermin pada score.

### Selesai bila

Satu note yang diedit hanya sekali langsung sinkron di Piano Roll, score, lyrics, dan player.

---

## R4 — Melody Gap Generator

### Task

- Input context:
  - key
  - scale/mode
  - tempo
  - time signature
  - voice range
  - style profile
  - lyric syllable count
- Implement primitive melodic moves:
  - direct
  - scale passing note
  - neighbor note
  - approach note
  - leap
  - leap + resolution
  - repetition
  - sequence
- Enumerasi kandidat untuk gap antar-anchor.
- Scoring:
  - tonal fit
  - interval size
  - leap resolution
  - singability
  - contour
  - rhythm
  - repetition
  - anchor landing
  - lyric fit
  - style fit
- Gunakan deterministic seed.
- Tampilkan hanya 4–8 kandidat terbaik.
- Shortcut:
  - 1..8 audition
  - Enter accept
  - R regenerate
- Flow:
  - Generate
  - Audition
  - Accept
  - Lock
- Metadata kandidat singkat dan objektif, bukan penjelasan AI.

### Selesai bila

Generator bisa memberi variasi yang berbeda namun tetap musikal tanpa pernah menyentuh anchor/locked note.

---

## R5 — Harmony dan sketch accompaniment

### Task

- Infer beberapa kandidat chord dari key + melody.
- Jangan menganggap satu chord sebagai satu-satunya jawaban.
- Tambahkan functional harmony dasar:
  - Tonic
  - Predominant
  - Dominant
- Chord dapat di-lock.
- Harmony player:
  - piano block chord
  - simple arpeggio
- Bass:
  - root
  - root + fifth
- Drum groove awal:
  - Straight
  - Pop
  - Rock
  - Ballad
  - Blues Shuffle
  - Jazz Swing
  - 6/8
  - Waltz
- Drum menjadi musical metronome default.
- Mixer sederhana:
  - Melody
  - Harmony
  - Bass
  - Drum
- Hanya Mute + Volume.
- Playback mode:
  - Melody Only
  - With Harmony
  - Full Sketch

### Selesai bila

Frase dapat dinilai dalam konteks musik tanpa app berubah menjadi DAW penuh.

---

## v0.1 — Usable songwriting prototype

Skenario wajib:

1. Buka Melodi.
2. Masukkan `C4-E4-A4-G4`.
3. Tandai sebagai anchor.
4. Ketik satu baris lirik.
5. Lihat di Piano Roll dan score.
6. Tekan Play.
7. Pilih Key atau Auto.
8. Pilih gap.
9. Generate kandidat.
10. Audition beberapa kandidat.
11. Accept satu kandidat.
12. Lock keputusan yang sudah final.
13. Pilih salah satu chord suggestion.
14. Aktifkan piano, bass, dan drum.
15. Loop frase.
16. Simpan project.
17. Reload.
18. Project kembali dengan state yang sama.
19. Browser agent dapat membaca state lagu dan melakukan minimal add/edit note, set lyrics, Play, serta memilih aksi utama tanpa bergantung koordinat pixel.

Jangan lanjut ke fitur besar berikutnya sebelum alur ini cepat, stabil, dan enak dipakai.

---

## R6 — Phrase, Verse, Chorus, Bridge

### Task

- Extract melodic fingerprint:
  - interval pattern
  - contour
  - range
  - rhythm density
  - repetition
  - landing tones
- Generate:
  - Continue Phrase
  - Answer Phrase
- Implement transform primitives:
  - transpose
  - register shift
  - rhythmic expansion
  - rhythmic compression
  - sequence
  - inversion
  - repetition
  - alternate ending
  - tension adjustment
- Chorus bias:
  - higher register
  - stronger repetition
  - clearer hook
  - stronger landing
- Bridge bias:
  - different contour
  - different start degree
  - lower motif similarity
  - stronger harmonic contrast
- Hindari tombol `Generate Song`; generator harus bekerja pada bagian yang eksplisit dipilih user.

### Selesai bila

Chorus dan bridge terasa masih berasal dari material user, bukan lagu random baru.

---

## R7 — Vocal Profile

### Task

Pisahkan warna suara dari delivery.

Voice properties:
- register
- timbre
- weight
- brightness
- breathiness
- grit

Delivery properties:
- legato
- attack
- vibrato
- slides
- note bending
- dynamics
- timing feel

Preset awal:
- Clean Pop
- Soft Pop
- Rock
- Blues
- Soul
- Jazz
- Ballad
- Folk
- Punk

Tambahkan custom user template.

Pisahkan:
- written melody
- performance layer

Style boleh memengaruhi scoring generator, tetapi tidak boleh mengubah anchor.

Tambahkan section vocal arc, misalnya Verse intimate → Chorus stronger → Bridge restrained.

### Selesai bila

Vocal Profile dapat diganti tanpa mengubah source melody.

---

## R8 — Import/export

### Task

- Format project sendiri: `.melodi.json`.
- Share URL tanpa file:
  - payload berada di URL fragment (`#m=...`) agar tidak dikirim ke server static hosting;
  - envelope versioned dan **track-oriented** sejak v1, bukan format yang hanya memahami vocal melody;
  - track awal: lead/melody + harmony; format harus dapat ditambah guitar, bass, drums, automation, dan instrument lain tanpa memutus link lama;
  - canonical UUID tidak dibawa ke URL; relasi portable memakai index dan ID baru dibuat saat link dibuka;
  - gunakan native gzip `CompressionStream` + Base64URL bila tersedia, dengan fallback plain Base64URL tanpa runtime dependency;
  - unknown future track boleh diabaikan oleh reader lama selama lead track yang dibutuhkan masih dapat dibaca;
  - membuka share link tidak boleh langsung menimpa autosave draft lokal; user memilih eksplisit bila ingin menjadikannya draft;
  - operasi manusia: Bagikan → salin link → penerima membuka link dan project langsung siap dimainkan;
  - expose pembuatan share URL pada browser automation contract.
- MIDI export:
  - melody
  - tempo
  - time signature
  - optional chord/bass tracks
- MIDI import minimal.
- MusicXML export:
  - measures
  - notation
  - tempo
  - lyrics
  - chord symbols
- WAV sketch via offline rendering bila tetap sederhana.

### Selesai bila

Project bisa dipindahkan tanpa kehilangan state, link share lama tetap dapat dibuka setelah model instrument bertambah, dan melody bisa dibawa ke tool musik lain.

---

## R9 — Guitar/WAV input

### Task

- Import WAV dan format lain yang dapat didecode browser.
- Fokus awal hanya monophonic single-note guitar.
- Pitch detection.
- Onset detection.
- Note segmentation.
- Cleanup:
  - minimum duration
  - glitch suppression
  - neighboring pitch merge
  - pitch tolerance
- Quantization:
  - Off
  - Light
  - Strict
- Expressive mode untuk mempertahankan bend/vibrato sebagai performance curve.
- Convert hasil ke canonical note model.
- Hasil bisa diedit, dijadikan anchor, diberi lirik, lalu dipakai generator.

### Selesai bila

Satu take gitar single-note dapat berubah menjadi melody draft yang masih mudah dikoreksi manual.

---

## R10 — Offline/PWA dan polish

### Task

- IndexedDB autosave dengan debounce.
- Session recovery.
- Service worker untuk static assets dan sample penting.
- PWA installable.
- Mobile mode fokus pada:
  - Idea Capture
  - Lyrics
  - Playback
  - Candidate audition
  - basic note editing
- Desktop tetap menjadi workspace utama.
- Keyboard navigation.
- Focus state yang jelas.
- Reduced motion.

---

## Bukan scope awal

Jangan dikerjakan sebelum kebutuhan nyata muncul:

- AI/LLM sebagai core generator.
- Realistic vocal synthesis.
- VST/plugin hosting.
- Full multitrack recorder.
- Full mixer/mastering.
- Collaboration.
- Account/login.
- Cloud sync.
- Backend.
- Polyphonic guitar transcription.
- Framework UI besar.
- Automation yang hanya bekerja dengan pixel-coordinate atau selector CSS visual yang rapuh.

## Prinsip kerja

Setiap release harus vertikal, bisa dimainkan, dan punya acceptance test. Jangan menambah lapisan arsitektur karena \"mungkin nanti perlu\". Mulai dari implementasi paling kecil yang memenuhi kontrak, ukur hasilnya, lalu tambah kompleksitas hanya bila ada kebutuhan nyata.
