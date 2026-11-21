// Variant H (iteration 2): indexOf-only parser, no regex at all. Differences vs
// solve6:
//  - No regex exec anywhere: field terminators are found with indexOf, and the
//    next LF/CR positions (ni/ri) are maintained across a record and refreshed
//    only when the scan passes them, so an unquoted field costs ONE indexOf(',')
//    and a quoted segment ONE indexOf('"'), with no per-exec match array to
//    allocate (the profile showed RegExp exec ~17% and GC ~20% of warm parse).
//  - No helper functions: the quoted/unquoted field loops are inline in run(),
//    with locals only; the junk/unterminated resync falls through to the same
//    inline unquoted loop with an init prefix.
//  - Fast path (clean / mid-field-quote line) is solve6's, unchanged; its
//    indexOf('\n') / indexOf('\r') results seed ni/ri for the slow path.
// Semantics are unchanged: BOM drop, stray CR, quote junk, unterminated quotes,
// short/long row errors, line counting through quoted breaks — all identical to
// the reference vendor/csv-reader/index.js.

const COMMA = 0;
const BREAK = 1;
const END = 2;
const INF = 1e9;

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
  // Next LF / CR at or after pos (INF when none). Refreshed when pos passes ni.
  let ni = INF;
  let ri = INF;

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

    const niRaw = text.indexOf('\n', pos);
    let spanEnd;
    let eolLen;
    let isEnd;
    if (niRaw === -1) {
      spanEnd = n;
      eolLen = 0;
      isEnd = true;
    } else if (niRaw > pos && text[niRaw - 1] === '\r') {
      spanEnd = niRaw - 1;
      eolLen = 2;
      isEnd = false;
    } else {
      spanEnd = niRaw;
      eolLen = 1;
      isEnd = false;
    }
    ni = niRaw === -1 ? INF : niRaw;
    const riRaw = text.indexOf('\r', pos);
    ri = riRaw === -1 ? INF : riRaw;

    let fields;
    let quoted = false;
    let end;
    if (ri >= spanEnd) {
      let qi = text.indexOf('"', pos);
      let fieldStartQuote = false;
      while (qi !== -1 && qi < spanEnd) {
        if (qi === pos || text[qi - 1] === ',') {
          fieldStartQuote = true;
          break;
        }
        qi = text.indexOf('"', qi + 1);
      }
      if (!fieldStartQuote) {
        fields = text.slice(pos, spanEnd).split(',');
        pos = spanEnd + eolLen;
        if (!isEnd) line += 1;
        end = isEnd ? END : BREAK;
      }
    }
    if (fields === undefined) {
      fields = [];
      for (;;) {
        let v;
        let init = '';
        let wasJunk = false;
        if (text[pos] === '"') {
          quoted = true;
          // Quoted field, inline: one indexOf('"') per segment; ni/ri (the
          // next LF/CR) decide whether a break comes before the quote.
          const open = pos;
          const openLine = line;
          let vv = '';
          let start = pos + 1;
          let done = false;
          for (;;) {
            if (start > ni || start > ri) {
              ni = text.indexOf('\n', start);
              if (ni === -1) ni = INF;
              ri = text.indexOf('\r', start);
              if (ri === -1) ri = INF;
            }
            const qiRaw = text.indexOf('"', start);
            const q = qiRaw === -1 ? INF : qiRaw;
            if (q < ni && q < ri) {
              if (text[q + 1] === '"') {
                vv += text.slice(start, q);
                vv += '"';
                start = q + 2;
                continue;
              }
              vv += text.slice(start, q);
              pos = q + 1;
              if (pos >= n) {
                v = vv;
                end = END;
                done = true;
                break;
              }
              const c = text[pos];
              if (c === ',') {
                pos += 1;
                v = vv;
                end = COMMA;
                done = true;
                break;
              }
              if (c === '\n') {
                pos += 1;
                line += 1;
                v = vv;
                end = BREAK;
                done = true;
                break;
              }
              if (c === '\r' && text[pos + 1] === '\n') {
                pos += 2;
                line += 1;
                v = vv;
                end = BREAK;
                done = true;
                break;
              }
              // Quote junk: fall through to the unquoted loop below (done
              // stays false); v is set there from init.
              init = vv;
              wasJunk = true;
              break;
            }
            if (ni < ri) {
              vv += text.slice(start, ni);
              vv += '\n';
              line += 1;
              start = ni + 1;
              continue;
            }
            if (ri !== INF) {
              vv += text.slice(start, ri);
              vv += '\n';
              line += 1;
              start = text[ri + 1] === '\n' ? ri + 2 : ri + 1;
              continue;
            }
            // No closing quote: literal quote, resync as unquoted. The resync
            // moves pos BACKWARD (open+1), so ni/ri — advanced to end of text
            // by the scan above — must be recomputed from the new pos, or the
            // unquoted loop below would miss the record's line break.
            pos = open + 1;
            line = openLine;
            ni = text.indexOf('\n', pos);
            if (ni === -1) ni = INF;
            ri = text.indexOf('\r', pos);
            if (ri === -1) ri = INF;
            errors.push({ code: 'unterminated_quote', line: recordLine, row: recordRow });
            init = '"';
            break;
          }
          if (done) {
            fields.push(v);
            if (end !== COMMA) break;
            continue;
          }
          // Fall through to the unquoted loop with init (junk or resync).
        } else {
          quoted = false;
        }
        // Unquoted field, inline: one indexOf(',') per field; ni/ri bound it.
        let vv = init;
        for (;;) {
          if (pos > ni || pos > ri) {
            ni = text.indexOf('\n', pos);
            if (ni === -1) ni = INF;
            ri = text.indexOf('\r', pos);
            if (ri === -1) ri = INF;
          }
          const ciRaw = text.indexOf(',', pos);
          const c = ciRaw === -1 ? INF : ciRaw;
          if (c < ni && c < ri) {
            vv += text.slice(pos, c);
            pos = c + 1;
            v = vv;
            end = COMMA;
            break;
          }
          if (ni <= ri) {
            if (ni === INF) {
              if (pos < n) vv += text.slice(pos);
              pos = n;
              v = vv;
              end = END;
              break;
            }
            vv += text.slice(pos, ni);
            pos = ni + 1;
            line += 1;
            v = vv;
            end = BREAK;
            break;
          }
          if (text[ri + 1] === '\n') {
            vv += text.slice(pos, ri);
            pos = ri + 2;
            line += 1;
            v = vv;
            end = BREAK;
            break;
          }
          errors.push({ code: 'stray_cr', line: recordLine, row: recordRow });
          vv += text.slice(pos, ri);
          pos = ri + 1;
        }
        if (wasJunk && v.length > init.length) errors.push({ code: 'quote_junk', line: recordLine, row: recordRow });
        fields.push(v);
        if (end !== COMMA) break;
      }
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
