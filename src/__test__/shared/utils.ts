/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-12 15:07:38
 */

export function getMessage(messages: string[]) {
  return messages.reduce((message, it, index) => {
    const shouldBreak = index < messages.length - 1;

    message += ' '.repeat(index) + it;
    if (shouldBreak) {
      message += '\n';
    }

    return message;
  }, '');
}
