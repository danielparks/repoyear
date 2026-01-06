/**
 * Sum an array-like.
 */
export function sum<T>(
  items: Iterable<T> | ArrayLike<T>,
  getValue: (item: T) => number,
): number {
  return Array.from(items).reduce((total, entry) => total + getValue(entry), 0);
}

/**
 * Split an array-like into a fixed number of chunks.
 */
export function chunk<T>(
  items: Iterable<T> | ArrayLike<T>,
  chunkCount: number,
): T[][] {
  const input = Array.from(items);
  const chunkLength = Math.max(1, input.length / chunkCount);
  const chunks = new Array<T[]>();
  for (let i = 0; Math.round(i) < input.length; i += chunkLength) {
    chunks.push(input.slice(Math.round(i), Math.round(i + chunkLength)));
  }
  return chunks;
}

/**
 * Return “count noun(s)”.
 */
export function countNoun(count: number, noun: string) {
  return `${count} ${pluralize(noun, count)}`;
}

/**
 * Make a noun plural (very incomplete).
 *
 * If `count == 1`, then this will just return the singular.
 */
export function pluralize(singular: string, count = 2) {
  if (count == 1) {
    return singular;
  } else if (singular.endsWith("y")) {
    return singular.slice(0, -1) + "ies";
  } else {
    return singular + "s";
  }
}
