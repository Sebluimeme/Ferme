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

    def mature_observation(self, d=59, slope=0, q=70, demand=1, last_age=1200, no_response=False):
        self.h.configure()
        self.h.set(D, d)
        self.h.set(B, 65)
        self.h.set(OBS, json.dumps({
            'r': 1, 'q': q, 'at': self.h.time-last_age,
            'h': [[self.h.time-900, d-slope*15], [self.h.time-600, d-slope*10], [self.h.time-300, d-slope*5]],
            'n': 2 if demand else 0, 'dir': 1 if demand else 0, 'w': self.h.time-3600,
            'b': d if no_response else None, 'bt': self.h.time-2400 if no_response else 0,
            's': 2, 'a': demand, 'tick': self.h.time-60,
        }))

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
        for _ in range(100):
            self.h.tick(d=51)
        self.assertEqual(self.h.status()["reason"], "no_heat_response")
        previous = json.loads(self.h.entities[OBS].state)["q"]
        for _ in range(20):
            self.assertEqual(self.h.tick(d=51)["q"], previous)

    def test_warming_wood_keeps_resting_setpoint(self):
        self.h.configure()
        initial = self.h.observe()["q"]
        for minute in range(1, 21):
            self.h.tick(d=56+minute*0.3)
            self.assertLessEqual(json.loads(self.h.entities[OBS].state)["q"], initial)
        self.assertEqual(json.loads(self.h.entities[OBS].state)["q"], 50)

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

    def test_automatic_simulation_starts_at_rest_and_remains_bounded(self):
        for initial in [90,50,"unknown"]:
            self.h = Harness()
            self.h.set("climate.chaudiere_fioul", "off", attributes={"temperature": initial})
            self.h.configure()
            self.assertEqual(self.h.observe()["q"], 50)
            for _ in range(30):
                q = self.h.tick(d=51)["q"]
                self.assertGreaterEqual(q, 50)
                self.assertLessEqual(q, 85)

    def test_60_stable_immediately_returns_70_to_50_despite_cooldown_and_no_response(self):
        self.mature_observation(d=60, slope=0, q=70, last_age=60, no_response=True)
        o = self.h.observe()
        self.assertEqual(o['q'], 50)
        self.assertEqual(o['at'], self.h.time)
        self.assertEqual(o['a'], 0)
        self.assertEqual(o['bt'], 0)
        self.assertEqual(self.h.status()['reason'], 'releasing_observation')
        self.assertFalse(self.h.status()['heat_demand'])
        self.assertEqual(self.h.status()['resting_temperature'], 50)

    def test_hot_tank_returns_to_rest_without_waiting_for_trend(self):
        self.h.configure()
        self.h.set(D, 60)
        o = self.h.observe()
        self.assertEqual(o['q'], 50)
        self.assertEqual(self.h.status()['reason'], 'resting_observation')

    def test_59_stable_stays_at_50_after_disengagement(self):
        self.mature_observation(d=60, q=70)
        self.h.observe()
        for _ in range(25):
            o = self.h.tick(d=59)
            self.assertEqual(o['q'], 50)
            self.assertEqual(o['a'], 0)
        self.assertEqual(self.h.status()['reason'], 'resting_observation')

    def test_59_rising_fast_enough_releases_support_before_60(self):
        self.mature_observation(d=59, slope=0.1, q=70, last_age=60)
        o = self.h.observe()
        self.assertEqual(o['q'], 50)
        self.assertEqual(o['a'], 0)
        self.assertEqual(self.h.status()['reason'], 'releasing_observation')

    def test_59_falling_restarts_gradually_after_confirmations(self):
        self.mature_observation(d=59, slope=-0.2, q=50, demand=0)
        o = self.h.observe()
        self.assertEqual(o['a'], 0)
        self.assertEqual(self.h.status()['reason'], 'stabilizing')
        self.assertEqual(o['q'], 50)
        self.assertEqual(self.h.tick(d=58.8)['q'], 50)
        o = self.h.tick(d=58.6)
        self.assertEqual(o['q'], 51)
        self.assertEqual(o['a'], 1)
        for _ in range(9):
            self.assertEqual(self.h.tick(d=58.6)['q'], 51)

    def test_heat_demand_latches_until_upper_limit_and_then_clears(self):
        self.mature_observation(d=59, slope=0, q=61, demand=1)
        self.assertEqual(self.h.observe()['q'], 62)
        for _ in range(10):
            o = self.h.tick(d=59)
            self.assertEqual(o['a'], 1)
        self.assertEqual(o['q'], 63)
        o = self.h.tick(d=60)
        self.assertEqual(o['q'], 50)
        self.assertEqual(o['a'], 0)

    def test_resting_decision_requires_both_fresh_sensors(self):
        self.mature_observation(d=60, q=70)
        self.h.set(B, 'unavailable')
        o = self.h.observe()
        self.assertEqual(o['q'], 70)
        self.assertEqual(self.h.status()['reason'], 'sensor_b_unavailable')
        self.assertIsNone(self.h.status()['recommended_temperature'])

    def test_outage_preserves_heat_demand_and_setpoint_until_history_recovers(self):
        self.mature_observation(d=59, q=70, demand=1)
        self.h.set(B, 'unavailable')
        o = self.h.observe()
        self.assertEqual(o['a'], 1)
        self.assertEqual(o['q'], 70)
        self.assertEqual(o['h'], [])
        for _ in range(9):
            o = self.h.tick(d=59)
            self.assertEqual(o['a'], 1)
            self.assertEqual(o['q'], 70)
            self.assertIsNone(self.h.status()['trend_c_per_minute'])
        o = self.h.tick(d=60)
        self.assertEqual(o['a'], 0)
        self.assertEqual(o['q'], 50)

    def test_long_observer_gap_preserves_demand_instead_of_assuming_rest(self):
        self.mature_observation(d=59, q=70, demand=1)
        self.h.time += 3600
        self.h.set(D, 59)
        self.h.set(B, 65)
        o = self.h.observe()
        self.assertEqual(o['a'], 1)
        self.assertEqual(o['q'], 70)
        self.assertIsNone(self.h.status()['trend_c_per_minute'])

    def test_unknown_trend_does_not_mean_no_heat_demand(self):
        self.mature_observation(d=59, q=70, demand=0)
        self.h.set(B, 'unavailable')
        self.h.observe()
        o = self.h.tick(d=59)
        self.assertEqual(o['q'], 70)
        self.assertEqual(self.h.status()['reason'], 'warming_up')
        for _ in range(10):
            o = self.h.tick(d=59)
        self.assertEqual(o['q'], 50)

    def test_early_release_does_not_ignore_a_recent_cooling_reversal(self):
        self.mature_observation(d=59.5, q=70, demand=1)
        p = json.loads(self.h.entities[OBS].state)
        p['h'] = [[self.h.time-900,55],[self.h.time-600,58],[self.h.time-300,60]]
        self.h.set(OBS,json.dumps(p))
        o = self.h.observe()
        self.assertGreater(self.h.status()['trend_c_per_minute'], 0)
        self.assertGreaterEqual(o['q'],70)
        self.assertEqual(o['a'],1)
        self.assertNotEqual(self.h.status()['reason'],'releasing_observation')

    def test_new_support_detects_fast_recent_cooling_despite_earlier_rise(self):
        self.mature_observation(d=59.5, q=50, demand=0)
        p = json.loads(self.h.entities[OBS].state)
        p['h'] = [[self.h.time-900,55],[self.h.time-600,58],[self.h.time-300,60.5]]
        self.h.set(OBS,json.dumps(p))
        o = self.h.observe()
        self.assertEqual(o['a'],0)
        self.assertEqual(o['q'],50)
        self.assertEqual(self.h.status()['reason'],'stabilizing')

    def test_recent_strong_warming_prevents_raise_based_on_old_cooling(self):
        self.mature_observation(d=59, q=70, demand=1)
        p = json.loads(self.h.entities[OBS].state)
        p['h'] = [[self.h.time-900,62],[self.h.time-600,60],[self.h.time-300,58]]
        self.h.set(OBS,json.dumps(p))
        o = self.h.observe()
        self.assertLess(self.h.status()['trend_c_per_minute'], 0)
        self.assertEqual(o['q'],70)
        self.assertEqual(o['dir'],0)

    def test_new_heat_demand_attribute_is_boolean(self):
        self.h.configure()
        self.h.observe()
        self.assertIs(self.h.status()['heat_demand'], False)
        self.mature_observation(d=59, slope=-0.2, q=50, demand=0)
        self.h.observe()
        self.h.tick(d=58.8)
        self.h.tick(d=58.6)
        self.assertIs(self.h.status()['heat_demand'], True)

    def test_no_response_does_not_block_ramp_below_useful_setpoint(self):
        self.h.configure()
        self.h.observe()
        for _ in range(100):
            o = self.h.tick(d=57,b=60)
            self.assertNotEqual(self.h.status()['reason'],'no_heat_response')
            self.assertEqual(o['bt'],0)
        self.assertGreater(o['q'],53)
        self.assertLess(o['q'],62)
        for _ in range(55):
            o = self.h.tick(d=57,b=60)
        self.assertGreaterEqual(o['q'],62)
        self.assertEqual(self.h.status()['reason'],'no_heat_response')

    def test_useful_setpoint_beyond_cap_never_raises_above_85(self):
        self.mature_observation(d=57,q=84,demand=1)
        self.h.set(B,90)
        self.h.observe()
        for _ in range(35):
            o = self.h.tick(d=57,b=90)
            self.assertLessEqual(o['q'],85)
            self.assertEqual(o['bt'],0)
        self.assertEqual(o['q'],85)

    def test_full_observation_fits_input_text_with_maximum_revision(self):
        template = next(step['variables']['next_observation'] for step in PACKAGE['automation'][0]['actions'] if 'next_observation' in step.get('variables', {}))
        context = {'config':{'r':999999998}, 'proposed':85, 'current_time':1792684800,
                   'changed':True, 'last':1792684200,
                   'history':[[1792683900,109.99],[1792684200,109.99],[1792684500,109.99],[1792684800,109.99]],
                   'confirmations':3, 'direction':1, 'warming_since':1792683000,
                   'response_base':109.99, 'response_at':1792684000, 'reason_code':12,
                   'heat_demand':True, 'same_configuration':True, 'previous':{'a':1}}
        rendered = str(self.h.render(template,context))
        self.assertLessEqual(len(rendered),255)
        self.assertEqual(json.loads(rendered)['a'],1)

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
