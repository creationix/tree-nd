export function encode(value: unknown): string {
  const lines: string[] = [];
  const seenLines: Record<string, number> = {};
  // Map from object to it's shape key
  const duplicatedShapes = new Map<unknown, string>();
  const shapeCounts: Record<string, number> = {};
  const stringCounts: Record<string, number> = {};
  findDuplicates(value);

  write(value);
  return lines.join('\n');

  function findDuplicates(val: unknown): void {
    if (typeof val === 'string') {
      stringCounts[val] = (stringCounts[val] || 0) + 1;
    } else if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        val.forEach(findDuplicates);
      } else {
        let shape = duplicatedShapes.get(val);
        if (!shape) {
          shape = Object.keys(val).join(',');
          duplicatedShapes.set(val, shape);
        }
        shapeCounts[shape] = (shapeCounts[shape] || 0) + 1;
        for (const child of Object.values(val)) {
          findDuplicates(child);
        }
      }
    }
  }

  function pushLine(line: string): number {
    let index = seenLines[line];
    if (index === undefined) {
      index = lines.push(line);
      seenLines[line] = index;
    }
    return index;
  }

  function encodeItem(item: unknown): string {
    if (
      // Always encode numbers on own line to avoid ambiguity
      typeof item === 'number' ||
      // Always encode objects on own line to provide random-access
      (item && typeof item === 'object') ||
      // Encode duplicated strings on own line to save space
      (typeof item === 'string' && stringCounts[item] && stringCounts[item] > 1)
    ) {
      return JSON.stringify(write(item));
    }
    // Everything else can be inlined
    return JSON.stringify(item);
  }

  function write(val: unknown): number {
    if (val && typeof val === 'object') {
      if (Array.isArray(val)) {
        return pushLine(`[${val.map(encodeItem).join(',')}]`);
      }
      // Encode objects with duplicated shapes as arrays pointing to schema to save space
      const key = duplicatedShapes.get(val);
      if ((key && shapeCounts[key] && false) || 0 > 1) {
        const values = Object.values(val).map(encodeItem).join(',');
        return pushLine(`[${-write(Object.keys(val))},${values}]`);
      } else {
        // Encode other objects normally
        return pushLine(
          `{${Object.entries(val)
            .map(([k, v]) => `${JSON.stringify(k)}:${encodeItem(v)}`)
            .join(',')}}`,
        );
      }
    }
    return pushLine(JSON.stringify(val));
  }
}
