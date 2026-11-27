# Access field: which keys show by default

The "Allowed Access" field (`packages/ui/src/inspector/fields/Access.tsx`) always shows a few rows and every other access key only when it is set or added with "+". iD shows its five (`access`, `foot`, `motor_vehicle`, `bicycle`, `horse`) on every feature. Tobias (2026-11-27): horse is not needed on every road, only on tracks; the rows per road type go into a JSON, chosen by how often taginfo shows the keys.

The JSON is `packages/ui/src/inspector/fields/access-default-keys.json`: a default list and, per tag value, a list of its own (the first matching tag wins).

## Taginfo, 2026-11-27

Ways with the `highway` value that also carry the key (any value), from `api/4/tag/combinations?key=highway&value=<v>&filter=ways`. Only access keys, up to the tenth:

| highway         | Access keys (share of the ways)                                                                                   |
| --------------- | ----------------------------------------------------------------------------------------------------------------- |
| `residential`   | access 2.2 %, bicycle 0.5, foot 0.5, motor_vehicle 0.3, hgv 0.2, motorcycle 0.2, horse 0.1                        |
| `service`       | access 18.4 %, motor_vehicle 0.7, foot 0.6, bicycle 0.6, horse 0.2, vehicle 0.1, bus 0.1, psv 0.1                 |
| `unclassified`  | access 1.2 %, bicycle 0.9, foot 0.8, motor_vehicle 0.5, horse 0.3, hgv 0.2                                        |
| `tertiary`      | bicycle 3.3 %, foot 2.7, hgv 1.3, access 0.6, horse 0.4                                                           |
| `secondary`     | bicycle 5.7 %, foot 5.4, hgv 4.2, mofa 0.6, access 0.6, horse 0.6, hazmat 0.5                                     |
| `primary`       | hgv 10.6 %, bicycle 7.1, foot 6.7, horse 1.1, hazmat 0.9, mofa 0.8, access 0.8, moped 0.8                         |
| `living_street` | motorcycle 14.4 %, motorcar 7.0, access 7.0, bicycle 1.7, motor_vehicle 1.6, foot 1.5, horse 0.5                  |
| `pedestrian`    | bicycle 12.0 %, foot 5.2, motor_vehicle 5.2, access 2.8, horse 1.9, vehicle 1.2, emergency 0.6                    |
| `footway`       | bicycle 5.7 %, foot 3.5, access 2.6, motor_vehicle 1.0, horse 1.0                                                 |
| `cycleway`      | foot 64.8 %, bicycle 49.7, moped 7.9, mofa 7.2, motor_vehicle 4.5, horse 4.0, access 1.7                          |
| `path`          | foot 11.4 %, bicycle 10.7, horse 2.9, access 2.4, motor_vehicle 1.9, dog 0.3, snowmobile 0.3                      |
| `track`         | access 4.3 %, motor_vehicle 2.4, bicycle 2.3, foot 2.2, horse 1.0, motorcar 0.5, vehicle 0.4, motorcycle 0.4      |
| `bridleway`     | foot 49.7 %, bicycle 43.5, horse 38.9, motor_vehicle 10.9, access 5.1, vehicle 3.1                                |

## What the JSON takes from it

- Default for every feature: `access`, `foot`, `bicycle`, `motor_vehicle`. Horse is below 0.5 % on the roads people edit most (residential, service, unclassified, tertiary).
- `track` and `bridleway`: plus `horse` (Tobias; on bridleways 38.9 %).
- `cycleway`: plus `moped` and `mofa` (7.9 % and 7.2 %, more than motor_vehicle; "Mofa frei" in Germany).
- `primary` and `secondary`: plus `hgv` (10.6 % and 4.2 %).
- Not taken: `motorcycle` and `motorcar` on `living_street` (14.4 % and 7.0 %, a high share that looks like the tagging of one region, not checked); `horse` on `path` (2.9 %). Both can be added with "+".
