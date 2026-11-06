# sequence

Repo di skill per Claude Code che servono a catturare un componente UI in isolamento (screenshot, sequenze di frame, video) per mostrarlo: portfolio, social, documentazione.

## Pipeline

1. `/sequence-isolate <componente>`: crea una pagina dev-only usa e getta che monta il componente da solo, in un frame di misura fissa, con scene di fixture, picker, pannello (tema, frame, sfondo anche con colore libero, scale, velocità, puntatore, testi della scena) e modalità pulita (`H`). La stage salva lo stato del pannello (impostazioni, versioni salvate, testi) in `stage-state.json` attraverso una sua route dev-only, e `/sequence-script` lo legge; sugli host senza route server c'è invece "Copy for script", da incollare. `done` la cancella. Non tocca mai il codice di produzione: ogni file creato va in `.git/info/exclude`.
2. `/sequence-script <componente>`: intervista l'utente e scrive lo `script.md` della cattura.
3. `/sequence-take <componente>`: esegue lo `script.md` nel browser (Playwright) e salva i file ritagliati sul frame in `artifacts/captures/<componente>/`. Rende ogni fotogramma a orologio fermo: i video sono a 60 fps veri a qualunque risoluzione, su qualunque sistema (macOS compreso), al prezzo di una ripresa più lenta del video.

## Struttura

- `skills/<nome>/SKILL.md`: la skill. `sequence-isolate` ha anche `STAGE.md`, `PICKER.md`, `CONTROLS.md`, i template da copiare (`templates/`: stage.css, clock.ts per lo speed clock, pointer.ts, content.ts per i testi modificati dal pannello, state.ts per lo stato passato a `/sequence-script`). `sequence-take` ha `references/script-format.md`, il formato dello `script.md` condiviso con `sequence-script`, e `scripts/recorder.mjs`, il registratore: un init script sostituisce `performance.now`, `Date.now`, timer, rAF e `document.timeline`, mette in pausa e posiziona le Web Animations, e fa uno screenshot di Playwright per fotogramma; poi ritaglio, scala e codifica in un passaggio ffmpeg. Niente begin-frame control di Chromium, che su macOS non è supportato.
- `.claude-plugin/`: `plugin.json` e `marketplace.json`, entrambi `sequence`, per installarla come plugin di Claude Code (`/plugin marketplace add leonardoRocchini/sequence`); in alternativa `npx skills add leonardoRocchini/sequence`. Le skill si trovano da sole in `skills/`. Alza `version` in `plugin.json` nello stesso commit di ogni modifica sotto `skills/`: `claude plugin update` guarda solo quella. Dopo aver toccato i manifest, `claude plugin validate .`.
- Le skill si citano a vicenda con link relativi (`../sequence-take/references/script-format.md`): vanno installate tutte e tre.

## Convenzioni

- Le skill e il README (pubblico) sono in inglese; il resto della documentazione della repo (questo file) in italiano.
