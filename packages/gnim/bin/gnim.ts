#!/usr/bin/env node

import { arch, platform, argv, exit } from "node:process"
import { spawnSync } from "node:child_process"
import { chmod } from "node:fs/promises"

const supportedPlatforms = ["linux-x64"]
const target = `${platform}-${arch}`

if (!supportedPlatforms.includes(target)) {
    throw Error(`${target} is not yet supported`)
}

const cli = import.meta.resolve(`@gnim-js/${target}`).replace("file://", "")
await chmod(cli, 0o755)

const processResult = spawnSync(cli, argv.slice(2), {
    stdio: "inherit",
})

exit(processResult.status ?? 0)
