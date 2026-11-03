/** Mensagem de progresso numa única linha (quando o terminal permite). */
export function createProgress(stream: NodeJS.WriteStream = process.stderr) {
  let last = "";
  return {
    update: (message: string) => {
      if (stream.isTTY) {
        stream.write(`\r${message.padEnd(last.length)}`);
      } else if (message.split(" ")[0] !== last.split(" ")[0] || !/\d+\/\d+/.test(message)) {
        stream.write(`${message}\n`);
      }
      last = message;
    },
    done: (message: string) => {
      if (stream.isTTY) stream.write(`\r${" ".repeat(last.length)}\r`);
      console.log(message);
    },
  };
}
