/**
 * @overview
 * @author AEPKILL
 * @created 2021-10-04 07:11:17
 */

export class ResolveLogger {
  private _messages: string[] = [];

  get messages(): string[] {
    return this._messages;
  }

  getResolveException(message?: string): Error {
    if (message) {
      this.pushMessage(message);
    }
    return new Error(this.getMessage());
  }

  getMessage(): string {
    const messagesLength = this.messages.length;

    return this.messages.reduce((message, it, index) => {
      const shouldBreak = index < messagesLength - 1;

      message += ' '.repeat(index) + it;
      if (shouldBreak) {
        message += '\n';
      }

      return message;
    }, '');
  }

  pushMessage(message: string): void {
    this._messages.push(message);
  }

  popMessage() {
    this._messages.pop();
  }

  clone(): ResolveLogger {
    const resolveLogger = new ResolveLogger();
    resolveLogger._messages = this._messages.slice();

    return resolveLogger;
  }
}
