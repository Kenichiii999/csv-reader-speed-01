// csv-reader-speed-01 entry: the driver. It reads every case from /input/cases.json,
// answers each one alone with run() from solve.js, and writes /output/answers.json:
// a JSON array of the answers, one per case and in the cases' order. Outside a
// container MAKEFUN_INPUT_DIR and MAKEFUN_OUTPUT_DIR stand in for /input and /output.
//
// Why per-case: answering all six cases first and stringifying the whole answers
// array at once keeps all ~710k field strings live until the end, which makes the
// fresh-process GC expensive (major collections while the heap grows past 100 MB).
// Stringifying each case's answer as soon as it is parsed — and dropping the
// case's input — keeps only one case's answer objects live at a time. The bytes
// written are identical to stringifying the whole array at once (JSON.stringify
// of an array is exactly '[' + its elements joined by ',' + ']'), and the answers
// are written incrementally so no 12 MB joined string is ever built.

import { readFileSync, openSync, writeSync, closeSync } from 'node:fs';
import { join } from 'node:path';
import { setFlagsFromString } from 'node:v8';

// V8's incremental marking off, set before solve.js is imported so all of its work
// runs under it (the house baseline runs with --no-incremental-marking, and an entry
// may tune V8's flags the same way).
setFlagsFromString('--no-incremental-marking');

/** solve.js, imported by its URL, typed by its contract: run(input) answers one case. */
const { run } = (await import(new URL('./solve.js', import.meta.url).href)) as {
  run: (input: unknown) => unknown;
};

const INPUT_DIR = process.env.MAKEFUN_INPUT_DIR ?? '/input';
const OUTPUT_DIR = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

const cases = JSON.parse(readFileSync(join(INPUT_DIR, 'cases.json'), 'utf8')) as {
  id: string;
  input: unknown;
}[];

const fd = openSync(join(OUTPUT_DIR, 'answers.json'), 'w');
writeSync(fd, '[');
for (let i = 0; i < cases.length; i++) {
  if (i > 0) writeSync(fd, ',');
  writeSync(fd, JSON.stringify(run(cases[i].input)));
  cases[i] = null as unknown as { id: string; input: unknown };
}
writeSync(fd, ']');
closeSync(fd);
