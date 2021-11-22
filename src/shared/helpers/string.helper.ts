/**
 * @overview
 * @author AEPKILL
 * @created 2021-11-22 17:04:53
 */

export function generateIndentMessages(
  messages: string[],
  indent: number = 1
): string {
  return messages.reduce((result, it, index) => {
    const shouldBreak = index < messages.length - 1;
    result = `${' '.repeat(index * indent)}${it}`;

    if (shouldBreak) {
      result += '\n';
    }

    return result;
  }, '');
}
