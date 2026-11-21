[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kenichiii999/csv-reader-speed-01/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/Kenichiii999/csv-reader-speed-01/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

# csv-reader-speed-01

A faster drop-in for make.fun's own csv-reader 1.0.0, built for the
[csv-reader-speed-01-run-20261121](https://make.fun/bounty/csv-reader-speed-01-run-20261121)
competition by [Kenichiii999](https://github.com/Kenichiii999).

`run(input)` returns exactly csv-reader 1.0.0's answer — `{columns, rows, errors}` —
for every input `{text, header}`, including every broken-row rule: BOM drop,
CR/CRLF/LF line endings, stray CRs, doubled quotes, quote junk, unterminated
quotes, short and long rows with their errors. Only faster.

## How it is faster

The reference walks one character at a time and builds each field a character at
a time. This reader jumps from separator to separator with regex scans and slices
whole fields at once, and a record whose line holds no quote and no CR is split
natively instead of scanned field by field. On the practice set it reads the same
answers in about half the CPU time of the house baseline.

## Layout

- `main.ts` — the driver: reads every case from `/input/cases.json`, answers each
  with `run`, writes `/output/answers.json`.
- `solve.js` — the parser: dependency-free ES module, `run(input)` answers one case.

## Run it locally

```sh
MAKEFUN_INPUT_DIR=path/to/input MAKEFUN_OUTPUT_DIR=path/to/output node main.ts
```

Node 22 or later. No dependencies, no network, no build step.
