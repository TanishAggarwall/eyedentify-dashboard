"""Google Gemini features for the cloud backend: Talk AI, AI reading, translation, banknotes.

Uses the Gemini REST API directly (no extra dependencies). The key comes from the
GEMINI_API_KEY environment variable (a Northflank secret in production, backend/.env locally).
Models are tried in order; a busy or rate-limited model falls through to the next one.
"""
from __future__ import annotations

import json
import os
import time
import urllib.error
import urllib.request
from concurrent.futures import FIRST_COMPLETED, ThreadPoolExecutor, wait

API = "https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent"
DEFAULT_MODELS = "gemini-flash-lite-latest,gemini-3.1-flash-lite,gemini-flash-latest,gemini-2.5-flash"
# Busy, rate-limited, or retired/unknown model: try the next one in the list.
RETRYABLE = {404, 429, 500, 502, 503, 504}
PER_MODEL_TIMEOUT = 15   # seconds for any single model call
HEDGE_AFTER = 4          # seconds before a second model is started alongside a slow first one
TOTAL_BUDGET = 18        # seconds before giving up on the AI altogether

VOICE = (
    "You are the voice of EYEDENTIFY ONE, smart glasses for a blind or low-vision person in India. "
    "The image is what the glasses' camera sees right now, from the wearer's eye level. "
    "Your words are spoken aloud through an earpiece, so: answer in one to three short sentences, "
    "no lists, no markdown, no emojis. Mention any safety hazard first (steps, traffic, obstacles). "
    "Give positions as left, right, ahead or clock directions (12 o'clock is straight ahead) and rough "
    "distances in metres. Say rupees for Indian money. If something isn't visible or you aren't sure, "
    "say so plainly instead of guessing. Reply in the same language as the question."
)


class AIError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def key() -> str:
    return os.getenv("GEMINI_API_KEY", "").strip()


def models() -> list[str]:
    return [m.strip() for m in os.getenv("GEMINI_MODELS", DEFAULT_MODELS).split(",") if m.strip()]


def enabled() -> bool:
    return bool(key())


def _call(model: str, body: dict, timeout: float) -> dict:
    req = urllib.request.Request(
        API.format(model=model), data=json.dumps(body).encode(), method="POST",
        headers={"x-goog-api-key": key(), "Content-Type": "application/json"},
    )
    with urllib.request.urlopen(req, timeout=timeout) as res:
        return json.load(res)


def generate(parts: list[dict], *, system: str = VOICE, schema: dict | None = None,
             max_tokens: int = 1024, temperature: float = 0.3, timeout: float = PER_MODEL_TIMEOUT) -> dict:
    """Run one Gemini request, falling through the model list on overload. Returns text + metadata."""
    if not enabled():
        raise AIError("The AI isn't set up on the server (GEMINI_API_KEY is missing).", 503)
    config: dict = {"maxOutputTokens": max_tokens, "temperature": temperature}
    if schema:
        config.update(responseMimeType="application/json", responseSchema=schema)
    body = {
        "contents": [{"role": "user", "parts": parts}],
        "systemInstruction": {"parts": [{"text": system}]},
        "generationConfig": config,
    }
    t0 = time.perf_counter()
    tried: list[str] = []

    def attempt(model: str) -> dict:
        """One model call. Returns the answer, or raises _Skip (try another) / AIError (stop)."""
        try:
            data = _call(model, body, timeout)
        except urllib.error.HTTPError as e:
            if e.code in (401, 403):
                raise AIError("The server's Gemini API key was rejected.", 502)
            if e.code in RETRYABLE:
                raise _Skip(f"{model}: HTTP {e.code}")
            raise AIError(f"The AI request failed ({model}: HTTP {e.code}).", 502)
        except (urllib.error.URLError, TimeoutError, OSError) as e:
            raise _Skip(f"{model}: {getattr(e, 'reason', e)}")
        cand = (data.get("candidates") or [{}])[0]
        text = "".join(p.get("text", "") for p in cand.get("content", {}).get("parts", []) if not p.get("thought")).strip()
        if not text:
            raise _Skip(f"{model}: empty answer ({cand.get('finishReason', 'unknown')})")
        return {"text": text, "model": model}

    # Hedged requests: start the first model; if it hasn't answered after HEDGE_AFTER seconds
    # (or it fails), start the next one too. The first good answer wins.
    queue = models()
    pool = ThreadPoolExecutor(max_workers=len(queue))
    running: dict = {}
    try:
        running[pool.submit(attempt, queue.pop(0))] = True
        while running:
            left = TOTAL_BUDGET - (time.perf_counter() - t0)
            if left <= 0:
                tried.append("time budget used up")
                break
            done, _ = wait(running, timeout=min(HEDGE_AFTER, left), return_when=FIRST_COMPLETED)
            for fut in done:
                running.pop(fut)
                try:
                    result = fut.result()
                except _Skip as s:
                    tried.append(f"{s} at {time.perf_counter() - t0:.1f}s")
                    continue
                return {**result, "ms": round((time.perf_counter() - t0) * 1000)}
            if queue and (not done or not running):
                running[pool.submit(attempt, queue.pop(0))] = True
    finally:
        pool.shutdown(wait=False, cancel_futures=True)
    print(f"[ai] no answer after {time.perf_counter() - t0:.1f}s: {'; '.join(tried)}", flush=True)
    raise AIError("The AI is busy right now. Please try again in a moment.", 503)


class _Skip(Exception):
    """A model was busy, slow or unavailable; try another."""


def _image(b64: str, mime: str = "image/jpeg") -> dict:
    return {"inline_data": {"mime_type": mime, "data": b64}}


def _json(result: dict) -> dict:
    text = result["text"].strip()
    if text.startswith("```"):
        text = text.strip("`").split("\n", 1)[-1]
    try:
        return json.loads(text)
    except json.JSONDecodeError as e:
        raise AIError("The AI answered in an unexpected format.") from e


# ---------------------------------------------------------------- features

def ask(image_b64: str, question: str) -> dict:
    question = (question or "What's in front of me?").strip()[:500]
    r = generate([_image(image_b64), {"text": question}])
    return {"answer": r["text"], "model": r["model"], "ms": r["ms"], "source": "ai"}


READ_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "lines": {"type": "ARRAY", "items": {"type": "STRING"}},
        "language": {"type": "STRING", "description": "BCP-47 code of the main language, e.g. en-IN or hi-IN"},
    },
    "required": ["lines", "language"],
}


def read(image_b64: str) -> dict:
    r = generate(
        [_image(image_b64), {"text": "Transcribe every legible piece of text in this image exactly as written, "
                                     "line by line in natural reading order, keeping the original language and "
                                     "script. Fix obviously split or merged words. No commentary. If there is no "
                                     "readable text, return an empty list."}],
        system="You are a precise OCR engine for a blind reader.", schema=READ_SCHEMA, max_tokens=2048, temperature=0,
    )
    data = _json(r)
    lines = [str(l).strip() for l in data.get("lines", []) if str(l).strip()]
    return {"lines": [{"text": l} for l in lines], "text": "\n".join(lines), "language": data.get("language", ""),
            "model": r["model"], "ms": r["ms"], "source": "ai"}


TRANSLATE_SCHEMA = {
    "type": "OBJECT",
    "properties": {"translation": {"type": "STRING"}, "bcp47": {"type": "STRING"}},
    "required": ["translation", "bcp47"],
}


def translate(text: str, target: str) -> dict:
    text = (text or "").strip()[:4000]
    if not text:
        raise AIError("Nothing to translate.", 400)
    r = generate(
        [{"text": f"Translate into {target}. Keep numbers, prices and names. Use natural everyday wording, "
                  f"in the native script of {target}.\n\n{text}"}],
        system="You are a translator. Return only the translation and the BCP-47 code of the target language "
               "for an Indian speaker (for example hi-IN, ta-IN).",
        schema=TRANSLATE_SCHEMA, max_tokens=2048, temperature=0.2,
    )
    data = _json(r)
    return {"translation": data.get("translation", ""), "lang": data.get("bcp47", ""), "model": r["model"],
            "ms": r["ms"], "source": "ai"}


NOTE_SCHEMA = {
    "type": "OBJECT",
    "properties": {
        "notes": {"type": "ARRAY", "items": {"type": "OBJECT", "properties": {
            "denomination": {"type": "INTEGER"},
            "currency": {"type": "STRING", "description": "ISO code, e.g. INR"},
        }, "required": ["denomination", "currency"]}},
        "confidence": {"type": "STRING", "enum": ["high", "medium", "low"]},
        "advice": {"type": "STRING", "description": "If unclear, one short tip to get a better view; else empty"},
    },
    "required": ["notes", "confidence", "advice"],
}


def banknotes(image_b64: str) -> dict:
    r = generate(
        [_image(image_b64), {"text": "Identify every banknote visible. Indian rupee notes of the Mahatma Gandhi "
                                     "New Series: 10 chocolate brown, 20 greenish yellow, 50 fluorescent blue, "
                                     "100 lavender, 200 bright yellow, 500 stone grey. Use the printed numerals "
                                     "first, colour second. Coins are not banknotes. Do not judge whether a note "
                                     "is genuine."}],
        system="You identify banknotes for a blind user. Only report notes you can actually see.",
        schema=NOTE_SCHEMA, max_tokens=1024, temperature=0,
    )
    data = _json(r)
    notes = [n for n in data.get("notes", []) if isinstance(n.get("denomination"), int) and n["denomination"] > 0]
    return {"notes": notes, "total": sum(n["denomination"] for n in notes if n.get("currency", "INR") == "INR"),
            "confidence": data.get("confidence", "low"), "advice": data.get("advice", ""),
            "model": r["model"], "ms": r["ms"], "source": "ai"}


# ---------------------------------------------------------------- offline fallback

DEMO_ANSWERS = [
    (("key",), "Your keys are on the table, about half a metre ahead and slightly to your right."),
    (("phone", "mobile"), "Your phone is on the table to your left, next to a cup."),
    (("door", "exit", "way out"), "The door is about four metres ahead at 1 o'clock. The path to it is clear."),
    (("who", "person", "people", "someone"), "One person is about two metres ahead at 11 o'clock, facing you and smiling."),
    (("read", "say", "sign", "written"), "The sign ahead says: Sharma Bakery. Fresh bread, 40 rupees. Open 8 AM to 9 PM."),
    (("money", "note", "rupee", "cash"), "That looks like a 500 rupee note, stone grey, held flat in front of you."),
    (("bus", "auto", "vehicle", "road", "cross"), "There is traffic ahead. Wait for the signal before crossing; a bus is approaching from the left."),
]


def demo_answer(question: str) -> str:
    q = (question or "").lower()
    for words, answer in DEMO_ANSWERS:
        if any(w in q for w in words):
            return answer
    return "Ahead of you is an indoor room: a table about one metre ahead, a chair on your left, and a window at 2 o'clock. The path is clear."
