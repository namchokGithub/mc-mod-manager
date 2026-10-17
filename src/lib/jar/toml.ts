// Small TOML reader covering what mods.toml files use: tables, arrays of tables, dotted and
// quoted keys, strings (basic, literal, multiline), numbers, booleans, arrays, and inline tables.
// Dates and other scalars are kept as strings.

export type TomlValue = string | number | boolean | TomlValue[] | TomlTable;
export type TomlTable = { [key: string]: TomlValue };

export class TomlError extends Error {
  constructor(message: string, line: number) {
    super(`${message} (line ${line})`);
    this.name = "TomlError";
  }
}

const BARE_KEY = /[A-Za-z0-9_-]/;

function isTable(value: TomlValue | undefined): value is TomlTable {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function parseToml(text: string): TomlTable {
  const source = text.replace(/\r\n/g, "\n");
  const root: TomlTable = {};
  let current = root;
  let index = 0;

  const line = () => source.slice(0, index).split("\n").length;
  const fail = (message: string): never => {
    throw new TomlError(message, line());
  };
  const peek = (value: string) => source.startsWith(value, index);
  const skipSpaces = () => {
    while (source[index] === " " || source[index] === "\t") index += 1;
  };
  const skipComment = () => {
    if (source[index] === "#")
      while (index < source.length && source[index] !== "\n") index += 1;
  };
  const skipBlank = () => {
    for (;;) {
      skipSpaces();
      skipComment();
      if (source[index] === "\n") index += 1;
      else break;
    }
  };

  function parseEscape(): string {
    const char = source[index + 1] ?? "";
    index += 2;
    const simple: Record<string, string> = {
      b: "\b",
      t: "\t",
      n: "\n",
      f: "\f",
      r: "\r",
      '"': '"',
      "\\": "\\",
    };
    const mapped = simple[char];
    if (mapped !== undefined) return mapped;
    if (char === "u" || char === "U") {
      const length = char === "u" ? 4 : 8;
      const hex = source.slice(index, index + length);
      if (!/^[0-9a-fA-F]+$/.test(hex) || hex.length !== length)
        fail("Invalid unicode escape");
      index += length;
      return String.fromCodePoint(parseInt(hex, 16));
    }
    return fail(`Invalid escape \\${char}`);
  }

  function parseString(): string {
    if (peek('"""')) {
      index += 3;
      if (source[index] === "\n") index += 1;
      let out = "";
      while (!peek('"""')) {
        if (index >= source.length) fail("Unterminated string");
        if (source[index] === "\\") {
          // A line-ending backslash trims the newline and leading whitespace that follows.
          if (/^\\[ \t]*\n/.test(source.slice(index, index + 64))) {
            index += 1;
            while (/[ \t\n]/.test(source[index] ?? "")) index += 1;
          } else out += parseEscape();
        } else out += source[index++];
      }
      index += 3;
      return out;
    }
    if (peek("'''")) {
      index += 3;
      if (source[index] === "\n") index += 1;
      const end = source.indexOf("'''", index);
      if (end < 0) fail("Unterminated string");
      const out = source.slice(index, end);
      index = end + 3;
      return out;
    }
    const quote = source[index];
    index += 1;
    let out = "";
    while (source[index] !== quote) {
      if (index >= source.length || source[index] === "\n")
        fail("Unterminated string");
      if (quote === '"' && source[index] === "\\") out += parseEscape();
      else out += source[index++];
    }
    index += 1;
    return out;
  }

  function parseKeyPart(): string {
    skipSpaces();
    if (source[index] === '"' || source[index] === "'") return parseString();
    const start = index;
    while (BARE_KEY.test(source[index] ?? "")) index += 1;
    if (start === index) fail("Expected a key");
    return source.slice(start, index);
  }

  function parseKey(): string[] {
    const parts = [parseKeyPart()];
    skipSpaces();
    while (source[index] === ".") {
      index += 1;
      parts.push(parseKeyPart());
      skipSpaces();
    }
    return parts;
  }

  function parseValue(): TomlValue {
    const char = source[index];
    if (char === '"' || char === "'") return parseString();
    if (char === "[") {
      index += 1;
      const items: TomlValue[] = [];
      for (;;) {
        skipBlank();
        if (source[index] === "]") break;
        items.push(parseValue());
        skipBlank();
        if (source[index] === ",") index += 1;
        else if (source[index] !== "]") fail("Expected , or ] in array");
      }
      index += 1;
      return items;
    }
    if (char === "{") {
      index += 1;
      const table: TomlTable = {};
      skipSpaces();
      if (source[index] === "}") {
        index += 1;
        return table;
      }
      for (;;) {
        const key = parseKey();
        if (source[index] !== "=") fail("Expected = in inline table");
        index += 1;
        skipSpaces();
        assign(table, key, parseValue());
        skipSpaces();
        if (source[index] === ",") index += 1;
        else if (source[index] === "}") {
          index += 1;
          return table;
        } else fail("Expected , or } in inline table");
      }
    }
    const start = index;
    while (index < source.length && !/[,\]}\n#]/.test(source[index] ?? ""))
      index += 1;
    const raw = source.slice(start, index).trim();
    if (!raw) fail("Expected a value");
    if (raw === "true") return true;
    if (raw === "false") return false;
    const numeric = raw.replace(/_/g, "");
    if (/^[+-]?(\d+(\.\d+)?([eE][+-]?\d+)?|0x[0-9a-fA-F]+)$/.test(numeric))
      return Number(numeric);
    return raw;
  }

  function assign(table: TomlTable, key: string[], value: TomlValue) {
    let target = table;
    for (const part of key.slice(0, -1)) {
      const next = target[part];
      if (next === undefined) target = target[part] = {};
      else if (isTable(next)) target = next;
      else fail(`Key ${key.join(".")} conflicts with an existing value`);
    }
    const last = key[key.length - 1] ?? fail("Expected a key");
    if (last in target) fail(`Duplicate key ${key.join(".")}`);
    target[last] = value;
  }

  function navigate(path: string[]): TomlTable {
    let target = root;
    for (const part of path) {
      const next = target[part];
      if (next === undefined) target = target[part] = {};
      else if (isTable(next)) target = next;
      else if (Array.isArray(next) && isTable(next[next.length - 1]))
        target = next[next.length - 1] as TomlTable;
      else fail(`Table ${path.join(".")} conflicts with an existing value`);
    }
    return target;
  }

  for (;;) {
    skipBlank();
    if (index >= source.length) break;
    if (peek("[[")) {
      index += 2;
      const path = parseKey();
      if (!peek("]]")) fail("Expected ]]");
      index += 2;
      const parent = navigate(path.slice(0, -1));
      const last = path[path.length - 1] ?? fail("Expected a table name");
      const existing = parent[last];
      const table: TomlTable = {};
      if (existing === undefined) parent[last] = [table];
      else if (Array.isArray(existing)) existing.push(table);
      else fail(`${path.join(".")} is not an array of tables`);
      current = table;
    } else if (source[index] === "[") {
      index += 1;
      const path = parseKey();
      if (source[index] !== "]") fail("Expected ]");
      index += 1;
      current = navigate(path);
    } else {
      const key = parseKey();
      if (source[index] !== "=") fail("Expected =");
      index += 1;
      skipSpaces();
      assign(current, key, parseValue());
    }
    skipSpaces();
    skipComment();
    if (index < source.length && source[index] !== "\n")
      fail("Unexpected text after value");
  }
  return root;
}
