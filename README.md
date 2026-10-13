# sequence

Set di skill Agets.

| Skill              | Cosa fa                                                                                                       |
| ------------------ | ------------------------------------------------------------------------------------------------------------- |
| `sequence-isolate` | Pagina dev-only che isola un componente in un frame fisso, con scene e pannello di controllo, per catturarlo. |
| `sequence-script`  | Intervista e scrive lo `script.md` della cattura.                                                             |
| `sequence-take`    | Esegue lo `script.md` nel browser e salva screenshot e video ritagliati sul frame.                            |

Pipeline: `/sequence-isolate` → `/sequence-script` → `/sequence-take`.

## Installazione

```sh
./install.sh
```

Crea un symlink per ogni cartella in `skills/` dentro `~/.claude/skills/`, quindi le modifiche nella repo sono subito attive. Rilancialo quando aggiungi una skill.
