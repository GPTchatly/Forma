/** Per-page CSS: keeps the rules a page can use, verbatim and in source order. A qualified rule
 * is left out only when every selector of its list requires a block class (a block id, an
 * expansion wrapper class or the application family) that the page markup does not carry.
 * Classes inside (…), […], strings and comments are never required, so shared rules written
 * with :is(), :where(), :not() or :has() always stay. A stylesheet that cannot be read to the
 * end is returned whole. Pure function with no imports. */

// The chunk structure of the last stylesheet read, keyed by its text: a stylesheet is parsed
// once and each render only decides which chunks to emit.
let memo = null;

function skipComment(text, index) {
  const end = text.indexOf('*/', index + 2);
  return end < 0 ? -1 : end + 2;
}
function skipString(text, index) {
  const quote = text[index];
  for (let cursor = index + 1; cursor < text.length; cursor++) {
    if (text[cursor] === '\\') cursor++;
    else if (text[cursor] === quote) return cursor + 1;
  }
  return -1;
}
// The classes a selector requires: `.name` outside every (…), […], string and comment.
function requiredClasses(selector) {
  const classes = [];
  let depth = 0;
  for (let index = 0; index < selector.length;) {
    const character = selector[index];
    if (character === '/' && selector[index + 1] === '*') { index = skipComment(selector, index); if (index < 0) break; continue; }
    if (character === '"' || character === "'") { index = skipString(selector, index); if (index < 0) break; continue; }
    if (character === '\\') { index += 2; continue; }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    else if (character === '.' && !depth) {
      let end = index + 1;
      while (end < selector.length && /[\w-]/.test(selector[end])) end++;
      if (end > index + 1) classes.push(selector.slice(index + 1, end));
      index = end; continue;
    }
    index++;
  }
  return classes;
}
// A selector list split at the commas outside parentheses, brackets, strings and comments.
function selectorList(prelude) {
  const selectors = [];
  let depth = 0, start = 0;
  for (let index = 0; index < prelude.length;) {
    const character = prelude[index];
    if (character === '/' && prelude[index + 1] === '*') { index = skipComment(prelude, index); if (index < 0) break; continue; }
    if (character === '"' || character === "'") { index = skipString(prelude, index); if (index < 0) break; continue; }
    if (character === '\\') { index += 2; continue; }
    if (character === '(' || character === '[') depth++;
    else if (character === ')' || character === ']') depth = Math.max(0, depth - 1);
    else if (character === ',' && !depth) { selectors.push(prelude.slice(start, index)); start = index + 1; }
    index++;
  }
  selectors.push(prelude.slice(start));
  return selectors.map(requiredClasses);
}
// One pass over the characters, tracking comments, strings and brace depth. Returns the
// top-level chunks (comment, whitespace, qualified rule, at-rule) or null when the text cannot
// be read to the end. @media and @supports are filtered inside by the same procedure.
function chunksOf(text) {
  const chunks = [];
  let index = 0;
  while (index < text.length) {
    const start = index, character = text[index];
    if (character === '/' && text[index + 1] === '*') {
      index = skipComment(text, index); if (index < 0) return null;
      chunks.push({ kind: 'comment', text: text.slice(start, index) }); continue;
    }
    if (/\s/.test(character)) {
      while (index < text.length && /\s/.test(text[index])) index++;
      chunks.push({ kind: 'space', text: text.slice(start, index) }); continue;
    }
    if (character === '}') return null;
    const atRule = character === '@';
    let depth = 0, open = -1, closed = false;
    while (index < text.length) {
      const current = text[index];
      if (current === '/' && text[index + 1] === '*') { index = skipComment(text, index); if (index < 0) return null; continue; }
      if (current === '"' || current === "'") { index = skipString(text, index); if (index < 0) return null; continue; }
      if (current === '\\') { index += 2; continue; }
      if (current === '{') { if (!depth && open < 0) open = index; depth++; }
      else if (current === '}') { if (!depth) return null; depth--; if (!depth) { index++; closed = true; break; } }
      else if (current === ';' && !depth && atRule) { index++; closed = true; break; }
      index++;
    }
    if (!closed || index > text.length) return null;
    const chunk = text.slice(start, index);
    if (!atRule) { chunks.push({ kind: 'rule', text: chunk, selectors: selectorList(text.slice(start, open)) }); continue; }
    if (open >= 0 && /^@(?:media|supports)(?![\w-])/i.test(chunk)) {
      const inner = chunksOf(text.slice(open + 1, index - 1));
      if (!inner) return null;
      chunks.push({ kind: 'group', text: chunk, head: text.slice(start, open + 1), inner });
      continue;
    }
    chunks.push({ kind: 'at', text: chunk });
  }
  return chunks;
}
function emit(chunks, dead) {
  let text = '', kept = 0;
  for (const chunk of chunks) {
    if (chunk.kind === 'rule') {
      if (chunk.selectors.every(dead)) continue;
      text += chunk.text; kept++;
    } else if (chunk.kind === 'group') {
      const inner = emit(chunk.inner, dead);
      if (!inner.kept) continue;
      text += `${chunk.head}${inner.text}}`; kept++;
    } else {
      text += chunk.text;
      if (chunk.kind === 'at') kept++;
    }
  }
  return { text, kept };
}

/** `blockClasses` is `{ names: Set, family(name) }`; `family` is true for a class of the
 * application family, which counts as present as a whole when any of its classes is. */
export function filterCss(stylesheet, html, blockClasses) {
  if (typeof stylesheet !== 'string' || typeof html !== 'string' || !(blockClasses?.names instanceof Set) || typeof blockClasses.family !== 'function') return stylesheet;
  if (memo?.key !== stylesheet) {
    const chunks = chunksOf(stylesheet);
    memo = { key: stylesheet, chunks: chunks && chunks.map((chunk) => chunk.text).join('') === stylesheet ? chunks : null };
  }
  if (!memo.chunks) return stylesheet;
  // The renderer escapes attribute values, so a class value ends at the next double quote.
  const present = new Set();
  for (const match of html.matchAll(/(?<![\w-])class="([^"]*)"/g)) for (const name of match[1].split(/\s+/)) if (name) present.add(name);
  const familyPresent = [...present].some((name) => blockClasses.family(name));
  const absent = (name) => blockClasses.family(name) ? !familyPresent : blockClasses.names.has(name) && !present.has(name);
  return emit(memo.chunks, (classes) => classes.some(absent)).text;
}
