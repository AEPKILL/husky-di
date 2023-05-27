/**
 * @overview
 * @author AEPKILL
 * @created 2023-05-25 14:20:41
 */

export function formatStringsWithIndent(
  strings: string[],
  indent: number = 1
): string {
  return strings.reduce((result, it, index) => {
    result += `${" ".repeat(index * indent)}${it}`;

    const shouldBreak = index < strings.length - 1;
    if (shouldBreak) {
      result += "\n";
    }

    return result;
  }, "");
}
