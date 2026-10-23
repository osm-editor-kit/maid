# Older versions for the mock API

`<scene>.json` holds older versions of a few elements of `fixtures/<scene>.json.gz`, in the OSM API's JSON. The mock
answers `/api/0.6/<type>/<id>/<version>` from it, so that a check can load a file made from an older version and
merge it with the fixture's current one, without a server (core rule 1).

These versions are **made up by hand** for the checks, not taken from OSM: the current element of the fixture with a
tag or a position changed and a lower version number. They are not fixtures and are never cut from an extract. Tobias
agreed to them on 2026-10-23 for `check-osmchange`.

- `small.json`: the base versions that `packages/module-osmchange/test-files/outdated.osc` was "made from" (toilets
  `n364123000` v21, doctor `n420517141` v14, library `n444731308` v10, bank `n421299912` v12).
