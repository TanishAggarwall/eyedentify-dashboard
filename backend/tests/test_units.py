"""Unit tests for pure helpers: navigation wording, distance maths, OCR tidy-up, NMS and demo answers."""
import numpy as np
import pytest

import ai
import nav
from detector import YoloDetector
from reader import _tidy


# ---------------------------------------------------------------- navigation

def test_haversine_known_distance():
    # India Gate to Rashtrapati Bhavan, about 3 km apart.
    d = nav.haversine(28.6129, 77.2295, 28.6143, 77.1994)
    assert 2800 < d < 3100


def test_haversine_zero():
    assert nav.haversine(10, 10, 10, 10) == pytest.approx(0, abs=1e-6)


@pytest.mark.parametrize("bearing,expected", [
    (0, "north"), (44, "north-east"), (90, "east"), (180, "south"), (270, "west"), (359, "north"), (-90, "west"),
])
def test_cardinal(bearing, expected):
    assert nav.cardinal(bearing) == expected


def step(type_, modifier="", name="", **extra):
    return {"maneuver": {"type": type_, "modifier": modifier, **extra}, "name": name}


@pytest.mark.parametrize("s,expected", [
    (step("depart", bearing_after=90, name="MG Road"), "Head east on MG Road"),
    (step("turn", "left", "Janpath"), "Turn left onto Janpath"),
    (step("turn", "slight right"), "Keep slightly right"),
    (step("turn", "sharp left", "Ring Road"), "Turn sharply left onto Ring Road"),
    (step("turn", "uturn"), "Turn around"),
    (step("new name", "straight", "Rajpath"), "Continue straight onto Rajpath"),
    (step("roundabout", "right", "Kartavya Path", exit=2), "At the roundabout, take the second exit onto Kartavya Path"),
    (step("arrive", "left"), "You have arrived. Your destination is on your left"),
    (step("arrive"), "You have arrived. Your destination is here"),
    (step("turn", "right", "A Lane;B Lane"), "Turn right onto A Lane"),
])
def test_instruction_wording(s, expected):
    assert nav.instruction(s) == expected


def test_route_folds_short_unnamed_steps(monkeypatch):
    fake = {
        "code": "Ok",
        "routes": [{
            "distance": 300.0,
            "geometry": {"coordinates": [[77.0, 28.0], [77.001, 28.001]]},
            "legs": [{"steps": [
                {"maneuver": {"type": "depart", "bearing_after": 0, "location": [77.0, 28.0]}, "name": "", "distance": 100.0},
                {"maneuver": {"type": "turn", "modifier": "left", "location": [77.0, 28.0009]}, "name": "", "distance": 5.0},
                {"maneuver": {"type": "turn", "modifier": "right", "location": [77.0001, 28.001]}, "name": "Main St", "distance": 195.0},
                {"maneuver": {"type": "arrive", "modifier": "right", "location": [77.001, 28.001]}, "name": "", "distance": 0.0},
            ]}],
        }],
    }
    monkeypatch.setattr(nav, "_get", lambda url: fake)
    r = nav.route(28.0, 77.0, 28.001, 77.001)
    assert [s["instruction"] for s in r["steps"]] == [
        "Head north", "Turn right onto Main St", "You have arrived. Your destination is on your right",
    ]
    assert r["steps"][1]["distance"] == 200  # the 5 m unnamed turn is carried into the next step
    assert r["distance"] == 300 and r["minutes"] == 4
    assert r["geometry"][0] == [28.0, 77.0]  # [lat, lon] order for Leaflet


def test_route_without_result_is_404(monkeypatch):
    monkeypatch.setattr(nav, "_get", lambda url: {"code": "NoRoute", "routes": []})
    with pytest.raises(nav.NavError) as e:
        nav.route(28.0, 77.0, 28.001, 77.001)
    assert e.value.status == 404


# ---------------------------------------------------------------- reading

@pytest.mark.parametrize("raw,expected", [
    ("Rs40", "Rs 40"),
    ("Open8AM", "Open 8AM"),
    ("too   many    spaces", "too many spaces"),
    ("  trim me  ", "trim me"),
])
def test_tidy_ocr_text(raw, expected):
    assert _tidy(raw) == expected


# ---------------------------------------------------------------- detection

def test_nms_keeps_best_of_overlapping_boxes():
    boxes = np.array([[0, 0, 10, 10], [1, 1, 11, 11], [50, 50, 60, 60]], dtype=np.float32)
    scores = np.array([0.6, 0.9, 0.8], dtype=np.float32)
    assert YoloDetector._nms(boxes, scores, iou=0.5) == [1, 2]


def test_nms_keeps_separate_boxes():
    boxes = np.array([[0, 0, 10, 10], [20, 20, 30, 30]], dtype=np.float32)
    scores = np.array([0.5, 0.7], dtype=np.float32)
    assert sorted(YoloDetector._nms(boxes, scores, iou=0.5)) == [0, 1]


# ---------------------------------------------------------------- AI fallback

def test_ai_disabled_without_key():
    assert ai.enabled() is False


def test_demo_answer_matches_keys_question():
    assert "keys" in ai.demo_answer("Where did I put my keys?").lower()


def test_demo_answer_has_default():
    assert ai.demo_answer("something unrelated entirely")
