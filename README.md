<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8B55F7,100:2E1065&height=230&section=header&text=EYEDENTIFY%20ONE&fontSize=60&fontColor=FFFFFF&animation=fadeIn&fontAlignY=32&desc=AI%20Smart%20Glasses%20for%20Blind%20and%20Low-Vision%20People&descAlignY=52&descSize=17" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=21&duration=3000&pause=900&color=8B55F7&center=true&vCenter=true&width=760&lines=Wear+it.+Hear+the+world.;120%C2%B0+HDR+Camera+%2B+Infrared+Depth;Bone+Conduction+Spatial+Audio;Tap+the+temple.+Say+a+command." alt="Typing SVG" />

<br>

[![Tests](https://github.com/TanishAggarwall/eyedentify-dashboard/actions/workflows/tests.yml/badge.svg)](https://github.com/TanishAggarwall/eyedentify-dashboard/actions/workflows/tests.yml)

![Product](https://img.shields.io/badge/PRODUCT-WEARABLE%20SMART%20GLASSES-8B55F7?style=for-the-badge&labelColor=000000)
![Users](https://img.shields.io/badge/FOR-BLIND%20%26%20LOW--VISION-8B55F7?style=for-the-badge&labelColor=000000)
![Hackathon](https://img.shields.io/badge/NEXHACK-2.0-8B55F7?style=for-the-badge&labelColor=000000)

![Camera](https://img.shields.io/badge/120%C2%B0-HDR%20CAMERA-FFFFFF?style=for-the-badge&labelColor=8B55F7)
![Depth](https://img.shields.io/badge/INFRARED-DEPTH%20SENSING-FFFFFF?style=for-the-badge&labelColor=8B55F7)
![Audio](https://img.shields.io/badge/BONE-CONDUCTION-FFFFFF?style=for-the-badge&labelColor=8B55F7)
![Battery](https://img.shields.io/badge/UP%20TO-16%20HOURS-FFFFFF?style=for-the-badge&labelColor=8B55F7)

<br>

![Python](https://img.shields.io/badge/Python-000000?style=flat-square&logo=python&logoColor=8B55F7)
![FastAPI](https://img.shields.io/badge/FastAPI-000000?style=flat-square&logo=fastapi&logoColor=8B55F7)
![ONNX](https://img.shields.io/badge/ONNX%20Runtime-000000?style=flat-square&logo=onnx&logoColor=8B55F7)
![YOLO](https://img.shields.io/badge/Ultralytics%20YOLO11-000000?style=flat-square&logo=ultralytics&logoColor=8B55F7)
![Gemini](https://img.shields.io/badge/Gemini-000000?style=flat-square&logo=googlegemini&logoColor=8B55F7)
![OpenStreetMap](https://img.shields.io/badge/OpenStreetMap-000000?style=flat-square&logo=openstreetmap&logoColor=8B55F7)
![Docker](https://img.shields.io/badge/Docker-000000?style=flat-square&logo=docker&logoColor=8B55F7)

<br><br>

<img src="docs/eyedentify-one-glasses.jpg" alt="EYEDENTIFY ONE smart glasses: matte black frame with the front camera and depth sensor on the left lens and an EYEDENTIFY-branded electronics housing" width="85%"/>

<sub><i>EYEDENTIFY · concept render</i></sub>

</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

> **EYEDENTIFY ONE** is a pair of AI smart glasses for blind and low-visionary people, built by **Team Goal Digger** for [**NexHack 2.0**](https://unstop.com/hackathons/nexhack-20-geeta-university-naultha-panipat-1733198) at Geeta University, Naultha, Panipat. A wide-angle camera and infrared depth sensing see the world in front of the wearer; an on-board neural processor recognises obstacles, text, money and places; and **bone-conduction spatial audio** speaks it into the ear it's closest to, leaving the ears free for traffic and conversation. The wearer switches between five assistive modes with a **tap on the temple** or a **voice command**, with no screen needed.

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=The%20Hardware&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>

<img src="docs/eyedentify-one-exploded.jpg" alt="Exploded view of EYEDENTIFY ONE: titanium frame, dual camera module, main circuit board, battery cells, temple arms and lens" width="85%"/>

<sub><i>Exploded view: frame, camera module, compute board, dual battery and temple arms</i></sub>

</div>

| Component | Purpose |
|---|---|
| 📷 **120° HDR camera** | Wide field of view for obstacles, text and faces |
| 🔦 **Infrared depth sensor** | Distance to obstacles; catches stairs, kerbs and drop-offs |
| 🧠 **Local neural SoC** | On-device detection, OCR and a vision-language model, so it works offline |
| 🔊 **Bone-conduction speakers** | Spatial audio cues in the left or right ear, ears stay open |
| 📍 **GNSS + visual-inertial odometry** | Outdoor position and heading; spatial beacons indoors |
| 👆 **Temple touch + microphone** | Tap to switch mode, speak to command or ask |
| 🔋 **Dual battery** | Up to 16 hours of use |
| 🛡️ **Grade 5 titanium frame, IP68** | 42 g, weather sealed for everyday wear |

**Why a camera plus depth?** A camera alone can tell *what* is ahead; it can't reliably tell *how far*. Pairing it with the infrared depth sensor gives real distances, which is what turns "chair" into "chair, one metre, slightly left."

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=System%20Architecture&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>

<img src="docs/system-architecture.png" alt="EYEDENTIFY ONE system architecture: the glasses sense with a 120 degree camera, infrared depth, GNSS and IMU, microphone and temple touch; an on-board neural SoC fuses the sensors, runs detection, depth, reading and speech recognition, then the mode manager and an offline safety alert engine drive bone-conduction audio and haptics. The glasses link to a companion phone over Bluetooth LE, and the phone optionally reaches the cloud backend over HTTPS." width="100%"/>

<sub><i>Fig. 1 · EYEDENTIFY ONE system architecture</i></sub>
</div>

```mermaid
flowchart TD
    C1[📷 120° HDR camera] --> SOC
    C2[🔦 Infrared depth] --> SOC
    C3[📍 GNSS + IMU] --> SOC
    C4[👆 Temple tap + 🎙️ mic] --> SOC

    SOC[🧠 EYEDENTIFY ONE<br/>on-board neural SoC] --> OUT[🔊 Bone-conduction<br/>spatial audio]
    SOC -- Bluetooth --> APP[📱 Companion phone app]
    APP -- optional --> CLOUD[☁️ EYEDENTIFY cloud<br/>YOLO11n · Gemini · maps]
    CLOUD --> APP --> SOC

    style SOC fill:#8b55f7,color:#fff
    style OUT fill:#1e293b,color:#fff
    style APP fill:#009688,color:#fff
    style CLOUD fill:#f97316,color:#fff
```

**Key rule:** safety alerts never wait on the network. Obstacle warnings come from the glasses themselves; the cloud only adds richer answers (scene questions, translation, routes) when a connection is available. Camera frames are analysed and discarded, never stored.

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=Five%20Assistive%20Modes&fontSize=32&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

| Mode | What the wearer hears | Sensors used |
|---|---|---|
| 🎯 **Real-time detection** | "Person ahead, about 2 metres", with a beep in the ear it's closest to, faster as it gets nearer. Alerts for stairs, kerbs and obstacles | Camera + infrared depth |
| 📖 **Instant reading** | Signs, labels, menus and pages read aloud at 1.0–3.5× speed; translation into other languages | Camera + OCR |
| 💳 **Payment & currency** | Banknote values, and who a UPI QR code pays: name, UPI ID, app, amount | Camera |
| 🧭 **AI navigation** | Turn-by-turn walking directions, "where am I", and clock-face directions ("the exit is at 2 o'clock") indoors and out | GNSS + IMU + beacons |
| 💬 **Talk AI** | Answers to "what's in front of me?" or "where did I put my keys?", in English or हिन्दी | Camera + mic |

**Controls:** tap the temple to cycle modes · say *read this · where am I · take me to … · check this note · scan QR · repeat · stop*.

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=Alert%20Levels&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

| Level | Trigger | Cue in the ear |
|---|---|:---:|
| 🟢 Clear | Nothing within the warning range | Silent |
| 🟡 Ahead | Object detected within range | Spoken name + distance, 1 beep |
| 🟠 Near | Object getting closer | Repeat alert, 2 beeps on that side |
| 🔴 Close | Object very close, or a drop / stair edge | 3 high beeps + vibration |

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=Access%20%26%20Pricing&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

| Edition | Price | For |
|---|:---:|---|
| **Pioneer Edition** | ₹5,000 · ₹1,000 refundable deposit | Students and early adopters |
| **Pro + Care** | ₹6,500 · ₹1,500 refundable deposit | Prescription inserts, priority support |
| **Healthcare & Grants** | ₹0 out of pocket | Eligible veterans, rehab clients, NGO and insurance-supported users |

30-day trial after delivery · deposits refundable before shipping.

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=Team&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

<div align="center">

**Team Name: Goal Digger**

[![NexHack 2.0](https://img.shields.io/badge/NEXHACK%202.0-GEETA%20UNIVERSITY%2C%20PANIPAT-8B55F7?style=for-the-badge&labelColor=000000)](https://unstop.com/hackathons/nexhack-20-geeta-university-naultha-panipat-1733198)

| 👤 Member |
|:---:|
| Manan Garg |
| Tanish Aggarwal |
| Yash Goel |
| Piyush Gupta |

</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=Companion%20Dashboard&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>

[![Open the dashboard](https://img.shields.io/badge/▶%20OPEN%20COMPANION%20DASHBOARD-8B55F7?style=for-the-badge&labelColor=000000)](https://eyedentify-dashboard.vercel.app)

</div>

This repository holds the **EYEDENTIFY companion dashboard and cloud backend**. For the live demo, the **phone acts as the glasses**: its camera stands in for the glasses' camera, its speaker and stereo beeps stand in for bone conduction, and its microphone takes the voice commands. Every one of the five modes runs end to end, so judges can try the experience before the frames ship.

| Glasses part | Stand-in for the demo |
|---|---|
| 120° HDR camera | Phone back camera |
| On-board neural SoC | Cloud backend: YOLO11n (ONNX Runtime), RapidOCR, zxing-cpp, Gemini |
| Infrared depth | Distance estimated from box size; demo hazard scenes for stairs and kerbs |
| Bone-conduction audio | Phone speech + left/right panned beeps (use earphones) |
| GNSS + IMU | Phone GPS and compass; OpenStreetMap routes |
| Temple tap | Mode button, `Space` key, or top-bar mic |

<details>
<summary><b>🔧 Run the dashboard locally</b></summary>

```bash
git clone https://github.com/TanishAggarwall/eyedentify-dashboard.git
cd eyedentify-dashboard
python -m venv .venv
.venv\Scripts\pip install -r backend/requirements.txt
.venv\Scripts\pip install --no-deps -r backend/requirements-nodeps.txt
.venv\Scripts\python -m uvicorn app:app --app-dir backend --port 8080
```

Put `GEMINI_API_KEY=...` in `backend/.env` (git-ignored) to turn on the AI features. Open **http://localhost:8080** in Chrome. Phones only allow the camera and microphone on **HTTPS**, so test on a phone with the deployed address.

**Deploy:** the `Dockerfile` runs the backend on **Northflank** (see [`DEPLOY.md`](DEPLOY.md)); **Vercel** serves `public/` and proxies `/api/*` to it via [`vercel.json`](vercel.json). Phone test checklist: [`TESTING.md`](TESTING.md).

</details>

<details>
<summary><b>🧪 Tests</b></summary>

81 automated tests run on every push to `main` through GitHub Actions ([`tests.yml`](.github/workflows/tests.yml)).

| Suite | Tests | Covers |
|---|:---:|---|
| **Backend API** · [`backend/tests/test_api.py`](backend/tests/test_api.py) | 20 | YOLO detection returns valid normalised boxes, a generated UPI QR code is decoded, printed text is read by OCR, Talk AI and AI reading fall back safely without a Gemini key, bad / empty / oversized uploads are rejected, out-of-range coordinates and 25 km+ walks are refused |
| **Backend units** · [`backend/tests/test_units.py`](backend/tests/test_units.py) | 30 | Spoken walking instructions, route step folding (OSRM mocked), distance maths, OCR text clean-up, non-max suppression, demo answers |
| **Frontend** · [`tests/frontend.test.mjs`](tests/frontend.test.mjs) | 31 | UPI QR parsing (payee, app, amount, scam warnings), rupee formatting, change in notes and coins, voice command parsing |

Tests never call Gemini or any paid API.

```bash
.venv\Scripts\pip install -r backend/requirements-dev.txt
cd backend && ..\.venv\Scripts\python -m pytest      # backend
node --test tests/*.test.mjs                           # frontend (Node 22+)
```

</details>

<details>
<summary><b>🔌 Backend API</b></summary>

| Endpoint | Input | Output |
|---|---|---|
| `GET /api/health` | — | Model, classes, AI status |
| `POST /api/detect` | JPEG body | YOLO boxes (normalised), labels, scores |
| `POST /api/read` | JPEG body | OCR text and lines |
| `POST /api/scan` | JPEG body | QR / barcode contents |
| `POST /api/ai/ask` · `read` · `translate` · `banknote` | JSON (image as base64, question, language) | Short spoken-style answer |
| `GET /api/nav/search` · `reverse` · `route` | Query / coordinates | Places, "you are on…", walking steps |

</details>

<details>
<summary><b>📁 Project structure</b></summary>

```text
backend/
  app.py          FastAPI app: API routes, serves public/
  detector.py     YOLO11n on ONNX Runtime: letterbox, inference, NMS
  ai.py           Gemini: Talk AI, reading, translation, banknotes (hedged requests)
  nav.py          Nominatim search / reverse, OSRM walking routes → spoken steps
  reader.py       RapidOCR text reading, zxing-cpp QR / barcodes
  models/         yolo11n-320.onnx (default), yolo11n.onnx (640 px)
public/           Dashboard: Overview, five modes, Device & settings, History
  js/payment-logic.js, js/commands.js   browser-free logic (unit-tested)
backend/tests/    pytest suite
tests/            frontend unit tests (node --test)
.github/workflows CI: runs all tests on every push
docs/             Product images
Dockerfile        Northflank container
vercel.json       Vercel static hosting + /api proxy
```

**Keyboard (temple controls):** `Space` next mode · `1–5` jump to a mode · `V` voice command · `R` repeat · `Esc` stop speaking · `C` camera on/off

</details>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=How%20It%20Works&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

```mermaid
flowchart LR
    A[1️⃣ Put on the glasses] --> B[2️⃣ Tap the temple or speak] --> C[3️⃣ Camera + depth scan ahead] --> D[4️⃣ On-board AI understands the scene] --> E[5️⃣ 🎉 Hear it in the right ear]

    style E fill:#8b55f7,color:#fff
```

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8B55F7,100:2E1065&height=120&section=footer&width=1200" width="100%"/>
</div>
