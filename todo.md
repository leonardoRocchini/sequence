# TODO

- [x] `/sequence-take`: fare anche le catture `frames at <offsets>` con `recorder.mjs` invece che con gli screenshot di Playwright. I PNG agli offset si estraggono dai frame grezzi dello screencast (quello visibile all'istante `mark() + offset`), ritagliati su `.stage-frame` e scalati alla Resolution come i video. Così tutte le catture animate passano dal recorder.
