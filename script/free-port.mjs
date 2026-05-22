import { execSync } from 'node:child_process'

const port = process.argv[2]

if (!port) {
  console.error('Usage: node ./script/free-port.mjs <port>')
  process.exit(1)
}

try {
  const pids = execSync(`lsof -ti tcp:${port}`, { encoding: 'utf8' })
    .split('\n')
    .map((value) => value.trim())
    .filter(Boolean)

  if (pids.length === 0) {
    process.exit(0)
  }

  for (const pid of pids) {
    try {
      process.kill(Number(pid), 'SIGKILL')
    } catch {
      // Ignore processes that already exited.
    }
  }
} catch {
  process.exit(0)
}
