const TARGET_RE = /^([^\s:#][^:]*):(?!=)/;
const INCLUDE_RE = /^\s*(?:-?include|sinclude)\s+(.+)$/;
const PHONY_RE = /^\s*\.PHONY\s*:\s*(.*)$/;

export function parseTargets(text: string): string[] {
  const targets: string[] = [];
  let inDefine = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*define(?:\s+[^\s#]+)?\s*$/.test(line)) {
      inDefine = true;
      continue;
    }
    if (inDefine) {
      if (/^\s*endef\s*$/.test(line)) inDefine = false;
      continue;
    }
    if (line.startsWith('\t')) continue;
    const match = TARGET_RE.exec(line);
    if (!match) continue;
    for (const name of match[1].trim().split(/\s+/)) {
      if (name.startsWith('.') || name.includes('%') || targets.includes(name)) continue;
      targets.push(name);
    }
  }
  return targets;
}

export function parseIncludes(text: string): string[] {
  const includes: string[] = [];
  let inDefine = false;
  for (const line of text.split(/\r?\n/)) {
    if (/^\s*define(?:\s+[^\s#]+)?\s*$/.test(line)) {
      inDefine = true;
      continue;
    }
    if (inDefine) {
      if (/^\s*endef\s*$/.test(line)) inDefine = false;
      continue;
    }
    const match = INCLUDE_RE.exec(line);
    if (!match) continue;
    for (const name of match[1].replace(/\s+#.*$/, '').trim().split(/\s+/)) {
      if (name && !name.includes('$')) includes.push(name);
    }
  }
  return includes;
}

export function parsePhonyTargets(text: string): Set < string > {
  const targets = new Set < string > ();
  for (const line of text.split(/\r?\n/)) {
    const match = PHONY_RE.exec(line);
    if (!match) continue;
    for (const target of match[1].trim().split(/\s+/)) {
      if (target) targets.add(target);
    }
  }
  return targets;
}

export function parseVariables(text: string): Map < string, string > {
  const variables = new Map < string,
    string > ();
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Za-z_][A-Za-z0-9_]*)\s*(\?\=|\:\=|\+\=|\=)\s*(.*?)\s*$/.exec(line);
    if (!match) continue;
    const [, name, operator, value] = match;
    if (operator === '?=') {
      if (!variables.has(name)) variables.set(name, value);
    } else if (operator === '+=') {
      variables.set(name, variables.has(name) ? `${variables.get(name)} ${value}` : value);
    } else if (operator === ':=') {
      variables.set(name, expandVariables(value, variables));
    } else {
      variables.set(name, value);
    }
  }
  return variables;
}

function expandVariables(value: string, variables: Map < string, string > ): string {
  let expanded = value;
  for (let pass = 0; pass < 10; pass++) {
    const next = expanded.replace(/\$\(([^()]+)\)|\$\{([^{}]+)\}/g, (match, parenName, braceName) => variables.get(parenName || braceName) ?? match);
    if (next === expanded) break;
    expanded = next;
  }
  return expanded;
}
