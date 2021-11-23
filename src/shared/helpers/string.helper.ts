/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 17:04:53
 */

export function generateStringsIndent(
  strings: string[],
  indent: number = 1
): string {
  return strings.reduce((result, it, index) => {
    const shouldBreak = index < strings.length - 1;
    result = `${' '.repeat(index * indent)}${it}`;

    if (shouldBreak) {
      result += '\n';
    }

    return result;
  }, '');
}
