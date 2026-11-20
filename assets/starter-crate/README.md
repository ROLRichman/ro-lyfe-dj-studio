# RO’Lyfe Starter Crate — Batch 1

The shared starter crate uses same-origin static audio assets in this directory. The manifest and browser loader are wired, but **the six binary audio files have not yet been copied into this directory**.

Add the real source audio using these exact target filenames:

1. `01-r-o-l-project-1.wav` — source: `R..O.L- PROJECT. 1.wav`
2. `02-r-o-l-production-2.wav` — source: `R.O.L- PRODUCTION 2.wav`
3. `03-r-o-l-project-one-staff.wav` — source: `R.O.L- PROJECT ONE STAFF.wav`
4. `04-rol-fest-1.wav` — source: `ROL FEST 1...%.wav`
5. `05-rol-swfolder-1.mp3` — source: `ROL-SWFOLDER 1.mp3`
6. `06-traffic-4.mp3` — source: `TRAFFIC 4.mp3`

Do not replace missing audio with silent files, samples, or placeholder media. Once the six originals are placed here and deployed, the Starter Crate checks each file and enables real **LOAD TO A / LOAD TO B** actions. The buttons fetch the audio, pass a File object into the existing deck loader, and save it to that device's IndexedDB crate after loading.
