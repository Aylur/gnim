#!/usr/bin/env node

import { arch, platform, argv, exit, kill, pid } from "node:process"
import { spawnSync } from "node:child_process"
import { chmod } from "node:fs/promises"
import { fileURLToPath } from "node:url"

const supportedPlatforms = ["linux-x64"]
const target = `${platform}-${arch}`

if (!supportedPlatforms.includes(target)) {
    throw Error(`${target} is not yet supported`)
}

const cli = fileURLToPath(import.meta.resolve(`@gnim-js/${target}`))
await chmod(cli, 0o755)

const processResult = spawnSync(cli, argv.slice(2), {
    stdio: "inherit",
})

if (processResult.error) {
    console.error(`Failed to run ${cli}: ${processResult.error.message}`)
    exit(1)
}

if (processResult.signal) {
    kill(pid, processResult.signal)
}

exit(processResult.status ?? 1)
