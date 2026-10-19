/** Deliberately small declarative YAML subset, not a general YAML interpreter. */
export function parseVerificationYaml(text: string): unknown {
  if (Buffer.byteLength(text, 'utf8') > 1024 * 1024) throw new Error('用例文件超过 1 MiB。');
  if (text.includes('\t')) throw new Error('用例 YAML 不支持制表符。');
  const lines = text.replace(/^\uFEFF/u, '').split(/\r?\n/u).map((raw, index) => {
    const value = stripComment(raw).trimEnd();
    return { indent: value.length - value.trimStart().length, value: value.trimStart(), number: index + 1 };
  }).filter(line => line.value);
  if (lines.length > 20000) throw new Error('用例 YAML 行数过多。');
  let cursor = 0;
  type Line = (typeof lines)[number];
  function fail(message: string): never { throw new Error(`用例 YAML 第 ${lines[cursor]?.number ?? '末'} 行：${message}`); }
  function field(line: Line, target: Record<string, unknown>, indent: number, depth: number): void {
    const match = /^([A-Za-z_][A-Za-z0-9_-]*):(?:\s+(.*))?$/u.exec(line.value);
    if (!match) fail('需要普通字段名与冒号；不支持标签、锚点、合并键或复杂键。');
    const key = match[1]!;
    if (['__proto__', 'constructor', 'prototype'].includes(key) || Object.hasOwn(target, key)) fail(`重复或不安全字段：${key}`);
    const value = match[2];
    if (value !== undefined && value !== '') target[key] = scalar(value);
    else {
      if (!lines[cursor] || lines[cursor]!.indent !== indent + 2) fail('空字段必须有缩进两格的子内容。');
      target[key] = block(indent + 2, depth + 1);
    }
  }
  function mapping(indent: number, depth: number, first?: Line): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    if (first) field(first, result, indent, depth);
    while (lines[cursor]?.indent === indent && !/^-(?:\s|$)/u.test(lines[cursor]!.value)) {
      const line = lines[cursor++]!;
      field(line, result, indent, depth);
    }
    return result;
  }
  function block(indent: number, depth: number): unknown {
    if (depth > 16) fail('嵌套深度超过 16。');
    if (lines[cursor]?.indent !== indent) fail('缩进必须为两格。');
    if (!/^-(?:\s|$)/u.test(lines[cursor]!.value)) return mapping(indent, depth);
    const result: unknown[] = [];
    while (lines[cursor]?.indent === indent && /^-(?:\s|$)/u.test(lines[cursor]!.value)) {
      const line = lines[cursor++]!;
      const value = line.value.slice(1).trimStart();
      if (!value) result.push(block(indent + 2, depth + 1));
      else if (/^[A-Za-z_][A-Za-z0-9_-]*:(?:\s|$)/u.test(value)) {
        result.push(mapping(indent + 2, depth + 1, { ...line, indent: indent + 2, value }));
      } else result.push(scalar(value));
    }
    return result;
  }
  if (!lines.length) throw new Error('用例 YAML 为空。');
  const result = block(0, 0);
  if (cursor !== lines.length) fail('不支持的缩进或混合结构。');
  return result;
}

function stripComment(value: string): string {
  let quote = '';
  for (let i = 0; i < value.length; i++) {
    const char = value[i]!;
    if (quote === '"' && char === '\\') { i++; continue; }
    if (quote === "'" && char === "'" && value[i + 1] === "'") { i++; continue; }
    if (quote && char === quote) quote = '';
    else if (!quote && (char === '"' || char === "'") && (i === 0 || /[\s:[,]/u.test(value[i - 1]!))) quote = char;
    else if (!quote && char === '#' && (i === 0 || /\s/u.test(value[i - 1]!))) return value.slice(0, i);
  }
  if (quote) throw new Error('用例 YAML 不支持多行或未闭合字符串。');
  return value;
}

function scalar(value: string): unknown {
  const input = value.trim();
  if (input.startsWith('"')) {
    let parsed: unknown;
    try { parsed = JSON.parse(input); } catch { throw new Error('无效的双引号字符串。'); }
    if (typeof parsed !== 'string') throw new Error('需要字符串。');
    return parsed;
  }
  if (input.startsWith("'")) {
    if (!/^'(?:[^']|'')*'$/u.test(input)) throw new Error('无效的单引号字符串。');
    return input.slice(1, -1).replace(/''/gu, "'");
  }
  if (input.startsWith('[')) {
    if (!input.endsWith(']')) throw new Error('无效的行内标量列表。');
    const body = input.slice(1, -1);
    if (!body.trim()) return [];
    const parts: string[] = [];
    let start = 0; let quote = '';
    for (let i = 0; i < body.length; i++) {
      const char = body[i]!;
      if (quote === '"' && char === '\\') { i++; continue; }
      if (quote === "'" && char === "'" && body[i + 1] === "'") { i++; continue; }
      if (quote && char === quote) quote = '';
      else if (!quote && (char === '"' || char === "'") && (i === 0 || /[\s,]/u.test(body[i - 1]!))) quote = char;
      else if (!quote && /[\[\]{}]/u.test(char)) throw new Error('行内列表只能包含标量。');
      else if (!quote && char === ',') { parts.push(body.slice(start, i)); start = i + 1; }
    }
    if (quote) throw new Error('行内列表引号未闭合。');
    parts.push(body.slice(start));
    return parts.map(part => scalar(part));
  }
  if (input === 'true' || input === 'false') return input === 'true';
  if (/^-?(?:0|[1-9]\d*)(?:\.\d+)?$/u.test(input)) {
    const number = Number(input);
    if (!Number.isFinite(number) || (!input.includes('.') && !Number.isSafeInteger(number))) throw new Error('数字超出安全范围。');
    return number;
  }
  if (!input || /^[!&*|>{}\[\],@`%?"']/u.test(input) || /:(?:\s|$)/u.test(input) || /^-(?:\s|$)/u.test(input) ||
      /^(?:null|~|yes|no|on|off|true|false)$/iu.test(input) ||
      /^[+-]?(?:\d|\.\d)/u.test(input) || /^\.(?:inf|nan)$/iu.test(input) || input === '---' || input === '...') {
    throw new Error(`不支持或有歧义的标量，请使用引号：${input}`);
  }
  return input;
}
