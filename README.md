# RO’Lyfe DJ Studio™

**Your sound. Your set. Your workstation.**

RO’Lyfe DJ Studio is a browser-based, two-deck DJ workstation built for desktop, tablet, and mobile. This repository is the dedicated RO’Lyfe working copy of the existing DJ workspace.

## Start directly in the studio

There is no welcome gate, sign-in screen, or separate “Enter Studio” button. Opening the app loads the DJ workstation directly. The dual-deck workspace is the first major section on the page, and the startup coordinator loads the engine before the supporting DJ modules.

## Included workspace

- Dual decks with local audio loading, playback, cue points, hot cues, loops, tempo controls, jog wheels, and waveforms.
- Central mixer with EQ, filters, channel levels, master level, and crossfader.
- Local music crate with device/browser storage and Restore Last Set.
- Built-in practice loops and a starter crate.
- Supported radio stream input and the chill listening player.
- DJ Guide, coaching tools, performance effects, and sample pads.
- Video mixer and MIDI controller support where available.
- Focus mode, session timer, and mobile quick mixer.

## Important notes

- Local music is stored in the browser on the device where it was imported. It does not automatically sync between devices. Existing device-local music, coach recordings, FX samples, and saved studio preferences retain their established browser-storage identifiers across the rebrand, so data already on the same browser profile remains accessible.
- A radio station must provide a direct HTTPS audio stream that permits browser playback. A website or embedded-player page is not necessarily a stream URL.
- YouTube and YouTube Music open as separate services; they are not treated as downloadable deck audio.
- Browser audio recording, MIDI, and streaming behavior depends on browser/device support and permissions.

## Development status

- [x] Dedicated RO’Lyfe repository established
- [x] Original DJ workspace source copied into this repository
- [x] RO’Lyfe branding applied to the app entry, manifest, and service worker
- [x] Welcome/front-door gate removed; app opens directly to the workstation
- [x] Dual-deck workspace moved to the top of the page
- [x] Ordered startup coordinator added with a visible error message if a module fails
- [x] Saved-crate restoration scheduled after the initial render
- [ ] Full code and asset audit
- [ ] Desktop, tablet, and mobile testing
- [ ] Dual-deck, radio, local crate, and media workflow validation
- [ ] Release review

This is a development copy. The original source repository remains separate and unchanged. This project is also separate from DJ Flawless. No public marketing front door is part of this build.

## Project structure

- `index.html` — direct-entry studio interface
- `src/` — audio engine, decks, DJ Guide, crate, mixer, video, and performance modules
- `assets/` — RO’Lyfe mark and starter-crate resources
- `scripts/` — validation tools
- `sw.js` — versioned application service worker
