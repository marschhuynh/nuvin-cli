import EventEmitter from "node:events";

type FakeStdin = NodeJS.ReadStream & {
  send: (input: string) => void;
};

const createStdin = (): FakeStdin => {
  const stdin = new EventEmitter() as FakeStdin;
  stdin.isTTY = true;
  stdin.setEncoding = () => stdin;
  stdin.setRawMode = () => stdin;
  stdin.ref = () => stdin;
  stdin.unref = () => stdin;
  stdin.read = () => null;
  stdin.send = (input: string) => {
    let pending = input;
    stdin.read = () => {
      if (pending === null) {
        return null;
      }

      const next = pending;
      pending = null as string | null;
      return next;
    };
    stdin.emit("readable");
    stdin.read = () => null;
  };
  return stdin;
};

export default createStdin;
