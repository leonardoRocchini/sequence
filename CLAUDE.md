# sequence

Repo di skill per Claude Code che servono a catturare un componente UI in isolamento (screenshot, sequenze di frame, video) per mostrarlo: portfolio, social, documentazione.

## Pipeline

1. `/sequence-isolate <componente>`: crea una pagina dev-only usa e getta che monta il componente da solo, in un frame di misura fissa, con scene di fixture, picker, pannello (tema, frame, sfondo, scale, velocità, puntatore) e modalità pulita (`H`). `done` la cancella. Non tocca mai il codice di produzione: ogni file creato va in `.git/info/exclude`.
2. `/sequence-script <componente>`: intervista l'utente e scrive lo `script.md` della cattura.
3. `/sequence-take <componente>`: esegue lo `script.md` nel browser (Playwright) e salva i file ritagliati sul frame in `artifacts/captures/<componente>/`. `/sequence-take-deterministic` fa lo stesso, ma rende ogni fotogramma a tempo virtuale: i video sono a 60 fps veri a qualunque risoluzione, al prezzo di una ripresa più lenta del video. Usa il begin-frame control di Chromium, che su macOS non esiste: lì c'è `/sequence-take-clock`, che ferma gli orologi della pagina in JavaScript e posiziona le animazioni a ogni fotogramma.

## Struttura

- `skills/<nome>/SKILL.md`: la skill. `sequence-isolate` ha anche `STAGE.md`, `PICKER.md`, `CONTROLS.md`, i template da copiare (`templates/`: stage.css, clock.ts per lo speed clock, pointer.ts) e `scripts/check.mjs` per la verifica di Phase 5. `sequence-take` ha `scripts/recorder.mjs`, il registratore video (screencast CDP headless a 60 fps, ritaglio e codifica in un passaggio ffmpeg). `sequence-take-deterministic` ha `scripts/deterministic-recorder.mjs` (tempo virtuale e `HeadlessExperimental.beginFrame` su chrome-headless-shell, un fotogramma alla volta) e riusa `script-format.md` di `sequence-take`. `sequence-take-clock` ha `scripts/clock-recorder.mjs` (init script che sostituisce `performance.now`, `Date.now`, timer, rAF e `document.timeline`, mette in pausa e posiziona le Web Animations, screenshot di Playwright per fotogramma) e riusa lo stesso `script-format.md`.
- `install.sh`: crea un symlink per ogni skill in `~/.claude/skills/`, quindi le modifiche qui sono subito attive. Rilancialo quando aggiungi una skill. Se `ffmpeg` non è nel `PATH`, installa `ffmpeg-static` (dipendenza in `package.json`) per `/sequence-take`.

## Convenzioni

- Le skill sono scritte in inglese, la documentazione della repo in italiano.
