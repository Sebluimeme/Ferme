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
TX = "input_text.ferme_chauffage_transmission"
HIST = "input_text.ferme_chauffage_historique_d"
ACTIVE = "input_boolean.ferme_chauffage_commande_active"
LEGACY = "automation.nouvelle_automatisation_2"
D = "sensor.esphome_web_61063e_tampon_haut"
B = "sensor.batiment_b_ballon_b"
# Synthetic calibration for control-flow regression tests, NOT real hardware values.
SYNTHETIC_CALIBRATION = [
    {"temperature": 50, "level": -50, "verified": True},
    {"temperature": 60, "level": -10, "verified": True},
    {"temperature": 70, "level": 30, "verified": True},
]



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
    def __init__(self, calibration_override=SYNTHETIC_CALIBRATION):
        self.calibration_override = copy.deepcopy(calibration_override)
        self.time = 1792663200
        self.entities = {}
        self.calls = []
        self.servo_calls = []
        self.fail_servo = False
        self.before_service = None
        self.before_guard = None
        self.templates = {}
        self.env = jinja2.Environment(undefined=jinja2.StrictUndefined)
        self.env.filters.update(from_json=from_json, to_json=lambda value: json.dumps(value, separators=(",", ":")), regex_match=lambda value, pattern: bool(re.match(pattern, value)))
        self.env.globals.update(states=States(self), state_attr=self.state_attr, is_number=is_number,
                                now=lambda: datetime.fromtimestamp(self.time, timezone.utc), as_timestamp=self.timestamp,
                                as_datetime=lambda value: datetime.fromtimestamp(float(value), timezone.utc),
                                is_state=lambda entity, value: States(self)(entity) == value)
        self.set(D, 56)
        self.set(B, 60)
        self.set(ACTIVE, "off")
        self.set(LEGACY, "off")

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
                    context[key] = self.calibration_override if key == "calibration_points" and self.calibration_override is not None else self.render(template, context)
            elif "if" in action:
                if self.render(action["if"], context):
                    self.execute(action["then"], context)
                elif "else" in action:
                    self.execute(action["else"], context)
            elif "stop" in action:
                raise ScriptStop(action["stop"], action.get("error", False))
            elif "condition" in action:
                if self.before_guard:
                    callback, self.before_guard = self.before_guard, None
                    callback(self)
                if not self.render(action["value_template"], context):
                    raise ScriptStop("condition_failed", True)
            elif "action" in action:
                service = action["action"]
                if service == "esphome.batiment_b_control_servo":
                    level = self.render(action["data"]["level"], context)
                    assert -100 <= level <= 100 and context["calibration_ready"], level
                    self.servo_calls.append(level)
                    if self.fail_servo:
                        raise ScriptStop("simulated_api_failure", True)
                    continue
                assert service == "input_text.set_value", service
                entity = action["target"]["entity_id"]
                assert entity in [CFG, OBS, TX, HIST], entity
                value = str(self.render(action["data"]["value"], context))
                assert len(value) <= 255, (len(value), value)
                self.calls.append((service, entity, value))
                self.set(entity, value)
                if entity == TX and self.before_service and json.loads(value).get('s') == 'uncertain':
                    callback, self.before_service = self.before_service, None
                    callback(self)

            else:
                raise AssertionError(f"Unhandled action: {action}")

    def configure(self, **kwargs):
        payload = dict(mode="automatic", manual_temperature=60, minimum_d=57, request_id="test_1", expires_at=self.time + 60, expected_revision=0)
        payload.update(kwargs)
        try:
            self.execute(PACKAGE["script"]["ferme_chauffage_configurer"]["sequence"], payload)
        except ScriptStop as stop:
            return stop.reason
        return "applied"

    def observe(self, trigger="time_pattern"):
        context = {"trigger": SimpleNamespace(platform=trigger)}
        try:
            self.execute(PACKAGE["automation"][0]["actions"], context)
        except ScriptStop as stop:
            self.last_stop = stop.reason
        return json.loads(self.entities[OBS].state)

    def tick(self, minutes=1, d=56, b=60):
        self.time += minutes * 60
        self.set(D, d)
        self.set(B, b)
        return self.observe()

    def status(self):
        template = PACKAGE["template"][0]
        context = {}
        for key, value in template["variables"].items():
            context[key] = self.calibration_override if key == "calibration_points" and self.calibration_override is not None else self.render(value, context)
        sensor = template["sensor"][0]
        return {"state": self.render(sensor["state"], context), **{key: self.render(value, context) for key, value in sensor["attributes"].items()}}

    def read(self, entity):
        return json.loads(self.entities[entity].state)

    def transmitted(self, temperature=60, age=1200, revision=1, online=1):
        self.set(TX, json.dumps(dict(t=temperature, at=self.time-age, r=revision, try_=0, n=0, s="transmitted", online=online, seen=self.time, want=temperature)))

    def history(self, values):
        self.set(HIST, json.dumps(dict(at=self.time-120, v=[[(i-len(values)+1)*120, round(value*100)] for i,value in enumerate(values)])))


class HeatingPackageTests(unittest.TestCase):
    def setUp(self):
        self.h = Harness()

    def active_auto(self, d=56, b=60):
        self.assertEqual(self.h.configure(), "applied")
        self.h.set(ACTIVE, "on")
        self.h.set(D, d)
        self.h.set(B, b)

    def test_default_disabled_manual_and_native_types(self):
        self.h.observe()
        status = self.h.status()
        self.assertEqual(status['schema_version'], 2)
        self.assertEqual(status['mode'], 'manual')
        self.assertEqual(status['minimum_d'], 57)
        self.assertEqual(status['delivery_state'], 'disabled')
        self.assertIsNone(status['desired_temperature'])
        self.assertEqual(status['reason'], 'configuration_invalid')
        self.assertIs(status['calibration_valid'], True)
        self.assertIs(status['actuation_enabled'], False)
        self.assertIs(status['module_online'], True)
        self.assertIs(status['heat_demand'], False)
        self.assertEqual(self.h.servo_calls, [])
        self.assertNotIn('initial', PACKAGE['input_boolean'][ACTIVE.split('.')[1]])
        for helper in PACKAGE['input_text'].values():
            self.assertNotIn('initial', helper)

    def test_static_service_allowlist_and_failure_aborts(self):
        services = []
        def walk(value):
            if isinstance(value, dict):
                if 'action' in value:
                    services.append(value['action'])
                    self.assertNotIn('continue_on_error', value)
                for v in value.values(): walk(v)
            if isinstance(value, list):
                for v in value: walk(v)
        walk(PACKAGE)
        self.assertEqual(set(services), {'input_text.set_value', 'esphome.batiment_b_control_servo'})
        self.assertEqual(services.count('esphome.batiment_b_control_servo'), 1)
        self.assertEqual(PACKAGE['automation'][0]['mode'], 'single')
        self.assertEqual(PACKAGE['automation'][0]['id'], 'ferme_chauffage_observer')
        for key in ['calibration_valid','schema_version','fuel_minimum','fuel_maximum','release_temperature_d']:
            self.assertIn('{{',PACKAGE['template'][0]['sensor'][0]['attributes'][key])

    def test_production_calibration_and_status_share_the_same_verified_data(self):
        production=PACKAGE['automation'][0]['actions'][0]['variables']['calibration_points']
        self.assertEqual(production,PACKAGE['template'][0]['variables']['calibration_points'])
        points=self.h.render(production,{})
        self.assertEqual(points[0],{'temperature':50,'level':-56,'verified':True})
        self.assertEqual(points[1],{'temperature':60,'level':-18,'verified':True})
        self.assertEqual(points[2],{'temperature':70,'level':24,'verified':True})

    def test_preliminary_observations_remain_interpolation_fixtures_only(self):
        # Historical preliminary readings exercise arithmetic only. Production
        # uses its independently confirmed final table, including 50 -> -56.
        fixture=[{'temperature':50,'level':-50,'verified':True},{'temperature':60,'level':-18,'verified':True},{'temperature':70,'level':24,'verified':True}]
        for temperature,expected in [(50,-50),(51,-46.8),(55,-34),(60,-18),(61,-13.8),(62,-9.6),(65,3),(69,19.8),(70,24)]:
            with self.subTest(temperature=temperature):
                h=Harness(calibration_override=fixture)
                self.assertEqual(h.configure(mode='manual',manual_temperature=temperature),'applied')
                h.set(ACTIVE,'on');h.observe()
                self.assertEqual(h.servo_calls,[expected])
                self.assertIs(h.status()['calibration_valid'],True)
                self.assertEqual(h.status()['last_transmitted_temperature'],temperature)

    def test_real_production_calibration_never_extrapolates_80(self):
        h=Harness(calibration_override=None)
        self.assertEqual(h.configure(mode='manual',manual_temperature=80),'invalid_request')
        h.set(ACTIVE,'on');h.observe()
        self.assertEqual(h.servo_calls,[])
        h.configure();h.set(D,0);h.set(B,100);h.observe()
        self.assertEqual(h.read(OBS)['q'],70)
        self.assertEqual(h.servo_calls,[24])

    def test_final_production_calibration_points_and_intermediates_without_override(self):
        for temperature,expected in [(50,-56),(51,-52.2),(55,-37),(59,-21.8),(60,-18),(61,-13.8),(62,-9.6),(65,3),(69,19.8),(70,24)]:
            with self.subTest(temperature=temperature):
                h=Harness(calibration_override=None)
                self.assertEqual(h.configure(mode='manual',manual_temperature=temperature),'applied')
                h.set(ACTIVE,'on');h.observe()
                self.assertEqual(h.servo_calls,[expected])
                self.assertIs(h.status()['calibration_valid'],True)
                self.assertIs(h.status()['actuation_enabled'],True)
                self.assertEqual(h.status()['last_transmitted_temperature'],temperature)

    def test_incomplete_calibration_blocks_even_a_known_manual_point(self):
        points=[{'temperature':50,'level':-50,'verified':True},{'temperature':60,'level':-18,'verified':True},{'temperature':70,'level':None,'verified':False}]
        for temperature in [50,60,70]:
            h=Harness(calibration_override=points);h.configure(mode='manual',manual_temperature=temperature);h.set(ACTIVE,'on');h.observe()
            self.assertEqual(h.servo_calls,[])
            self.assertEqual(h.status()['delivery_state'],'blocked')
            self.assertEqual(h.status()['reason'],'calibration_required')
            self.assertIs(h.status()['calibration_valid'],False)
            self.assertIs(h.status()['actuation_enabled'],False)

    def test_piecewise_interpolation_uses_both_segments_without_legacy_fallback(self):
        # Deliberately different slopes and fictitious positions for interpolation.
        points=[{'temperature':50,'level':0,'verified':True},{'temperature':60,'level':20,'verified':True},{'temperature':70,'level':60,'verified':True}]
        for temperature,expected in [(50,0),(51,2),(55,10),(59,18),(60,20),(61,24),(65,40),(69,56),(70,60)]:
            h=Harness(calibration_override=points);h.configure(mode='manual',manual_temperature=temperature);h.set(ACTIVE,'on');h.observe()
            self.assertEqual(h.servo_calls,[expected])

    def test_invalid_calibrations_never_call_the_service(self):
        invalids=[[],{},'invalid',SYNTHETIC_CALIBRATION[:2],list(reversed(SYNTHETIC_CALIBRATION))]
        for value in [None,True,'20',float('nan'),float('inf'),-101,101,-50,30]:
            points=copy.deepcopy(SYNTHETIC_CALIBRATION);points[1]['level']=value;invalids.append(points)
        for flag in [False,1,'true',None]:
            points=copy.deepcopy(SYNTHETIC_CALIBRATION);points[1]['verified']=flag;invalids.append(points)
        for points in invalids:
            with self.subTest(points=points):
                h=Harness(calibration_override=points);h.configure(mode='manual');h.set(ACTIVE,'on');h.observe()
                self.assertEqual(h.servo_calls,[])
                self.assertIs(h.status()['calibration_valid'],False)

    def test_atomic_config_and_bounds(self):
        self.assertEqual(self.h.configure(mode='manual',manual_temperature=70,minimum_d=59), 'applied')
        self.assertEqual(self.h.read(CFG),dict(v=1,r=1,m='manual',t=70,d=59,id='test_1'))
        self.assertEqual(len(self.h.calls),1)
        for patch in [dict(manual_temperature=49),dict(manual_temperature=71),dict(manual_temperature=60.5),dict(manual_temperature='60'),dict(manual_temperature=True),dict(minimum_d=54),dict(minimum_d=60),dict(minimum_d=57.5),dict(minimum_d=False),dict(mode='auto'),dict(expires_at='tomorrow'),dict(expected_revision=True),dict(expected_revision=-1),dict(request_id='x'*49)]:
            with self.subTest(patch=patch):
                h=Harness()
                self.assertEqual(h.configure(**patch),'invalid_request')
                self.assertEqual(h.calls,[])

    def test_ttl_revision_idempotence(self):
        for patch,reason in [(dict(expires_at=self.h.time),'request_expired'),(dict(expires_at=self.h.time+121),'request_expired'),(dict(expected_revision=2),'revision_conflict')]:
            self.assertEqual(self.h.configure(**patch),reason)
        self.assertEqual(self.h.configure(),'applied')
        self.assertEqual(self.h.configure(),'already_applied')
        self.assertEqual(self.h.configure(manual_temperature=61),'request_id_reused')
        self.assertEqual(self.h.configure(request_id='second'),'revision_conflict')
        self.assertEqual(self.h.configure(request_id='second',expected_revision=1),'applied')

    def test_manual_mapping_synthetic_points_for_control_flow(self):
        for temperature,level in [(50,-50),(60,-10),(70,30)]:
            with self.subTest(temperature=temperature):
                h=Harness(); h.configure(mode='manual',manual_temperature=temperature); h.set(ACTIVE,'on'); h.set(D,'unavailable')
                h.observe()
                self.assertEqual(h.servo_calls,[level])
                self.assertEqual(h.read(TX)['t'],temperature)
                self.assertEqual(h.status()['last_transmitted_temperature'],temperature)
                self.assertEqual(h.status()['delivery_state'],'transmitted')

    def test_legacy_on_unknown_or_missing_blocks(self):
        self.active_auto()
        for legacy in ['on','unknown','unavailable']:
            self.h.set(LEGACY,legacy); self.h.observe()
            self.assertEqual(self.h.status()['delivery_state'],'blocked')
        self.assertEqual(self.h.servo_calls,[])

    def test_invalid_and_stale_sources_block(self):
        for entity in [D,B]:
            for value,age,attrs in [('unknown',0,{}),('unavailable',0,{}),('nan',0,{}),(60,-1,{}),(60,0,{'unit_of_measurement':'°F'}),(60,0,{'restored':True}),(-1,0,{}),(111,0,{})]:
                with self.subTest(entity=entity,value=value,age=age,attrs=attrs):
                    h=Harness(); h.configure(); h.set(ACTIVE,'on'); h.set(entity,value,age,attrs); h.observe()
                    self.assertEqual(h.servo_calls,[])
                    self.assertIn(h.status()['delivery_state'],['waiting_module','waiting_sensor'])

    def test_native_unchanged_old_source_dates_are_usable_without_fake_packet_time(self):
        self.active_auto(d=56,b=60)
        self.h.set(D,56,age=7200);self.h.set(B,60,age=7200)
        source_d=self.h.entities[D].last_reported;source_b=self.h.entities[B].last_reported
        self.assertEqual(self.h.observe()['q'],62)
        self.assertEqual(self.h.servo_calls,[-2])
        self.assertEqual(self.h.entities[D].last_reported,source_d)
        self.assertEqual(self.h.entities[B].last_reported,source_b)
        self.assertEqual(self.h.read(HIST)['at'],self.h.time)
        self.assertEqual(self.h.read(TX)['seen'],self.h.time)

    def test_constant_connected_d_creates_plateau_history_and_releases_70_to_66(self):
        self.active_auto(d=59);self.h.transmitted(70)
        self.h.set(D,59,age=7200);self.h.set(B,60,age=7200)
        original_d_date=self.h.entities[D].last_reported
        for minute in range(11):
            if minute:self.h.time+=60
            result=self.h.observe()
        self.assertEqual(result['q'],66)
        self.assertEqual(result['s'],'release_support')
        self.assertEqual(self.h.servo_calls,[14])
        self.assertEqual(self.h.entities[D].last_reported,original_d_date)
        self.assertEqual(self.h.read(HIST)['at'],self.h.time)

    def test_native_disconnected_old_measurements_never_sample_or_transmit(self):
        for entity in [D,B]:
            for invalid in ['unknown','unavailable']:
                h=Harness();h.configure();h.set(ACTIVE,'on');h.set(entity,invalid,age=7200);h.observe()
                self.assertEqual(h.servo_calls,[])
                if entity==D:self.assertEqual(h.read(HIST)['v'],[])

    def test_missing_zero_and_future_source_timestamps_block(self):
        for entity in [D,B]:
            for timestamp in [None,datetime.fromtimestamp(0,timezone.utc),datetime.fromtimestamp(self.h.time+1,timezone.utc)]:
                h=Harness();h.configure();h.set(ACTIVE,'on');h.entities[entity].last_reported=timestamp;h.observe()
                self.assertEqual(h.servo_calls,[])
                self.assertIn(h.status()['delivery_state'],['waiting_module','waiting_sensor'])

    def test_observer_gap_resets_history_even_with_connected_constant_source(self):
        self.active_auto(d=59);self.h.history([59]*7);self.h.transmitted(65)
        self.h.time+=181;self.h.observe()
        self.assertEqual(len(self.h.read(HIST)['v']),1)
        self.assertIsNone(self.h.read(OBS)['slow'])
        self.assertEqual(self.h.read(OBS)['s'],'warming_up')

    def test_repeated_triggers_same_second_do_not_duplicate_local_sample(self):
        self.active_auto(d=59)
        for _ in range(4):self.h.observe()
        self.assertEqual(len(self.h.read(HIST)['v']),1)

    def test_actual_source_timestamp_change_after_calculation_cancels_attempt(self):
        self.active_auto()
        self.h.before_service=lambda h:h.set(B,60,age=1)
        self.h.observe();self.assertEqual(self.h.servo_calls,[])

    def test_no_false_zero_from_unavailable(self):
        self.active_auto();self.h.set(D,'unavailable');self.h.observe()
        self.assertIsNone(self.h.status()['desired_temperature'])
        self.assertIsNone(self.h.status()['observed_temperature_d'])
        self.assertEqual(self.h.servo_calls,[])

    def test_useful_initial_support_62_not_slow_51(self):
        self.active_auto(d=56,b=60); result=self.h.observe()
        self.assertEqual(result['q'],62)
        self.assertEqual(result['s'],'support_start')
        self.assertEqual(self.h.servo_calls,[-2])

    def test_offline_b_calculates_from_d_without_sending_or_stair_stepping(self):
        self.active_auto(d=56)
        self.h.set(B,'unavailable')
        for _ in range(20):
            self.h.time+=60;self.h.set(D,56);self.h.observe()
            self.assertEqual(self.h.status()['desired_temperature'],61)
            self.assertEqual(self.h.status()['phase'],'active')
            self.assertEqual(self.h.status()['delivery_state'],'waiting_module')
            self.assertIsNone(self.h.status()['last_transmitted_temperature'])
        self.assertEqual(self.h.servo_calls,[])
        self.h.set(D,61);self.h.observe()
        self.assertEqual(self.h.status()['desired_temperature'],50)
        self.h.set(B,60);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_offline_b_never_replaces_missing_d_with_a_theoretical_value(self):
        self.active_auto(d=56);self.h.set(B,'unavailable');self.h.observe()
        self.h.set(D,'unavailable');self.h.observe()
        self.assertIsNone(self.h.status()['desired_temperature'])
        self.assertEqual(self.h.status()['phase'],'suspended')
        self.assertEqual(self.h.servo_calls,[])

    def test_hot_d_priority_50_even_offline(self):
        self.active_auto(d=61); self.h.set(B,'unavailable'); self.h.transmitted(70,age=10)
        self.h.observe()
        self.assertEqual(self.h.status()['desired_temperature'],50)
        self.assertEqual(self.h.status()['delivery_state'],'waiting_module')
        self.assertEqual(self.h.servo_calls,[])

    def test_reconnect_recomputes_hot_over_old_pending_support(self):
        self.active_auto(d=56); self.h.fail_servo=True; self.h.observe()
        self.h.set(B,'unavailable');self.h.observe()
        self.h.time+=180;self.h.set(D,61);self.h.set(B,60);self.h.fail_servo=False;self.h.observe()
        self.assertEqual(self.h.servo_calls,[-2,-50])
        self.assertEqual(self.h.read(TX)['t'],50)

    def test_same_absolute_target_resent_after_reconnect(self):
        self.active_auto(d=61);self.h.observe();self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])
        self.h.set(B,'unavailable');self.h.observe();self.h.set(B,60);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50,-50])

    def test_ha_start_recalculates_and_resends_fresh_absolute(self):
        self.active_auto(d=61);self.h.transmitted(50,age=200);self.h.observe(trigger='homeassistant')
        self.assertEqual(self.h.servo_calls,[-50])
        self.h.set(B,60,attributes={'restored':True});self.h.observe(trigger='homeassistant')
        self.assertEqual(self.h.servo_calls,[-50])

    def test_failed_service_never_marks_api_success_and_retry_bounded(self):
        self.active_auto();self.h.fail_servo=True;self.h.observe()
        tx=self.h.read(TX)
        self.assertIsNone(tx['t']);self.assertEqual(tx['at'],0);self.assertEqual(tx['s'],'uncertain')
        self.assertIsNone(self.h.status()['last_transmitted_at'])
        self.h.observe();self.h.tick();self.assertEqual(len(self.h.servo_calls),1)
        self.h.tick();self.assertEqual(len(self.h.servo_calls),2)
        self.assertEqual(self.h.read(TX)['s'],'uncertain')

    def test_unsent_proposal_does_not_consume_increment_or_cooldown(self):
        self.active_auto();self.h.fail_servo=True
        for _ in range(40):
            self.h.tick()
            self.assertEqual(self.h.read(OBS)['q'],62)
        self.assertTrue(all(level==-2 for level in self.h.servo_calls))
        self.assertIsNone(self.h.read(TX)['t'])

    def test_success_time_does_not_freshen_when_only_status_changes(self):
        self.active_auto(d=61);self.h.observe();date=self.h.status()['last_transmitted_at'];at=self.h.read(TX)['at']
        self.h.tick(d=61)
        self.assertEqual(self.h.status()['last_transmitted_at'],date)
        self.assertEqual(self.h.read(TX)['at'],at)
        self.assertEqual(self.h.servo_calls,[-50])
        sensor=PACKAGE['template'][0]['sensor'][1]
        self.assertEqual(sensor['unit_of_measurement'],'°C')
        self.assertIn('last_at',sensor['attributes']['transmitted_at'])

    def test_config_change_immediately_before_service_prevents_stale_command(self):
        self.active_auto()
        def switch(h):
            self.assertEqual(h.configure(mode='manual',manual_temperature=50,request_id='new',expected_revision=1),'applied')
        self.h.before_service=switch;self.h.observe()
        self.assertEqual(self.h.servo_calls,[])
        self.h.time+=180;self.h.set(B,60);self.h.set(D,56);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_disable_or_legacy_change_immediately_before_service_blocks(self):
        for entity,value in [(ACTIVE,'off'),(LEGACY,'on'),(B,'unavailable'),(D,'unavailable')]:
            with self.subTest(entity=entity):
                h=Harness();h.configure();h.set(ACTIVE,'on');h.before_service=lambda x,e=entity,v=value:x.set(e,v);h.observe()
                self.assertEqual(h.servo_calls,[])
                self.assertIsNone(h.read(TX)['t'])

    def test_new_hot_sample_between_calculation_and_api_blocks_old_raise(self):
        self.active_auto();self.h.before_service=lambda h:h.set(D,61);self.h.observe()
        self.assertEqual(self.h.servo_calls,[])
        self.h.time+=180;self.h.set(D,61);self.h.set(B,60);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_plateau_59_releases_70_to_66(self):
        self.active_auto(d=59);self.h.history([59]*7);self.h.transmitted(70)
        result=self.h.observe()
        self.assertEqual(result['q'],66);self.assertEqual(result['s'],'release_support')
        self.assertEqual(self.h.servo_calls,[14])

    def test_hot_priority_over_cooldown_and_no_response(self):
        self.active_auto(d=60);self.h.transmitted(70,age=20)
        self.h.set(OBS,json.dumps(dict(r=1,a=1,ba=self.h.time-4000,bv=56,tick=self.h.time-60)))
        self.assertEqual(self.h.observe()['q'],50)
        self.assertEqual(self.h.servo_calls,[-50])

    def test_d_history_continues_while_b_offline(self):
        self.active_auto();self.h.set(B,'unavailable')
        for n in range(16):
            self.h.time+=60;self.h.set(D,57+n*.1);self.h.observe()
        history=self.h.read(HIST)
        self.assertGreaterEqual(len(history['v']),6)
        self.assertLessEqual(history['v'][0][0],-600)
        self.assertEqual(self.h.servo_calls,[])
        self.h.set(B,60);self.h.observe()
        self.assertIsNotNone(self.h.read(OBS)['slow'])

    def test_d_history_resets_after_d_gap_without_erasing_last_transmission(self):
        self.active_auto(d=59);self.h.history([59]*7);self.h.transmitted(65)
        self.h.set(D,'unavailable');self.h.observe();self.h.time+=600;self.h.set(D,59);self.h.set(B,60);self.h.observe()
        self.assertEqual(len(self.h.read(HIST)['v']),1)
        self.assertEqual(self.h.read(OBS)['q'],65)
        self.assertEqual(self.h.read(OBS)['s'],'warming_up')

    def test_recent_cooling_prevents_release_based_on_old_rise(self):
        self.active_auto(d=59);self.h.history([55,55.5,56,57,58,60,59.5]);self.h.transmitted(65)
        self.h.set(OBS,json.dumps(dict(r=1,a=1,tick=self.h.time-60)))
        result=self.h.observe()
        self.assertNotEqual(result['s'],'release_support');self.assertGreaterEqual(result['q'],65)
        self.assertLess(result['tip'],0)

    def test_recent_rise_prevents_increase_based_on_old_drop(self):
        self.active_auto(d=58);self.h.history([62,61,60,59,57,57.5,57.7]);self.h.transmitted(65)
        self.h.set(OBS,json.dumps(dict(r=1,a=1,tick=self.h.time-60)))
        result=self.h.observe()
        self.assertEqual(result['s'],'recent_recovery');self.assertEqual(result['q'],65)

    def test_limits_under_many_temperatures(self):
        for d in [0,40,54,55,56,57,58,59,60,61,90,110]:
            for b in [0,40,60,69,90,110]:
                h=Harness();h.configure();h.set(ACTIVE,'on');h.set(D,d);h.set(B,b);h.observe()
                q=h.read(OBS)['q']
                self.assertTrue(q is None or 50<=q<=70,(d,b,q))
                self.assertTrue(all(-50<=level<=30 for level in h.servo_calls))

    def test_all_helpers_fit_255_with_native_spaces(self):
        self.h.env.filters['to_json']=lambda value:json.dumps(value)
        self.h.configure(request_id='x'*48,mode='automatic',manual_temperature=70,minimum_d=59)
        self.h.set(ACTIVE,'on');self.h.history([109.99]*8);self.h.set(D,109.99);self.h.set(B,109.99);self.h.observe()
        for entity in [CFG,OBS,TX,HIST]:
            self.assertLessEqual(len(self.h.entities[entity].state),255,entity)

    def test_absent_configuration_cannot_send_default_with_restored_flag(self):
        for raw in ['', 'unknown', 'unavailable']:
            h=Harness();h.set(CFG,raw);h.set(ACTIVE,'on');h.transmitted(70);h.observe()
            self.assertEqual(h.servo_calls,[])
            self.assertEqual(h.status()['reason'],'configuration_invalid')

    def test_reconnect_obligation_survives_failed_final_guard(self):
        self.active_auto(d=61);self.h.transmitted(50,online=0)
        self.h.before_guard=lambda h:h.set(B,61)
        self.h.observe();self.assertEqual(self.h.servo_calls,[])
        self.h.observe();self.assertEqual(self.h.servo_calls,[-50])

    def test_reconnect_while_disabled_is_sent_on_reactivation(self):
        self.active_auto(d=61);self.h.transmitted(50,online=0);self.h.set(ACTIVE,'off');self.h.observe()
        self.assertEqual(self.h.servo_calls,[])
        self.h.set(ACTIVE,'on');self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_reconnect_obligation_survives_d_unavailable_until_next_fresh_sample(self):
        self.active_auto(d=61);self.h.transmitted(50,online=0)
        self.h.set(D,'unavailable');self.h.observe()
        self.assertEqual(self.h.servo_calls,[])
        self.assertEqual(self.h.read(TX)['need'],1)
        self.h.set(D,61);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_start_resend_obligation_survives_initial_d_restored_sample(self):
        self.active_auto(d=61);self.h.transmitted(50)
        self.h.set(D,61,attributes={'restored':True});self.h.observe(trigger='homeassistant')
        self.assertEqual(self.h.servo_calls,[])
        self.assertEqual(self.h.read(TX)['need'],1)
        self.h.set(D,61);self.h.observe()
        self.assertEqual(self.h.servo_calls,[-50])

    def test_new_connection_and_new_hot_target_bypass_failed_old_backoff_once(self):
        for disconnected in [True,False]:
            h=Harness();h.configure();h.set(ACTIVE,'on');h.set(D,61)
            h.set(TX,json.dumps({'t':70,'at':h.time-1000,'r':1,'try':h.time-1,'n':4,'s':'uncertain','online':0 if disconnected else 1,'seen':h.time-1,'want':65,'need':1,'force':0}))
            h.fail_servo=True;h.observe()
            self.assertEqual(h.servo_calls,[-50])
            h.observe();self.assertEqual(h.servo_calls,[-50])
            self.assertEqual(h.read(TX)['t'],70)

    def test_support_memory_preserved_during_gradual_reduction(self):
        self.active_auto(d=59);self.h.history([59]*7);self.h.transmitted(70)
        first=self.h.observe();self.assertEqual(first['q'],66);self.assertEqual(first['a'],1)
        self.h.time+=300;self.h.set(D,58.3);self.h.set(B,60);self.h.history([58.3]*7)
        second=self.h.observe();self.assertEqual(second['q'],66);self.assertEqual(second['a'],1)

    def test_actual_useful_transmission_starts_response_timer_and_blocks_only_increase(self):
        self.active_auto(d=56,b=60);self.h.transmitted(62)
        self.h.set(OBS,json.dumps({'r':1,'a':1,'tick':self.h.time-60,'ba':self.h.time-1900,'bv':56}))
        result=self.h.observe();self.assertEqual(result['s'],'response_not_observed');self.assertEqual(result['q'],62)
        self.h.set(D,60);result=self.h.observe();self.assertEqual(result['q'],50)

    def test_midpoint_target_for_each_supported_minimum(self):
        for minimum in range(55,60):
            h=Harness();h.configure(minimum_d=minimum);h.set(ACTIVE,'on');h.set(D,minimum-1);h.set(B,40)
            expected=math.ceil((minimum+60)/2+2)
            self.assertEqual(h.observe()['q'],expected)

    def test_malformed_configuration_never_transmits(self):
        for value in ['not-json','[]','null','{"v":2}',json.dumps(dict(v=1,r=True,m='manual',t=60,d=57)),json.dumps(dict(v=1,r=1,m='manual',t=90,d=57))]:
            h=Harness();h.set(ACTIVE,'on');h.set(CFG,value);h.observe();self.assertEqual(h.servo_calls,[])
            self.assertEqual(h.status()['reason'],'configuration_invalid')


if __name__ == '__main__':
    unittest.main(verbosity=2)
