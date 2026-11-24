"""YOLO object detector running a pre-trained Ultralytics YOLO11n model exported to ONNX.

ONNX Runtime keeps the container small (no PyTorch) while using the same COCO-trained weights.
"""
from __future__ import annotations

import ast
import time
from pathlib import Path

import numpy as np
import onnxruntime as ort
from PIL import Image


class YoloDetector:
    def __init__(self, model_path: str | Path, threads: int | None = None) -> None:
        opts = ort.SessionOptions()
        opts.graph_optimization_level = ort.GraphOptimizationLevel.ORT_ENABLE_ALL
        if threads:
            opts.intra_op_num_threads = threads
            opts.inter_op_num_threads = 1
        self.session = ort.InferenceSession(str(model_path), opts, providers=["CPUExecutionProvider"])
        inp = self.session.get_inputs()[0]
        self.input_name = inp.name
        self.size = int(inp.shape[2]) if isinstance(inp.shape[2], int) else 640

        meta = self.session.get_modelmeta().custom_metadata_map
        names = ast.literal_eval(meta.get("names", "{}"))
        self.names = [names[i] for i in sorted(names)] if names else [str(i) for i in range(80)]
        self.model_name = Path(model_path).stem
        self.description = meta.get("description", "")

    def _letterbox(self, img: Image.Image) -> tuple[np.ndarray, float, int, int]:
        """Resize keeping aspect ratio and pad to a square, as YOLO expects."""
        w0, h0 = img.size
        s = self.size
        r = min(s / w0, s / h0)
        nw, nh = round(w0 * r), round(h0 * r)
        canvas = Image.new("RGB", (s, s), (114, 114, 114))
        dx, dy = (s - nw) // 2, (s - nh) // 2
        canvas.paste(img.resize((nw, nh), Image.BILINEAR), (dx, dy))
        x = np.asarray(canvas, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
        return x, r, dx, dy

    @staticmethod
    def _nms(boxes: np.ndarray, scores: np.ndarray, iou: float) -> list[int]:
        x1, y1, x2, y2 = boxes.T
        areas = (x2 - x1) * (y2 - y1)
        order = scores.argsort()[::-1]
        keep: list[int] = []
        while order.size:
            i = order[0]
            keep.append(int(i))
            xx1 = np.maximum(x1[i], x1[order[1:]])
            yy1 = np.maximum(y1[i], y1[order[1:]])
            xx2 = np.minimum(x2[i], x2[order[1:]])
            yy2 = np.minimum(y2[i], y2[order[1:]])
            inter = np.clip(xx2 - xx1, 0, None) * np.clip(yy2 - yy1, 0, None)
            overlap = inter / (areas[i] + areas[order[1:]] - inter + 1e-9)
            order = order[1:][overlap < iou]
        return keep

    def detect(self, img: Image.Image, conf: float = 0.35, iou: float = 0.5, max_det: int = 20) -> dict:
        img = img.convert("RGB")
        w0, h0 = img.size
        t0 = time.perf_counter()
        x, r, dx, dy = self._letterbox(img)
        out = self.session.run(None, {self.input_name: x})[0][0].T  # (8400, 4 + classes)
        boxes, class_scores = out[:, :4], out[:, 4:]
        cls = class_scores.argmax(1)
        scores = class_scores[np.arange(len(cls)), cls]
        mask = scores >= conf
        boxes, scores, cls = boxes[mask], scores[mask], cls[mask]

        detections = []
        if len(scores):
            cx, cy, bw, bh = boxes.T
            xyxy = np.stack([
                (cx - bw / 2 - dx) / r, (cy - bh / 2 - dy) / r,
                (cx + bw / 2 - dx) / r, (cy + bh / 2 - dy) / r,
            ], axis=1)
            xyxy[:, [0, 2]] = xyxy[:, [0, 2]].clip(0, w0)
            xyxy[:, [1, 3]] = xyxy[:, [1, 3]].clip(0, h0)
            # Class-aware NMS: shift each class into its own coordinate space.
            keep = self._nms(xyxy + cls[:, None] * 4096.0, scores, iou)[:max_det]
            for i in keep:
                x1, y1, x2, y2 = xyxy[i]
                detections.append({
                    "label": self.names[int(cls[i])],
                    "score": round(float(scores[i]), 3),
                    # normalised [x, y, width, height], origin top-left
                    "box": [round(float(x1 / w0), 4), round(float(y1 / h0), 4),
                            round(float((x2 - x1) / w0), 4), round(float((y2 - y1) / h0), 4)],
                })
        return {
            "detections": detections,
            "width": w0,
            "height": h0,
            "inference_ms": round((time.perf_counter() - t0) * 1000, 1),
            "model": self.model_name,
        }
