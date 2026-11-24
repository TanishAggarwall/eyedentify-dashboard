<div align="center">

<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8B55F7,100:2E1065&height=230&section=header&text=EYEDENTIFY%20ONE&fontSize=60&fontColor=FFFFFF&animation=fadeIn&fontAlignY=32&desc=AI%20Smart%20Glasses%20for%20Blind%20and%20Low-Vision%20People&descAlignY=52&descSize=17" width="100%"/>

<img src="https://readme-typing-svg.demolab.com?font=Fira+Code&weight=600&size=21&duration=3000&pause=900&color=8B55F7&center=true&vCenter=true&width=760&lines=Wear+it.+Hear+the+world.;Dual+120%C2%B0+Cameras+%2B+Infrared+Depth;Bone+Conduction+Spatial+Audio;Tap+the+temple.+Say+a+command." alt="Typing SVG" />

<br>

![Product](https://img.shields.io/badge/PRODUCT-WEARABLE%20SMART%20GLASSES-8B55F7?style=for-the-badge&labelColor=000000)
![Users](https://img.shields.io/badge/FOR-BLIND%20%26%20LOW--VISION-8B55F7?style=for-the-badge&labelColor=000000)
![Hackathon](https://img.shields.io/badge/NEXHACK-2.0-8B55F7?style=for-the-badge&labelColor=000000)

![Cameras](https://img.shields.io/badge/DUAL%20120%C2%B0-HDR%20CAMERAS-FFFFFF?style=for-the-badge&labelColor=8B55F7)
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

<img src="docs/eyedentify-one-glasses.jpg" alt="EYEDENTIFY ONE smart glasses: matte black frame with dual front cameras on the left lens and an EYEDENTIFY-branded electronics housing" width="85%"/>

<sub><i>EYEDENTIFY ONE · concept render</i></sub>

</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

> **EYEDENTIFY ONE** is a pair of AI smart glasses for blind and low-vision people, built by **Team Goal Digger** for [**NexHack 2.0**](https://unstop.com/hackathons/nexhack-20-geeta-university-naultha-panipat-1733198) at Geeta University, Naultha, Panipat. Dual wide-angle cameras and infrared depth sensing see the world in front of the wearer; an on-board neural processor recognises obstacles, text, money and places; and **bone-conduction spatial audio** speaks it into the ear it's closest to, leaving the ears free for traffic and conversation. The wearer switches between five assistive modes with a **tap on the temple** or a **voice command**, with no screen needed.

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
| 📷 **Dual 120° HDR cameras** | Wide field of view for obstacles, text and faces |
| 🔦 **Infrared depth sensor** | Distance to obstacles; catches stairs, kerbs and drop-offs |
| 🧠 **Local neural SoC** | On-device detection, OCR and a vision-language model, so it works offline |
| 🔊 **Bone-conduction speakers** | Spatial audio cues in the left or right ear, ears stay open |
| 📍 **GNSS + visual-inertial odometry** | Outdoor position and heading; spatial beacons indoors |
| 👆 **Temple touch + microphone** | Tap to switch mode, speak to command or ask |
| 🔋 **Dual battery** | Up to 16 hours of use |
| 🛡️ **Grade 5 titanium frame, IP68** | 42 g, weather sealed for everyday wear |

**Why two cameras plus depth?** One camera can tell *what* is ahead; it can't reliably tell *how far*. The stereo pair and infrared depth give real distances, which is what turns "chair" into "chair, one metre, slightly left."

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rect&color=0:8B55F7,100:2E1065&height=4&width=1200" width="100%"/>
</div>

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=rounded&color=0:8B55F7,100:2E1065&height=90&section=header&text=System%20Architecture&fontSize=34&fontColor=FFFFFF&fontAlignY=60&width=1200" width="100%"/>
</div>

```mermaid
flowchart TD
    C1[📷 Dual 120° cameras] --> SOC
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
| 🎯 **Real-time detection** | "Person ahead, about 2 metres", with a beep in the ear it's closest to, faster as it gets nearer. Alerts for stairs, kerbs and obstacles | Cameras + infrared depth |
| 📖 **Instant reading** | Signs, labels, menus and pages read aloud at 1.0–3.5× speed; translation into other languages | Cameras + OCR |
| 💳 **Payment & currency** | Banknote values, and who a UPI QR code pays: name, UPI ID, app, amount | Cameras |
| 🧭 **AI navigation** | Turn-by-turn walking directions, "where am I", and clock-face directions ("the exit is at 2 o'clock") indoors and out | GNSS + IMU + beacons |
| 💬 **Talk AI** | Answers to "what's in front of me?" or "where did I put my keys?", in English or हिन्दी | Cameras + mic |

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

This repository holds the **EYEDENTIFY companion dashboard and cloud backend**. For the live demo, the **phone acts as the glasses**: its camera stands in for the glasses' cameras, its speaker and stereo beeps stand in for bone conduction, and its microphone takes the voice commands. Every one of the five modes runs end to end, so judges can try the experience before the frames ship.

| Glasses part | Stand-in for the demo |
|---|---|
| Dual 120° cameras | Phone back camera |
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
    A[1️⃣ Put on the glasses] --> B[2️⃣ Tap the temple or speak] --> C[3️⃣ Cameras + depth scan ahead] --> D[4️⃣ On-board AI understands the scene] --> E[5️⃣ 🎉 Hear it in the right ear]

    style E fill:#8b55f7,color:#fff
```

<div align="center">
<img src="https://capsule-render.vercel.app/api?type=waving&color=0:8B55F7,100:2E1065&height=120&section=footer&width=1200" width="100%"/>
</div>
