#!/usr/bin/env python3
"""Execute the delivered HA YAML/Jinja against an isolated state model.

Requires PyYAML and Jinja2. No network, Home Assistant instance or actuator calls.
This deliberately evaluates the package's templates, not a second controller.
"""
import ast
import copy
from datetime import datetime, timezone
import json
import math
from pathlib import Path
import re
from types import SimpleNamespace
import unittest

import jinja2
import yaml

ROOT = Path(__file__).resolve().parents[1]
PACKAGE = yaml.safe_load((ROOT / "integrations/home-assistant/ferme_chauffage.yaml").read_text())
CFG = "input_text.ferme_chauffage_configuration"
OBS = "input_text.ferme_chauffage_observation"
D = "sensor.esphome_web_61063e_tampon_haut"
B = "sensor.batiment_b_ballon_b"


class ResultDict(dict):
    """HA ResultWrapper preserves rendered JSON when cv.string is requested."""
    def __init__(self, value, rendered):
        super().__init__(value)
        self.rendered = rendered

    def __str__(self):
        return self.rendered


class ScriptStop(Exception):
    def __init__(self, reason, error=False):
        self.reason, self.error = reason, error


def from_json(value, default=None):
    try:
        return json.loads(value)
    except (TypeError, ValueError):
        return default


def is_number(value):
    try:
        return math.isfinite(float(value))
    except (TypeError, ValueError):
        return False


class States:
    def __init__(self, harness):
        self.harness = harness

    def __call__(self, entity):
        return self.harness.entities.get(entity, SimpleNamespace(state="unknown")).state

    def __getattr__(self, domain):
        return SimpleNamespace(**{key.split(".", 1)[1]: value for key, value in self.harness.entities.items() if key.startswith(domain + ".")})


class Harness:
    def __init__(self):
        self.time = 1792663200
        self.entities = {}
        self.calls = []
        self.templates = {}
        self.env = jinja2.Environment(undefined=jinja2.StrictUndefined)
        self.env.filters.update(from_json=from_json, to_json=lambda value: json.dumps(value, separators=(",", ":")), regex_match=lambda value, pattern: bool(re.match(pattern, value)))
        self.env.globals.update(states=States(self), state_attr=self.state_attr, is_number=is_number,
                                now=lambda: datetime.fromtimestamp(self.time, timezone.utc), as_timestamp=self.timestamp)
        self.set(D, 56)
        self.set(B, 60)
        self.set("climate.chaudiere_fioul", "off", attributes={"temperature": 60})

    def set(self, entity, state, age=0, attributes=None):
        attrs = {"unit_of_measurement": "°C"} if entity in [D, B] else {}
        attrs.update(attributes or {})
        self.entities[entity] = SimpleNamespace(state=str(state), last_reported=datetime.fromtimestamp(self.time - age, timezone.utc), attributes=attrs)

    def state_attr(self, entity, attr):
        state = self.entities.get(entity)
        return state.attributes.get(attr) if state else None

    @staticmethod
    def timestamp(value, default=None):
        try:
            return value.timestamp() if isinstance(value, datetime) else float(value)
        except (AttributeError, TypeError, ValueError):
            return default

    def render(self, value, context):
        if not isinstance(value, str) or not any(marker in value for marker in ["{{", "{%"]):
            return value
        if value not in self.templates:
            self.templates[value] = self.env.from_string(value)
        rendered = self.templates[value].render(**context).strip()
        try:
            parsed = ast.literal_eval(rendered)
            return ResultDict(parsed, rendered) if isinstance(parsed, dict) else parsed if not isinstance(parsed, str) else rendered
        except (ValueError, SyntaxError):
            return rendered

    def execute(self, actions, context):
        for action in actions:
            if "variables" in action:
                for key, template in action["variables"].items():
                    context[key] = self.render(template, context)
            elif "if" in action:
                if self.render(action["if"], context):
                    self.execute(action["then"], context)
                elif "else" in action:
                    self.execute(action["else"], context)
            elif "stop" in action:
                raise ScriptStop(action["stop"], action.get("error", False))
            elif "condition" in action:
                if not self.render(action["value_template"], context):
                    raise ScriptStop("condition_failed", True)
            elif "action" in action:
                service = action["action"]
                assert service == "input_text.set_value", service
                entity = action["target"]["entity_id"]
                assert entity in [CFG, OBS], entity
                value = str(self.render(action["data"]["value"], context))
                assert len(value) <= 255, (len(value), value)
                self.calls.append((service, entity, value))
                self.set(entity, value)
            else:
                raise AssertionError(f"Unhandled action: {action}")

    def configure(self, **kwargs):
        payload = dict(mode="automatic", manual_temperature=60, minimum_d=58, request_id="test_1", expires_at=self.time + 60, expected_revision=0)
        payload.update(kwargs)
        try:
            self.execute(PACKAGE["script"]["ferme_chauffage_configurer"]["sequence"], payload)
        except ScriptStop as stop:
            return stop.reason
        return "applied"

    def observe(self, trigger="time_pattern"):
        context = {"trigger": SimpleNamespace(platform=trigger)}
        self.execute(PACKAGE["automation"][0]["actions"], context)
        return json.loads(self.entities[OBS].state)

    def tick(self, minutes=1, d=56, b=60):
        self.time += minutes * 60
        self.set(D, d)
        self.set(B, b)
        return self.observe()

    def status(self):
        sensor = PACKAGE["template"][0]["sensor"][0]
        return {"state": self.render(sensor["state"], {}), **{key: self.render(value, {}) for key, value in sensor["attributes"].items()}}


class HeatingPackageTests(unittest.TestCase):
    def setUp(self):
        self.h = Harness()

    def test_all_actions_are_only_internal_input_text_writes(self):
        def walk(item):
            if isinstance(item, dict):
                if "action" in item:
                    self.assertEqual(item["action"], "input_text.set_value")
                    self.assertIn(item["target"]["entity_id"], [CFG, OBS])
                for value in item.values():
                    walk(value)
            elif isinstance(item, list):
                for value in item:
                    walk(value)
        walk(PACKAGE)
        attrs = PACKAGE["template"][0]["sensor"][0]["attributes"]
        self.assertEqual(attrs["calibration_valid"], "{{ false }}")
        self.assertEqual(attrs["actuation_enabled"], "{{ false }}")
        self.assertIs(self.h.render(attrs["calibration_valid"], {}), False)
        self.assertIs(self.h.render(attrs["actuation_enabled"], {}), False)
        self.assertEqual(set(PACKAGE["input_text"]), {CFG.split(".")[1], OBS.split(".")[1]})
        self.assertEqual(PACKAGE["script"]["ferme_chauffage_configurer"]["mode"], "queued")

    def test_default_is_manual_observation(self):
        self.h.observe()
        s = self.h.status()
        self.assertEqual(s["mode"], "manual")
        self.assertEqual(s["reason"], "manual_observation")
        self.assertEqual(s["manual_temperature"], 60)
        self.assertFalse(s["actuation_enabled"])

    def test_config_atomic_revision_and_round_trip(self):
        self.assertEqual(self.h.configure(mode="manual", manual_temperature=72, minimum_d=57), "applied")
        self.assertEqual(len(self.h.calls), 1)
        c = json.loads(self.h.entities[CFG].state)
        self.assertEqual(c, dict(v=1, r=1, m="manual", t=72, d=57, id="test_1"))
        self.h.observe()
        self.assertEqual(self.h.status()["recommended_temperature"], 72)

    def test_manual_can_prepare_90_but_cannot_actuate(self):
        self.assertEqual(self.h.configure(mode="manual", manual_temperature=90), "applied")
        self.h.observe()
        self.assertEqual(self.h.status()["recommended_temperature"], 90)
        self.assertIsNone(self.h.status()["commissioned_maximum"])
        self.assertFalse(self.h.status()["calibration_valid"])

    def test_invalid_requests_never_write(self):
        for patch in [dict(mode="auto"), dict(manual_temperature=49), dict(manual_temperature=91), dict(manual_temperature=70.5), dict(manual_temperature="70"), dict(minimum_d=39), dict(minimum_d=76), dict(minimum_d=57.5), dict(request_id="x/../../service"), dict(request_id="x"*49), dict(expires_at="tomorrow"), dict(expected_revision=-1), dict(expected_revision=0.1)]:
            with self.subTest(patch=patch):
                self.assertEqual(self.h.configure(**patch), "invalid_request")
                self.assertEqual(self.h.calls, [])

    def test_ttl_and_concurrency(self):
        self.assertEqual(self.h.configure(expires_at=self.h.time), "request_expired")
        self.assertEqual(self.h.configure(expires_at=self.h.time + 121), "request_expired")
        self.assertEqual(self.h.configure(expected_revision=2), "revision_conflict")
        self.assertEqual(self.h.calls, [])
        self.assertEqual(self.h.configure(), "applied")
        self.assertEqual(self.h.configure(request_id="second", expected_revision=0), "revision_conflict")
        self.assertEqual(self.h.configure(request_id="second", expected_revision=1), "applied")
        self.assertEqual(json.loads(self.h.entities[CFG].state)["r"], 2)

    def test_duplicate_id_is_noop_even_after_expiry_and_cannot_change_payload(self):
        self.assertEqual(self.h.configure(), "applied")
        self.h.time += 180
        self.assertEqual(self.h.configure(expires_at=self.h.time - 1), "already_applied")
        self.assertEqual(len(self.h.calls), 1)
        self.assertEqual(self.h.configure(manual_temperature=75), "request_id_reused")

    def test_corrupted_configuration_refuses_command(self):
        for malformed in ['{broken', 'null', 'false', '[]', '{"v":1}']:
            with self.subTest(malformed=malformed):
                self.h.set(CFG, malformed)
                self.assertEqual(self.h.configure(), "configuration_invalid")
                self.h.observe()
                self.assertEqual(self.h.status()["reason"], "configuration_invalid")
                self.assertIsNone(self.h.status()["recommended_temperature"])

    def test_corrupted_values_reset_observation_and_invalid_config_suspends(self):
        self.h.configure()
        self.h.set(OBS, '{"q":"not a temperature","at":[]}')
        self.h.observe()
        self.assertEqual(self.h.status()["reason"], "warming_up")
        c = json.loads(self.h.entities[CFG].state)
        c["d"] = "invalid"
        self.h.set(CFG, json.dumps(c))
        self.h.observe()
        self.assertEqual(self.h.status()["reason"], "configuration_invalid")

    def test_unavailable_invalid_units_and_restored_are_not_zero(self):
        self.h.configure()
        for entity, reason in [(D, "sensor_d_unavailable"), (B, "sensor_b_unavailable")]:
            for bad in ["unavailable", "unknown", "nan", "inf", "bad", "-1", "111"]:
                with self.subTest(entity=entity, bad=bad):
                    self.h.set(D, 56)
                    self.h.set(B, 60)
                    self.h.set(entity, bad)
                    self.h.observe()
                    s = self.h.status()
                    self.assertEqual(s["phase"], "suspended")
                    self.assertEqual(s["reason"], reason)
                    self.assertIsNone(s["recommended_temperature"])
            self.h.set(D, 56)
            self.h.set(B, 60)
            self.h.set(entity, 59, attributes={"unit_of_measurement": "°F"})
            self.h.observe()
            self.assertEqual(self.h.status()["reason"], reason)
            self.h.set(entity, 59, attributes={"restored": True})
            self.h.observe()
            self.assertEqual(self.h.status()["reason"], reason)

    def test_stale_and_future_readings_suspend(self):
        for entity, reason in [(D, "sensor_d_stale"), (B, "sensor_b_stale")]:
            for age in [301, 7200, -20]:
                self.h.set(D, 56)
                self.h.set(B, 60)
                self.h.set(entity, 60, age=age)
                self.h.observe()
                self.assertEqual(self.h.status()["reason"], reason)
                self.assertIsNone(self.h.status()["recommended_temperature"])

    def test_zero_is_valid_and_no_temperature_is_invented(self):
        self.h.set(D, 0)
        self.h.observe()
        self.assertEqual(self.h.status()["observed_temperature_d"], 0)
        self.h.set(D, "unavailable")
        self.h.observe()
        self.assertIsNone(self.h.status()["observed_temperature_d"])

    def test_waits_ten_minutes_and_requires_trend(self):
        self.h.configure()
        initial = self.h.observe()["q"]
        for _ in range(11):
            self.assertEqual(self.h.tick()["q"], initial)
        self.assertEqual(self.h.tick()["q"], initial + 1)
        self.assertEqual(self.h.status()["next_adjustment_at"], self.h.time + 600)
        self.assertEqual(self.h.tick()["q"], initial + 1)

    def test_max_two_degree_step_and_ten_minute_cooldown(self):
        self.h.configure()
        last = self.h.observe()
        changes = []
        for _ in range(39):
            current = self.h.tick(d=51)
            if current["q"] != last["q"]:
                self.assertLessEqual(abs(current["q"] - last["q"]), 2)
                changes.append(self.h.time)
            last = current
        self.assertGreaterEqual(len(changes), 2)
        self.assertTrue(all(right-left >= 600 for left, right in zip(changes, changes[1:])))

    def test_absence_of_heat_response_suspends_instead_of_escalating(self):
        self.h.configure()
        self.h.observe()
        for _ in range(43):
            self.h.tick(d=51)
        self.assertEqual(self.h.status()["reason"], "no_heat_response")
        previous = json.loads(self.h.entities[OBS].state)["q"]
        for _ in range(20):
            self.assertEqual(self.h.tick(d=51)["q"], previous)

    def test_warming_wood_prevents_escalation_then_reduces_gradually(self):
        self.h.configure()
        initial = self.h.observe()["q"]
        for minute in range(1, 21):
            self.h.tick(d=56+minute*0.3)
            self.assertLessEqual(json.loads(self.h.entities[OBS].state)["q"], initial)
        self.assertLess(json.loads(self.h.entities[OBS].state)["q"], initial)

    def test_short_variations_do_not_reverse_the_setpoint(self):
        self.h.configure()
        initial = self.h.observe()["q"]
        for minute in range(30):
            self.h.tick(d=59.9 if minute % 2 else 60.1)
        self.assertEqual(json.loads(self.h.entities[OBS].state)["q"], initial)

    def test_restart_and_long_gap_reset_warmup(self):
        self.h.configure()
        self.h.observe()
        for _ in range(12):
            self.h.tick()
        self.h.observe(trigger="homeassistant")
        self.assertEqual(self.h.status()["reason"], "warming_up")
        initial = json.loads(self.h.entities[OBS].state)["q"]
        for _ in range(9):
            self.assertEqual(self.h.tick()["q"], initial)
        self.h.time += 3600
        self.h.set(D, 56)
        self.h.set(B, 60)
        self.h.observe()
        self.assertEqual(self.h.status()["reason"], "warming_up")

    def test_automatic_simulation_clamps_initial_value_and_limits(self):
        for initial, expect in [(90,85),(50,50),("unknown",60)]:
            self.h = Harness()
            self.h.set("climate.chaudiere_fioul", "off", attributes={"temperature": initial})
            self.h.configure()
            self.assertEqual(self.h.observe()["q"], expect)
            for _ in range(30):
                q = self.h.tick(d=70 if expect == 50 else 51)["q"]
                self.assertGreaterEqual(q, 50)
                self.assertLessEqual(q, 85)

    def test_lost_observer_is_visible_and_recommendation_expires(self):
        self.h.observe()
        self.h.time += 181
        self.assertEqual(self.h.status()["reason"], "observer_stale")
        self.assertEqual(self.h.status()["phase"], "suspended")
        self.assertIsNone(self.h.status()["recommended_temperature"])

    def test_trend_spans_ten_to_fifteen_minutes_and_outage_discards_history(self):
        self.h.configure()
        self.h.observe()
        for minute in range(1, 26):
            o = self.h.tick(d=56 + minute * 0.1)
            if minute >= 10:
                self.assertGreaterEqual(o["h"][-1][0] - o["h"][0][0], 600)
                self.assertLessEqual(o["h"][-1][0] - o["h"][0][0], 900)
                self.assertAlmostEqual(self.h.status()["trend_c_per_minute"], 0.1, places=2)
        self.h.set(B, "unavailable")
        self.assertEqual(self.h.observe()["h"], [])
        prior = json.loads(self.h.entities[OBS].state)["q"]
        for _ in range(9):
            self.assertEqual(self.h.tick(d=51)["q"], prior)
            self.assertIsNone(self.h.status()["trend_c_per_minute"])

    def test_every_template_parses(self):
        def walk(value):
            if isinstance(value, str) and any(marker in value for marker in ["{{", "{%"]):
                self.h.env.parse(value)
            elif isinstance(value, dict):
                for item in value.values():
                    walk(item)
            elif isinstance(value, list):
                for item in value:
                    walk(item)
        walk(PACKAGE)


if __name__ == "__main__":
    unittest.main(verbosity=2)
