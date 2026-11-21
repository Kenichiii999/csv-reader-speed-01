// Variant C: solve.js + a quote-free record fast path. A record whose line holds
// no quote and no CR is split natively instead of scanned field by field. For
// A/B testing only.
const COMMA = 0;
const BREAK = 1;
const END = 2;

export function run(input) {
  const text = String(input.text);
  const header = input.header === true;
  const errors = [];
  const rows = [];
  let columns = null;
  let width = -1;

  const n = text.length;
  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let line = 1;
  let recordLine = 1;
  let recordRow = null;
  let fv = '';
  let fe = END;

  const SEP = /[,\r\n]/g;
  const QB = /["\r\n]/g;

  function error(code) {
    errors.push({ code, line: recordLine, row: recordRow });
  }

  function readUnquoted(init) {
    let v = init;
    for (;;) {
      SEP.lastIndex = pos;
      const m = SEP.exec(text);
      if (m === null) {
        if (pos < n) v += text.slice(pos);
        pos = n;
        fv = v;
        fe = END;
        return;
      }
      const i = m.index;
      const ch = m[0];
      if (ch === ',') {
        v += text.slice(pos, i);
        pos = i + 1;
        fv = v;
        fe = COMMA;
        return;
      }
      if (ch === '\n') {
        v += text.slice(pos, i);
        pos = i + 1;
        line += 1;
        fv = v;
        fe = BREAK;
        return;
      }
      if (text[i + 1] === '\n') {
        v += text.slice(pos, i);
        pos = i + 2;
        line += 1;
        fv = v;
        fe = BREAK;
        return;
      }
      error('stray_cr');
      v += text.slice(pos, i);
      pos = i + 1;
    }
  }

  function readQuoted() {
    const open = pos;
    const openLine = line;
    let v = '';
    let start = pos + 1;
    for (;;) {
      QB.lastIndex = start;
      const m = QB.exec(text);
      if (m === null) {
        pos = open + 1;
        line = openLine;
        error('unterminated_quote');
        readUnquoted('"');
        return;
      }
      const i = m.index;
      const ch = m[0];
      if (ch === '"') {
        if (text[i + 1] === '"') {
          v += text.slice(start, i);
          v += '"';
          start = i + 2;
          continue;
        }
        v += text.slice(start, i);
        pos = i + 1;
        if (pos >= n) {
          fv = v;
          fe = END;
          return;
        }
        const c = text[pos];
        if (c === ',') {
          pos += 1;
          fv = v;
          fe = COMMA;
          return;
        }
        if (c === '\n') {
          pos += 1;
          line += 1;
          fv = v;
          fe = BREAK;
          return;
        }
        if (c === '\r' && text[pos + 1] === '\n') {
          pos += 2;
          line += 1;
          fv = v;
          fe = BREAK;
          return;
        }
        const before = v.length;
        readUnquoted(v);
        if (fv.length > before) error('quote_junk');
        return;
      }
      v += text.slice(start, i);
      v += '\n';
      line += 1;
      start = ch === '\r' && text[i + 1] === '\n' ? i + 2 : i + 1;
    }
  }

  for (;;) {
    while (pos < n) {
      if (text[pos] === '\n') {
        pos += 1;
        line += 1;
      } else if (text[pos] === '\r' && text[pos + 1] === '\n') {
        pos += 2;
        line += 1;
      } else {
        break;
      }
    }
    if (pos >= n) break;

    recordLine = line;
    recordRow = header && columns === null ? null : rows.length;

    // Fast path: a record whose line holds no quote and no CR. Any '"' or '\r'
    // in the span falls back to the state machine below (a quote inside an
    // unquoted field is literal, a lone CR is a stray_cr — both need it).
    let fields;
    let quoted = false;
    const ni = text.indexOf('\n', pos);
    let spanEnd;
    let eolLen;
    let isEnd;
    if (ni === -1) {
      spanEnd = n;
      eolLen = 0;
      isEnd = true;
    } else if (ni > pos && text[ni - 1] === '\r') {
      spanEnd = ni - 1;
      eolLen = 2;
      isEnd = false;
    } else {
      spanEnd = ni;
      eolLen = 1;
      isEnd = false;
    }
    const span = text.slice(pos, spanEnd);
    if (span.indexOf('"') === -1 && span.indexOf('\r') === -1) {
      fields = span.split(',');
      pos = spanEnd + eolLen;
      if (!isEnd) line += 1;
      fe = isEnd ? END : BREAK;
    } else {
      fields = [];
      do {
        if (text[pos] === '"') {
          quoted = true;
          readQuoted();
        } else {
          quoted = false;
          readUnquoted('');
        }
        fields.push(fv);
      } while (fe === COMMA);
    }

    if (fields.length === 1 && fields[0] === '' && !quoted) continue;

    if (width < 0) width = fields.length;
    if (header && columns === null) {
      columns = fields;
      continue;
    }
    if (fields.length < width) {
      errors.push({ code: 'short_row', line: recordLine, row: recordRow, fields: fields.length });
      while (fields.length < width) fields.push('');
    } else if (fields.length > width) {
      errors.push({ code: 'long_row', line: recordLine, row: recordRow, extra: fields.splice(width) });
    }
    rows.push(fields);
  }
  return { columns: header ? (columns ?? []) : null, rows, errors };
}
