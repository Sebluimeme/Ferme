import json
import os
import urllib.request
from pathlib import Path

env_path = Path(os.environ.get('HERMES_ENV_PATH', Path.home() / '.hermes' / '.env'))
for line in env_path.read_text().splitlines():
    if line.startswith('HOME_ASSISTANT_URL=') or line.startswith('HOME_ASSISTANT_TOKEN='):
        key, value = line.split('=', 1)
        os.environ[key] = value.strip().strip('"').strip("'")

base_url = os.environ['HOME_ASSISTANT_URL'].rstrip('/')
token = os.environ['HOME_ASSISTANT_TOKEN']
device = {
    'identifiers': ['citerne_1_eau_potable'],
    'name': 'Citerne 1 — eau potable',
    'manufacturer': 'Capteur MQTT',
    'model': 'Niveau citerne quotidien',
}
base = {
    'state_topic': 'citerne/1/etat',
    'device': device,
    'qos': 0,
    'expire_after': 90000,
}
sensors = {
    'niveau': {'name': 'Niveau', 'unique_id': 'citerne_1_niveau', 'value_template': '{{ value_json.niveau }}', 'unit_of_measurement': '%', 'icon': 'mdi:water-percent', 'state_class': 'measurement'},
    'volume': {'name': 'Volume disponible', 'unique_id': 'citerne_1_volume', 'value_template': '{{ value_json.volume }}', 'unit_of_measurement': 'L', 'device_class': 'volume_storage', 'state_class': 'measurement'},
    'hauteur': {'name': "Hauteur d'eau", 'unique_id': 'citerne_1_hauteur', 'value_template': '{{ value_json.hauteur }}', 'unit_of_measurement': 'm', 'device_class': 'distance', 'state_class': 'measurement'},
    'distance': {'name': 'Distance capteur', 'unique_id': 'citerne_1_distance', 'value_template': '{{ value_json.distance }}', 'unit_of_measurement': 'cm', 'device_class': 'distance', 'state_class': 'measurement'},
    'debit': {'name': 'Débit', 'unique_id': 'citerne_1_debit', 'value_template': '{{ value_json.debit }}', 'unit_of_measurement': 'L/min', 'device_class': 'volume_flow_rate', 'state_class': 'measurement', 'availability_topic': 'citerne/1/etat', 'availability_template': "{{ 'online' if value_json.debit >= 0 else 'offline' }}"},
    'batterie': {'name': 'Batterie', 'unique_id': 'citerne_1_batterie', 'value_template': '{{ value_json.batterie }}', 'unit_of_measurement': '%', 'device_class': 'battery', 'state_class': 'measurement'},
    'tension_batterie': {'name': 'Tension batterie', 'unique_id': 'citerne_1_tension_batterie', 'value_template': '{{ value_json.batterie_voltage }}', 'unit_of_measurement': 'V', 'device_class': 'voltage', 'state_class': 'measurement'},
    'rssi': {'name': 'RSSI', 'unique_id': 'citerne_1_rssi', 'value_template': '{{ value_json.rssi }}', 'unit_of_measurement': 'dBm', 'device_class': 'signal_strength', 'state_class': 'measurement'},
    'snr': {'name': 'SNR', 'unique_id': 'citerne_1_snr', 'value_template': '{{ value_json.snr }}', 'unit_of_measurement': 'dB', 'icon': 'mdi:signal', 'state_class': 'measurement'},
}

for object_id, specific in sensors.items():
    discovery_topic = f'homeassistant/sensor/citerne_1/{object_id}/config'
    discovery_payload = json.dumps({**base, **specific}, ensure_ascii=False)
    body = json.dumps({'topic': discovery_topic, 'payload': discovery_payload, 'qos': 0, 'retain': True}).encode()
    request = urllib.request.Request(
        base_url + '/api/services/mqtt/publish',
        data=body,
        headers={'Authorization': 'Bear' + 'er ' + token, 'Content-Type': 'application/json'},
        method='POST',
    )
    with urllib.request.urlopen(request, timeout=15) as response:
        if response.status != 200:
            raise RuntimeError(f'{discovery_topic}: HTTP {response.status}')
    print(f'PUBLISHED {discovery_topic}')
