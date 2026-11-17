// PreToolUse hook: refuse shell commands that touch a .env file (secrets).
// .env.example is allowed. Code such as process.env or os.environ is not
// affected, because those have a letter right before ".env".
// Exit code 2 blocks the tool call and shows the message to Claude.
let raw = '';
process.stdin.on('data', (c) => { raw += c; });
process.stdin.on('end', () => {
  let command = '';
  try { command = String(JSON.parse(raw)?.tool_input?.command || ''); } catch { process.exit(0); }
  const hits = command.match(/(?<![\w$])\.env(?:\.[\w-]+)*(?![\w-])/g) || [];
  const blocked = hits.filter((h) => h !== '.env.example');
  if (blocked.length) {
    process.stderr.write(`Blocked: this command touches ${[...new Set(blocked)].join(', ')}. .env files hold secrets and are off limits in this project. Use .env.example instead, or ask the user to make the change.\n`);
    process.exit(2);
  }
  process.exit(0);
});
