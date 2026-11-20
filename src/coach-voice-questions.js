// RO’Lyfe DJ Coach — 30 quick answers and local recorded voice clips.
(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const questions = [
    ["crate-load","How do I load a track already in My Crate?","Press a deck's LOAD button. The crate picker shows music already saved on this device. Choose LOAD TO A or B. It loads the saved audio directly without another download."],
    ["add-track","How do I add music to My Crate?","Choose Add Tracks in Music and Sample Crate, then select audio from your device. The file is saved in this browser on this device."],
    ["starter","What is the RO’Lyfe Starter Crate?","It is the shared six-track practice collection. A track can load only after its real audio file has been published and checked as available."],
    ["play-pause","How do Play and Pause work?","Play starts the loaded track. Press the same button again to pause. Loading a track does not start it automatically."],
    ["cue","What does Cue do?","Set Cue saves a return point. Cue sends the deck back to that saved point and pauses there. Live radio does not support track cue points."],
    ["hot-cues","How do Hot Cues work?","Tap an unused numbered pad to save the current position. Tap it again to jump back. The eight pads are saved for the current loaded track session."],
    ["loops","How do Beat Loops work?","Choose 2, 4, 8 or 16 beats to repeat the current section. Press Exit to leave the loop. Loops need a seekable audio track."],
    ["jog","What does the spinning jog wheel do?","Drag around the platter to rotate it and seek through a loaded track. With no audio loaded, it remains a visual and touch control."],
    ["scratch","Does Scratch Arm do real vinyl scratching?","Not yet. Scratch Arm currently arms the platter gesture, but it does not reverse and modulate audio like a real turntable. Full reverse-audio scratching is a separate engine milestone."],
    ["spin","Can I stop the wheel animation?","Use Pause Spin on the deck. This stops the decorative rotation only. It does not stop music or disable the jog gesture."],
    ["tempo","What does Tempo change?","Tempo changes the deck's playback rate within the displayed plus or minus 16 percent range. Reset returns it to zero."],
    ["tap-bpm","How do I tap BPM?","Tap in time with the beat at least three times. The app estimates BPM from the spacing between your taps."],
    ["sync","Does Sync automatically beat-match?","Sync adjusts tempo using the BPM values entered or tapped for the two tracks. It does not create beat grids or guarantee phase alignment, so listen and make the final timing adjustment."],
    ["crossfader","What does the Crossfader do?","Move left for Deck A, right for Deck B, and use the center to hear both. It changes the actual audio balance between the two decks."],
    ["channel","What is Channel Level?","Each channel level changes that deck's volume before the master output. It is separate from the master volume."],
    ["master","What is Master Volume?","Master Volume controls the combined studio output. It affects the final mix from the decks and performance sounds."],
    ["trim","What does TRIM do?","Trim is input gain before the deck's EQ and channel fader. Use it to balance track levels without changing the overall master output."],
    ["eq","What do HIGH, MID and LOW do?","They adjust high, mid and bass frequency ranges for each deck. Small changes are usually easier to control than extreme cuts or boosts."],
    ["filter","What does Filter do?","The filter sweeps between low-pass and high-pass tone shaping. The center position is neutral."],
    ["echo","What is Echo Send?","Echo Send adds a delay effect to the deck output. Bring it up gently and reduce it after the transition."],
    ["auto-blend","How does Auto Blend work?","Load two local music tracks and start one deck. Auto Blend starts the waiting deck, moves the real crossfader over the selected time, then pauses the outgoing deck."],
    ["cancel-blend","Can I cancel Auto Blend?","Press Cancel Blend or move the crossfader manually. Manual movement returns control to you."],
    ["fx","What do the FX pads do?","The built-in pads create short synthesized accents such as horn, siren, riser, bass drop, laser, scratch stab, vinyl stop and rewind."],
    ["samples","Can I use my own sound effects?","Open FX + Samples and load files into the eight sample slots. The sample bank saves them locally and also adds supported files to My Crate."],
    ["record","What does Record Both Decks capture?","It records the combined master audio output from the active decks and performance sound routed through the master path. Press the button again to stop and save."],
    ["radio","Can I mix the radio player?","The embedded listening player is separate. To mix radio, use a direct HTTPS audio stream that the station host allows the browser to access. Live streams may not support cueing, scratching or seeking."],
    ["discovery","How do I use Music Discovery?","Search the Free To Use catalog. Use Save to Crate when the source permits an actual download, then load it from My Crate later. Catalog access can depend on the browser and source."],
    ["waveform","How do I seek with the waveform?","Touch or drag the waveform or its seek control to move to another point in a loaded track. Live radio may not allow seeking."],
    ["restore","What does Restore Last Set do?","It reloads the last tracks assigned to Deck A and Deck B from this device's saved crate. It does not sync music between different devices."],
    ["midi","Can I connect a DJ controller?","The studio includes basic Web MIDI mapping for supported desktop browsers and physical MIDI controllers. Device and browser compatibility varies; phone-as-remote pairing is not active."]
  ];

  let dbPromise;
  let recorder = null;
  let activeStream = null;
  let chunks = [];
  let recordingQuestionId = null;
  let lastClipUrl = null;
  let playingClip = null;

  function openDb() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const request = indexedDB.open('rolyfe-coach-voice-clips', 1);
      request.onupgradeneeded = () => {
        if (!request.result.objectStoreNames.contains('answers')) {
          request.result.createObjectStore('answers', { keyPath: 'questionId' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error || new Error('Voice clip storage is unavailable.'));
    });
    return dbPromise;
  }

  async function getClip(questionId) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('answers', 'readonly');
      const request = tx.objectStore('answers').get(questionId);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error || new Error('Could not read the saved voice clip.'));
    });
  }

  async function saveClip(questionId, blob) {
    const db = await openDb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('answers', 'readwrite');
      tx.objectStore('answers').put({
        questionId,
        blob,
        type: blob.type || 'audio/webm',
        savedAt: Date.now()
      });
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error || new Error('Could not save the voice clip.'));
      tx.onabort = () => reject(tx.error || new Error('Voice clip save was interrupted.'));
    });
  }

  function selectedQuestion() {
    const id = $('djGuideQuestionSelect')?.value;
    return questions.find(question => question[0] === id) || questions[0];
  }

  async function refreshClipState() {
    const question = selectedQuestion();
    const play = $('djGuidePlayVoice');
    if (!play) return;
    try {
      const clip = await getClip(question[0]);
      play.disabled = !clip;
      play.textContent = clip ? 'PLAY MY VOICE' : 'NO VOICE CLIP YET';
    } catch (error) {
      play.disabled = true;
      const status = $('djGuideRecordingStatus');
      if (status) status.textContent = error.message;
    }
  }

  function showAnswer() {
    const question = selectedQuestion();
    const answer = $('djGuideQuestionAnswer');
    if (answer) answer.textContent = question[2];
    refreshClipState();
  }

  function setStatus(message) {
    const status = $('djGuideRecordingStatus');
    if (status) status.textContent = message;
  }

  async function talkQuestion() {
    const question = selectedQuestion();
    if (window.ROLyfeCoachVoiceEnabled && !window.ROLyfeCoachVoiceEnabled()) {
      setStatus('Coach Voice is OFF. Turn it on to hear the explanation.');
      return;
    }
    if ($('djGuideUseMyVoice')?.checked) {
      try {
        const clip = await getClip(question[0]);
        if (clip?.blob) {
          await playClip(clip.blob);
          return;
        }
        setStatus('No recording for this question yet. Record your answer first, or turn off Use My Recorded Answer.');
      } catch (error) {
        setStatus(error.message || 'Could not play your saved voice answer.');
      }
      return;
    }
    if (window.ROLyfeCoachSpeak) {
      window.ROLyfeCoachSpeak(question[1] + '. ' + question[2]);
    } else {
      setStatus('The coach voice is still starting. Try again in a moment.');
    }
  }

  async function playClip(blob) {
    if (playingClip) {
      playingClip.pause();
      playingClip = null;
    }
    if (lastClipUrl) URL.revokeObjectURL(lastClipUrl);
    lastClipUrl = URL.createObjectURL(blob);
    playingClip = new Audio(lastClipUrl);
    const volume = Number($('djGuideVoiceVolume')?.value ?? 0.85);
    playingClip.volume = Math.max(0, Math.min(1, volume));
    playingClip.addEventListener('ended', () => {
      if (lastClipUrl) URL.revokeObjectURL(lastClipUrl);
      lastClipUrl = null;
      playingClip = null;
    }, { once: true });
    try {
      await playingClip.play();
      setStatus('Playing your recorded voice answer. Music playback is not deliberately stopped by RO’Lyfe.');
    } catch (error) {
      setStatus('Your browser blocked voice clip playback. Press Play My Voice again.');
    }
  }

  window.ROLyfeCoachStopCustomVoice = () => {
    if (playingClip) {
      playingClip.pause();
      playingClip.currentTime = 0;
      playingClip = null;
    }
    if (lastClipUrl) {
      URL.revokeObjectURL(lastClipUrl);
      lastClipUrl = null;
    }
  };

  async function startRecording() {
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setStatus('This browser does not support microphone recording. Try a current Chrome browser over HTTPS.');
      return;
    }
    try {
      activeStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = ['audio/webm;codecs=opus', 'audio/webm', 'audio/mp4'].find(type =>
        window.MediaRecorder.isTypeSupported?.(type)
      );
      recorder = mimeType ? new MediaRecorder(activeStream, { mimeType }) : new MediaRecorder(activeStream);
      recordingQuestionId = selectedQuestion()[0];
      chunks = [];
      recorder.addEventListener('dataavailable', event => {
        if (event.data && event.data.size) chunks.push(event.data);
      });
      recorder.addEventListener('stop', async () => {
        try {
          const clip = new Blob(chunks, { type: recorder?.mimeType || 'audio/webm' });
          if (!clip.size) throw new Error('The microphone did not capture an audio clip.');
          await saveClip(recordingQuestionId || selectedQuestion()[0], clip);
          setStatus('Your voice answer is saved on this device for this question.');
          await refreshClipState();
        } catch (error) {
          setStatus(error.message || 'Could not save the voice recording.');
        } finally {
          activeStream?.getTracks().forEach(track => track.stop());
          activeStream = null;
          recorder = null;
          recordingQuestionId = null;
          chunks = [];
          $('djGuideRecordVoice').disabled = false;
          $('djGuideRecordVoice').textContent = '● RECORD MY VOICE';
          $('djGuideStopVoice').disabled = true;
        }
      });
      recorder.start();
      $('djGuideRecordVoice').disabled = true;
      $('djGuideRecordVoice').textContent = 'RECORDING…';
      $('djGuideStopVoice').disabled = false;
      setStatus('Recording your answer. Speak clearly, then press Stop & Save.');
    } catch (error) {
      activeStream?.getTracks().forEach(track => track.stop());
      activeStream = null;
      setStatus(error.message || 'Microphone permission was not granted.');
    }
  }

  function stopRecording() {
    if (recorder && recorder.state !== 'inactive') recorder.stop();
  }

  function bind() {
    const select = $('djGuideQuestionSelect');
    if (!select) return;
    questions.forEach(question => select.add(new Option(question[1], question[0])));
    select.addEventListener('change', showAnswer);
    $('djGuideQuestionTalk')?.addEventListener('click', talkQuestion);
    $('djGuideRecordVoice')?.addEventListener('click', startRecording);
    $('djGuideStopVoice')?.addEventListener('click', stopRecording);
    $('djGuidePlayVoice')?.addEventListener('click', async () => {
      if (window.ROLyfeCoachVoiceEnabled && !window.ROLyfeCoachVoiceEnabled()) {
        setStatus('Coach Voice is OFF. Turn it on to hear the recording.');
        return;
      }
      const clip = await getClip(selectedQuestion()[0]);
      if (clip?.blob) await playClip(clip.blob);
    });
    $('djGuideVoiceVolume')?.addEventListener('input', () => {
      if (playingClip) playingClip.volume = Number($('djGuideVoiceVolume').value);
    });
    showAnswer();
    window.addEventListener('beforeunload', () => {
      if (recorder && recorder.state !== 'inactive') recorder.stop();
      activeStream?.getTracks().forEach(track => track.stop());
      if (lastClipUrl) URL.revokeObjectURL(lastClipUrl);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', bind, { once: true });
  else bind();
})();