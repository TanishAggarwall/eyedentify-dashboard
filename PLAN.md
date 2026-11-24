# EYEDENTIFY ONE dashboard — build plan

The glasses hardware is not working, so the dashboard stands in for it. The phone's back camera plays the role of the glasses' camera, and the phone speaker / earphones play the role of bone conduction audio.

## Decisions

| Topic | Decision |
|---|---|
| Camera | Phone back camera, dashboard opened on the phone (mobile-first layout, still works on a laptop webcam) |
| Smart AI | Claude API through the Northflank backend for Talk AI, translation and banknotes, with scripted fallback answers when offline or no key |
| Location | `Desktop\Eyedentify Dashboard`, its own project |
| Backend | Everything on the cloud: one Northflank service (FastAPI) serves the dashboard and runs pre-trained YOLO11n for detection; Claude calls will go through it too |
| Style | Same structure as JeevanSaathi (sidebar, topbar, card grid, plain HTML/CSS/JS, no build step), styled like the Sahayak dashboard (Manrope / DM Sans, purple accent) in a dark theme |

## Pages

1. **Overview** — virtual glasses status (camera source, active mode, simulated battery and latency), five mode tiles for quick switching, live feed of recent alerts and readings.
2. **Real-Time Detection** — live camera with boxes around people, vehicles, chairs, bags and other everyday objects (pre-trained YOLO11n on the cloud backend). Near/far estimate from box size; spoken cue panned left or right. Stairs, curbs and drop-offs as labelled demo scenarios, because YOLO's COCO classes don't include them.
3. **Instant Reading** — capture a frame or upload a photo, in-browser text recognition, read aloud at 1.0–3.5× speed. Translation into a chosen language through Claude.
4. **Payment & Currency** — live UPI / merchant QR scanning that speaks payee and amount; banknote recognition through Claude; change calculator.
5. **AI Navigation** — map with current location, spoken step-by-step directions to a searched place, scripted indoor scenario (metro station: platform edge, lift, exit).
6. **Talk AI** — ask by voice or text about what the camera sees ("where are my keys?"); Claude answers from the current frame and the answer is spoken.
7. **Device** — virtual glasses: battery and temperature, voice and speech-rate settings, keyboard shortcuts acting as the temple tap, API status.
8. **History** — event log of detections, readings, scans and questions, with CSV export and clear.

## Across the dashboard

- Voice commands to switch modes ("reading mode", "what's in front of me").
- Screen-reader-friendly markup, large-text and high-contrast options, everything usable by keyboard.
- Every simulated value is labelled simulated, the same way JeevanSaathi labels its fake heart rate.
- History and settings stay in the browser (localStorage). Camera frames go to the cloud backend for detection and are discarded; frames go to Claude only when you press a Talk AI, translate or banknote action.

## Setup notes

- Phone cameras only work over HTTPS, so testing on the phone uses the Northflank deployment.
- The Claude API key goes in a Northflank secret (`ANTHROPIC_API_KEY`), which you set yourself; it never goes into the page.
- Voice input uses the browser's speech recognition, which works best in Chrome on Android.

## Build order

1. Dark shell: sidebar, topbar, navigation, Overview, Device, History.
2. Camera pipeline and Real-Time Detection.
3. Instant Reading and Payment & Currency (QR first).
4. Claude function: Talk AI, translation, banknotes, with fallbacks.
5. AI Navigation.
6. Voice commands, accessibility pass, phone testing, Northflank deploy.
