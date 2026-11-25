"""Phone-as-camera pairing: a laptop dashboard receives video from a phone.

The laptop opens a short-lived session and shows its code as a QR. The phone joins with the code and
streams its camera. Two transports, chosen automatically by the browsers:

* WebRTC (preferred): this module only relays the offer and answer (signalling); video then flows
  directly between the devices.
* Frame relay (fallback when WebRTC can't connect): the phone posts JPEG frames and the laptop
  long-polls the newest one. Only the latest frame is kept, in memory, and never written to disk.

Everything lives in process memory, which suits the single-instance deployment. Sessions expire
after IDLE_TTL seconds without activity.
"""
from __future__ import annotations

import asyncio
import secrets
import time
from dataclasses import dataclass, field

CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"  # no 0/O or 1/I, easy to read aloud
CODE_LENGTH = 6
IDLE_TTL = 15 * 60       # seconds
MAX_SESSIONS = 200
PHONE_SEEN_WINDOW = 6.0  # seconds: phone counts as connected if heard from this recently
MAX_SDP = 20_000         # characters
MAX_FRAME = 800 * 1024   # bytes


class RemoteError(Exception):
    def __init__(self, message: str, status: int = 400):
        super().__init__(message)
        self.status = status


@dataclass
class Session:
    code: str
    created: float = field(default_factory=time.monotonic)
    touched: float = field(default_factory=time.monotonic)
    phone_seen: float = 0.0
    offer: dict | None = None
    answer: dict | None = None
    frame: bytes = b""
    seq: int = 0
    transport: str = ""  # "webrtc" or "relay", reported by the phone
    new_frame: asyncio.Event = field(default_factory=asyncio.Event)

    def touch(self, phone: bool = False) -> None:
        now = time.monotonic()
        self.touched = now
        if phone:
            self.phone_seen = now

    def status(self) -> dict:
        connected = self.phone_seen > 0 and time.monotonic() - self.phone_seen < PHONE_SEEN_WINDOW
        return {"code": self.code, "phone_connected": connected, "has_offer": self.offer is not None,
                "has_answer": self.answer is not None, "seq": self.seq, "transport": self.transport or None}


_sessions: dict[str, Session] = {}


def _prune() -> None:
    now = time.monotonic()
    for code in [c for c, s in _sessions.items() if now - s.touched > IDLE_TTL]:
        _sessions.pop(code, None)


def normalise(code: str) -> str:
    return "".join(ch for ch in code.upper() if ch.isalnum())


def create() -> Session:
    _prune()
    if len(_sessions) >= MAX_SESSIONS:
        oldest = min(_sessions.values(), key=lambda s: s.touched)
        _sessions.pop(oldest.code, None)
    while True:
        code = "".join(secrets.choice(CODE_ALPHABET) for _ in range(CODE_LENGTH))
        if code not in _sessions:
            break
    s = Session(code)
    _sessions[code] = s
    return s


def get(code: str) -> Session:
    _prune()
    s = _sessions.get(normalise(code))
    if not s:
        raise RemoteError("That pairing code has expired or doesn't exist. Make a new one on the laptop.", 404)
    return s


def _description(desc: dict, kind: str) -> dict:
    sdp, typ = desc.get("sdp"), desc.get("type")
    if typ != kind or not isinstance(sdp, str) or not sdp.startswith("v=0") or len(sdp) > MAX_SDP:
        raise RemoteError(f"Not a valid WebRTC {kind}.", 400)
    return {"type": typ, "sdp": sdp}


def set_offer(code: str, desc: dict) -> dict:
    s = get(code)
    s.offer = _description(desc, "offer")
    s.answer = None  # a new offer starts a new handshake
    s.touch(phone=True)
    return s.status()


def set_answer(code: str, desc: dict) -> dict:
    s = get(code)
    if not s.offer:
        raise RemoteError("The phone hasn't sent its offer yet.", 409)
    s.answer = _description(desc, "answer")
    s.touch()
    return s.status()


def set_frame(code: str, data: bytes) -> int:
    s = get(code)
    if not data:
        raise RemoteError("Send a JPEG frame as the request body.", 400)
    if len(data) > MAX_FRAME:
        raise RemoteError("Frame too large. Send a smaller JPEG.", 413)
    if not data.startswith(b"\xff\xd8"):
        raise RemoteError("Frames must be JPEG images.", 415)
    s.frame = data
    s.seq += 1
    s.transport = "relay"
    s.touch(phone=True)
    s.new_frame.set()
    s.new_frame = asyncio.Event()
    return s.seq


async def wait_frame(code: str, after: int, timeout: float = 2.0) -> tuple[int, bytes] | None:
    """Return the newest frame once its number is above `after`, waiting up to `timeout` seconds."""
    s = get(code)
    s.touch()
    if s.seq <= after:
        try:
            await asyncio.wait_for(s.new_frame.wait(), timeout)
        except asyncio.TimeoutError:
            return None
    return (s.seq, s.frame) if s.seq > after and s.frame else None


def ping(code: str, transport: str | None = None) -> dict:
    s = get(code)
    if transport in ("webrtc", "relay"):
        s.transport = transport
    s.touch(phone=True)
    return s.status()


def end(code: str) -> None:
    _sessions.pop(normalise(code), None)
