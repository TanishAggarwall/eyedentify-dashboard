"""Walking navigation for the cloud backend, on free OpenStreetMap services.

- Place search and "where am I?": Nominatim (openstreetmap.org). Its usage policy asks for an
  identifying User-Agent and at most one request per second, so calls are serialised and cached.
- Walking routes: the OSRM foot profile hosted by FOSSGIS (routing.openstreetmap.de).
Instructions are turned into short spoken sentences here, and tiny unnamed zig-zags are merged.
"""
from __future__ import annotations

import json
import math
import threading
import time
import urllib.parse
import urllib.request
from functools import lru_cache

UA = "EYEDENTIFY-prototype/0.1 (assistive navigation hackathon demo)"
NOMINATIM = "https://nominatim.openstreetmap.org"
OSRM_FOOT = "https://routing.openstreetmap.de/routed-foot/route/v1/driving"
TIMEOUT = 10
MIN_STEP_M = 15          # turns shorter than this are folded into the next instruction

_nominatim_lock = threading.Lock()
_last_nominatim = 0.0


class NavError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


def _get(url: str) -> object:
    req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Language": "en-IN,en"})
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT) as res:
            return json.load(res)
    except urllib.error.HTTPError as e:
        raise NavError(f"The map service answered with HTTP {e.code}.") from e
    except (urllib.error.URLError, TimeoutError, OSError) as e:
        raise NavError("The map service didn't answer in time. Try again.") from e


def _nominatim(path: str, params: dict) -> object:
    global _last_nominatim
    with _nominatim_lock:  # at most one request per second, as Nominatim asks
        wait = 1.05 - (time.monotonic() - _last_nominatim)
        if wait > 0:
            time.sleep(wait)
        try:
            return _get(f"{NOMINATIM}/{path}?{urllib.parse.urlencode(params)}")
        finally:
            _last_nominatim = time.monotonic()


def haversine(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    r = 6371000.0
    p1, p2 = math.radians(lat1), math.radians(lat2)
    dp, dl = p2 - p1, math.radians(lon2 - lon1)
    a = math.sin(dp / 2) ** 2 + math.cos(p1) * math.cos(p2) * math.sin(dl / 2) ** 2
    return 2 * r * math.asin(math.sqrt(a))


# ---------------------------------------------------------------- search & reverse

@lru_cache(maxsize=256)
def _search_cached(q: str, lat: float, lon: float) -> tuple:
    params = {"q": q, "format": "jsonv2", "limit": 6, "addressdetails": 1}
    if lat or lon:
        d = 0.15  # bias results towards ~15 km around the user
        params.update(viewbox=f"{lon - d},{lat + d},{lon + d},{lat - d}")
    return tuple(json.dumps(x) for x in _nominatim("search", params))


def search(q: str, lat: float = 0.0, lon: float = 0.0) -> dict:
    q = (q or "").strip()[:120]
    if len(q) < 2:
        raise NavError("Type at least two letters to search.", 400)
    results = []
    for raw in _search_cached(q, round(lat, 3), round(lon, 3)):
        x = json.loads(raw)
        plat, plon = float(x["lat"]), float(x["lon"])
        name = x.get("name") or x.get("display_name", "").split(",")[0]
        addr = x.get("address", {})
        area = ", ".join(v for v in (addr.get("road"), addr.get("suburb") or addr.get("neighbourhood"), addr.get("city") or addr.get("town") or addr.get("state")) if v and v != name)
        results.append({
            "name": name, "area": area, "lat": plat, "lon": plon,
            "distance_m": round(haversine(lat, lon, plat, plon)) if (lat or lon) else None,
        })
    if lat or lon:
        results.sort(key=lambda r: r["distance_m"])
    return {"results": results}


@lru_cache(maxsize=512)
def _reverse_cached(lat: float, lon: float) -> str:
    return json.dumps(_nominatim("reverse", {"lat": lat, "lon": lon, "format": "jsonv2", "zoom": 18, "addressdetails": 1}))


def reverse(lat: float, lon: float) -> dict:
    data = json.loads(_reverse_cached(round(lat, 5), round(lon, 5)))
    if "error" in data:
        raise NavError("I couldn't find a street name for this spot.", 404)
    a = data.get("address", {})
    road = a.get("road") or a.get("pedestrian") or a.get("footway")
    place = data.get("name") if data.get("name") and data.get("name") != road else None
    area = a.get("suburb") or a.get("neighbourhood") or a.get("quarter")
    city = a.get("city") or a.get("town") or a.get("village") or a.get("state_district")
    parts = []
    if place:
        parts.append(f"near {place}")
    if road:
        parts.append(f"on {road}")
    where = " ".join(parts) or "here"
    spoken = f"You are {where}" + (f", in {area}" if area else "") + (f", {city}" if city and city != area else "") + "."
    return {"spoken": spoken, "road": road, "area": area, "city": city, "label": data.get("display_name", "")}


# ---------------------------------------------------------------- routing

CARDINALS = ["north", "north-east", "east", "south-east", "south", "south-west", "west", "north-west"]


def cardinal(bearing: float) -> str:
    return CARDINALS[round((bearing % 360) / 45) % 8]


def _onto(name: str) -> str:
    return f" onto {name}" if name else ""


def instruction(step: dict) -> str:
    m = step["maneuver"]
    t, mod = m.get("type", ""), m.get("modifier", "")
    name = step.get("name", "").split(";")[0].strip()  # "A Lane;B Lane" -> "A Lane"
    if t == "depart":
        return f"Head {cardinal(m.get('bearing_after', 0))}" + (f" on {name}" if name else "")
    if t == "arrive":
        side = f" on your {mod}" if mod in ("left", "right") else ""
        return f"You have arrived. Your destination is{side or ' here'}"
    if t in ("roundabout", "rotary", "roundabout turn"):
        ex = m.get("exit")
        return f"At the roundabout, take the {_ordinal(ex)} exit" + _onto(name) if ex else "Go around the roundabout" + _onto(name)
    if mod == "uturn":
        return "Turn around" + _onto(name)
    if mod in ("straight", "") or t in ("new name", "continue") and mod in ("straight", ""):
        return "Continue straight" + _onto(name)
    if mod.startswith("slight"):
        return f"Keep slightly {mod.split()[-1]}" + _onto(name)
    if mod.startswith("sharp"):
        return f"Turn sharply {mod.split()[-1]}" + _onto(name)
    return f"Turn {mod}" + _onto(name)


def _ordinal(n: int) -> str:
    return {1: "first", 2: "second", 3: "third", 4: "fourth", 5: "fifth"}.get(n, f"number {n}")


def route(flat: float, flon: float, tlat: float, tlon: float) -> dict:
    if haversine(flat, flon, tlat, tlon) > 25000:
        raise NavError("That place is more than 25 km away. Walking directions work for nearby places.", 400)
    url = f"{OSRM_FOOT}/{flon},{flat};{tlon},{tlat}?overview=full&geometries=geojson&steps=true"
    data = _get(url)
    if data.get("code") != "Ok" or not data.get("routes"):
        raise NavError("No walking route was found to that place.", 404)
    r = data["routes"][0]
    raw = r["legs"][0]["steps"]

    steps: list[dict] = []
    carry = 0.0
    for i, s in enumerate(raw):
        t = s["maneuver"]["type"]
        # Fold short, unnamed in-between turns into the next instruction to keep speech calm.
        short_unnamed = s["distance"] < MIN_STEP_M and not s.get("name") and t not in ("depart", "arrive") and i + 1 < len(raw)
        if short_unnamed:
            carry += s["distance"]
            continue
        lon, lat = s["maneuver"]["location"]
        steps.append({
            "instruction": instruction(s),
            "distance": round(s["distance"] + carry),   # metres walked after this manoeuvre
            "location": [lat, lon],
            "type": t,
            "modifier": s["maneuver"].get("modifier", ""),
            "name": s.get("name", ""),
        })
        carry = 0.0
    coords = [[lat, lon] for lon, lat in r["geometry"]["coordinates"]]
    minutes = max(1, round(r["distance"] / 1.25 / 60))  # ~4.5 km/h, a careful walking pace
    return {"distance": round(r["distance"]), "minutes": minutes, "geometry": coords, "steps": steps}
