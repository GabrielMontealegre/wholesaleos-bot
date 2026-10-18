Item: #370 slice1 - on-device draft voice controls

Adds a microphone, English/Spanish choice, Read aloud and Stop to existing
message/note composers, without changing their save/send controls. Recognition
requires explicit on-device support and an installed language. No silent
prefixed/browser-cloud fallback, audio upload, pack install or server provider.
Only final recognized text reaches the draft; interim text is a temporary
status. The operator edits and uses the existing explicit save/send gate.

Writer/reader trace: new controller writes textarea.value and the existing
bubbling input event only after final recognition; readers remain existing
buyer draft cache, reviewed-deal draft handler, email reply state, template
form and legacy explicit form submit/save handlers. No writer is called.
Selectors explicitly cover current buyer/deal/email/template drafts, readonly
conversation drafts (read aloud only), legacy email/SMS compose fields and
lead/call/event/manual-entry notes. They exclude imports, contracts, comp and
source-evidence inputs. New MutationObserver attaches once per current field
without rendering private content elsewhere or starting any recognition.

Controller ownership: explicit click -> on-device language availability ->
processLocally true -> one noncontinuous session capped60s. Stop, language
change, trusted typing, background/pagehide, signout or removed target abort.
Generation checks prevent a stale event cancelling a new session or writing
after signout. Speech synthesis accepts localService=true voices only and
starts only on a tap; it never defaults to a remote voice.

Privacy research checked2026-10-18:
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition
https://developer.mozilla.org/en-US/docs/Web/API/SpeechRecognition/processLocally
https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API/Using_the_Web_Speech_API
https://developer.mozilla.org/en-US/docs/Web/API/SpeechSynthesisVoice/localService
Ordinary Chrome Web Speech may use a server; browser execution alone is NOT
a local-processing guarantee. Unsupported devices/languages show a fallback;
no claim of universal Chrome/Android on-device support is made. The keyboard's
privacy is the operator's choice, not vouched for by WholesaleOS.

Tests added: pure injected controller, local flag/language/missing packs,
no prefixed fallback/install/autoplay/network/send, interim/final maxlength,
readonly/disabled/removed fields, stale generation/new session, cancellation,
deadline and denial, remote-TTS refusal. Full actual dashboard1366/400/412
with mocked speech: editable reply, Send stays locked, language fallback,
local read/Stop, buyer Messages control,44px/no overflow, zero writes/external
calls. No real microphone/audio used. Initial driver failed to open the buyer
Messages tab; corrected the new driver, no existing assertion changed.

Self-review: no server/module/dependency, auth, contact, matching, comp,
readiness or provenance change. ASSUMED local-only policy logged. New UI uses
the existing native toolbar/theme and a microphone symbol, not a new icon
library dependency. No voice command interprets or executes any action here.
The future#372/#351 assistant context/commands are a later dependency; do not
close#370 as wholly complete on this composer slice. Full212-file cloud gate,
exact deploy and read-only live1366/400/412 required before release.
Live verification must not start the microphone, dictate real private data,
play customer text aloud, send/save a draft or confirm anything.

J release evidence rides this PR rather than causing a docs-only deploy.
I/C remain BLOCKED#383/#379; no full#341 sign-off inferred.

![Desktop](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/370-on-device-voice/docs/screens/2026-10-18-370-voice/synthetic-voice-1366.png)
![Phone](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/370-on-device-voice/docs/screens/2026-10-18-370-voice/synthetic-voice-400.png)
![Android](https://raw.githubusercontent.com/GabrielMontealegre/wholesaleos-bot/item/370-on-device-voice/docs/screens/2026-10-18-370-voice/synthetic-voice-412.png)
