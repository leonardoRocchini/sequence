# sequence

Repo di skill per Claude Code che servono a catturare un componente UI in isolamento (screenshot, sequenze di frame, video) per mostrarlo: portfolio, social, documentazione.

## Pipeline

1. `/sequence-isolate <componente>`: crea una pagina dev-only usa e getta che monta il componente da solo, in un frame di misura fissa, con scene di fixture, picker, pannello (tema, frame, sfondo, scale, velocità, puntatore) e modalità pulita (`H`). `done` la cancella. Non tocca mai il codice di produzione: ogni file creato va in `.git/info/exclude`.
2. `/sequence-script <componente>`: intervista l'utente e scrive lo `script.md` della cattura.
3. `/sequence-take <componente>`: esegue lo `script.md` nel browser (Playwright) e salva i file ritagliati sul frame in `artifacts/captures/<componente>/`. Rende ogni fotogramma a orologio fermo: i video sono a 60 fps veri a qualunque risoluzione, su qualunque sistema (macOS compreso), al prezzo di una ripresa più lenta del video.

## Struttura

- `skills/<nome>/SKILL.md`: la skill. `sequence-isolate` ha anche `STAGE.md`, `PICKER.md`, `CONTROLS.md`, i template da copiare (`templates/`: stage.css, clock.ts per lo speed clock, pointer.ts). `sequence-take` ha `references/script-format.md`, il formato dello `script.md` condiviso con `sequence-script`, e `scripts/recorder.mjs`, il registratore: un init script sostituisce `performance.now`, `Date.now`, timer, rAF e `document.timeline`, mette in pausa e posiziona le Web Animations, e fa uno screenshot di Playwright per fotogramma; poi ritaglio, scala e codifica in un passaggio ffmpeg. Niente begin-frame control di Chromium, che su macOS non è supportato.
- `install.sh`: crea un symlink per ogni skill in `~/.claude/skills/`, quindi le modifiche qui sono subito attive. Rilancialo quando aggiungi una skill. Se `ffmpeg` non è nel `PATH`, installa `ffmpeg-static` (dipendenza in `package.json`) per `/sequence-take`.

## Convenzioni

- Le skill sono scritte in inglese, la documentazione della repo in italiano.
