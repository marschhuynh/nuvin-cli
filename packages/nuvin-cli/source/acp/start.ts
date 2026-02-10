export async function startAcpServer({
  stdin,
  stdout,
  stderr,
}: {
  stdin: NodeJS.ReadableStream;
  stdout: NodeJS.WritableStream;
  stderr: NodeJS.WritableStream;
}) {
  stderr.write('ACP server starting\n');
  stdin.on('data', () => {});
  stdout.write('');
}
