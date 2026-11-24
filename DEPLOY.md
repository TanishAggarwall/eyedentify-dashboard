# Deploying to Northflank

One Northflank service runs everything: the dashboard and the YOLO11n detection API, on a single HTTPS address your phone opens.

## What gets deployed

- `Dockerfile` — Python 3.12 slim image with FastAPI, Uvicorn and ONNX Runtime (no PyTorch, so the image stays small).
- `backend/` — the API (`app.py`, `detector.py`) and the pre-trained model `backend/models/yolo11n.onnx` (10 MB).
- `public/` — the dashboard, served by the same container.

## Steps

1. **Put the project on GitHub.** Push this folder to a GitHub repository (private is fine). The model file is 10 MB, well under GitHub's limit.
2. **Create a Northflank project.** Sign in at northflank.com, create a project, and pick the region closest to India if more than one is offered. Closer means faster detection.
3. **Connect GitHub.** In Northflank, link your GitHub account and give it access to the repository.
4. **Create a combined service** (it builds and deploys in one):
   - Repository: your repo, branch `main`.
   - Build type: **Dockerfile**. Dockerfile path `/Dockerfile`, build context `/`.
   - Networking: port **8080**, protocol **HTTP**, **public**. Northflank gives the service an `https://….code.run` address.
   - Resources: at least **0.5 vCPU and 1 GB memory**. On the smallest free plan, YOLO still works but each frame takes noticeably longer.
   - Health check (optional but recommended): HTTP, path `/api/health`, port 8080.
5. **Deploy.** The first build takes a few minutes. When it's running, open `https://<your-service>.code.run/api/health`; it should show `{"status":"ok","model":"yolo11n",…}`.
6. **Open the dashboard on your phone** at the service's HTTPS address, go to Real-time detection, press **Start detecting** and allow the camera.

## Optional settings (environment variables)

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | Port the server listens on |
| `ORT_THREADS` | all cores | CPU threads ONNX Runtime may use |
| `ALLOWED_ORIGINS` | `*` | Comma-separated origins allowed to call the API, if the page is hosted elsewhere |
| `MODEL_PATH` | `backend/models/yolo11n.onnx` | Swap in another YOLO ONNX export |

Later, the Claude API key for Talk AI, translation and banknotes will be added here as a **secret** (`ANTHROPIC_API_KEY`), never in the page.

## Updating

Push to the `main` branch; Northflank rebuilds and redeploys automatically.

## Notes

- Camera frames are sent to the service for detection and discarded; nothing is stored on the server.
- YOLO11n is released by Ultralytics under the AGPL-3.0 licence. That's fine for a hackathon prototype; a commercial product would need an Ultralytics enterprise licence or a differently licensed model.
- To rebuild the model file: `pip install ultralytics`, then `yolo export model=yolo11n.pt format=onnx imgsz=640 opset=12`.
