#!/usr/bin/env node

import { confirm, intro, isCancel, outro, spinner, text } from "@clack/prompts"
import { execFile } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { existsSync } from "node:fs"
import { join } from "node:path"

const execFileAsync = promisify(execFile)

function detectPackageManager() {
    if (!process.env.npm_config_user_agent) return
    const specifier = process.env.npm_config_user_agent.split(" ")[0]
    return specifier.substring(0, specifier.lastIndexOf("/"))
}

function defaultDirs(): string[] {
    const dataDirs =
        process.env.XDG_DATA_DIRS ??
        ["/usr/share", "/usr/locale/share"].join(":")

    const dirs = dataDirs
        .split(":")
        .filter(function (path) {
            return path !== "/run/current-system/sw/share"
        })
        .map(function (path) {
            return join(path, "gir-1.0")
        })
        .filter(function (girPath) {
            try {
                return existsSync(girPath) && statSync(girPath).isDirectory()
            } catch {
                return false
            }
        })

    dirs.sort()

    return dirs.filter(function (dir, index) {
        return index === 0 || dirs[index - 1] !== dir
    })
}

export async function replaceInFile(
    path: string,
    search: string,
    replacement: string,
) {
    const input = await readFile(path, "utf8")
    const output = input.replaceAll(search, replacement)
    return writeFile(path, output, "utf8")
}

async function gtk4() {
    const pm = detectPackageManager() ?? "npm"

    const targetDir = await text({
        message: "Where should the project be created?",
        placeholder: "./myapp",
        validate(path) {
            if (!path) return "Directory is required"
            try {
                const s = statSync(path)
                if (s.isFile()) return "Target is an existing file"
                if (!s.isDirectory()) return
                if (readdirSync(path).length > 0) {
                    return "Directory is not empty"
                }
            } catch {
                // noop
            }
        },
    })

    if (isCancel(targetDir)) {
        process.exit(0)
    }

    const id = await text({
        message: "Pick an application ID",
        placeholder: "com.example.MyApp",
        validate(id) {
            if (!id) {
                return "ID is required"
            }

            if (id.length === 0) {
                return "The ID cannot be empty."
            }

            if (id.length > 255) {
                return "The ID must not exceed 255 characters."
            }

            if (id.startsWith(".")) {
                return "The ID must not begin with a period."
            }

            const parts = id.split(".")

            if (parts.length < 2) {
                return "The ID must contain at least one period."
            }

            for (const part of parts) {
                if (part.length === 0) {
                    return "Each segment between periods must contain at least one character."
                }

                if (/^\d/.test(part)) {
                    return "Each segment must not begin with a digit."
                }

                if (!/^[A-Za-z0-9_-]+$/.test(part)) {
                    return "Each segment may only contain ASCII letters, digits, underscores, or hyphens."
                }
            }
        },
    })

    if (isCancel(id)) {
        process.exit(0)
    }

    const name = await text({
        message: "Pick an application name",
        placeholder: "my-app",
        validate(name) {
            if (!name) return "A name is required"
        },
    })

    if (isCancel(name)) {
        process.exit(0)
    }

    const git = await confirm({
        message: "Initialize git?",
    })

    if (isCancel(git)) {
        process.exit(0)
    }

    const install = await confirm({
        message: `Install dependencies via ${pm}?`,
    })

    if (isCancel(install)) {
        process.exit(0)
    }

    // copy template
    const template = import.meta
        .resolve("../templates/gtk4")
        .replace("file://", "")

    await mkdir(targetDir, { recursive: true })
    await cp(template, targetDir, { recursive: true })

    // rename icons
    await rename(
        `${targetDir}/data/icons/__app-id__.svg`,
        `${targetDir}/data/icons/${id}.svg`,
    )
    await rename(
        `${targetDir}/data/icons/__app-id__-symbolic.svg`,
        `${targetDir}/data/icons/${id}-symbolic.svg`,
    )

    // gschema
    await rename(
        `${targetDir}/src/__app-id__.gschema.ts`,
        `${targetDir}/src/${id}.gschema.ts`,
    )
    await replaceInFile(`${targetDir}/src/${id}.gschema.ts`, "__app-id__", id)

    // main
    await replaceInFile(`${targetDir}/src/main.ts`, "__app-id__", id)
    await replaceInFile(`${targetDir}/src/main.ts`, "__app-name__", name)

    // meson
    await replaceInFile(`${targetDir}/meson.build`, "__app-id__", id)
    await replaceInFile(`${targetDir}/meson.build`, "__app-name__", name)

    // package.json
    await replaceInFile(`${targetDir}/package.json`, "__app-name__", name)

    if (install) {
        const s = spinner()
        s.start(`Installing via ${pm}`)
        await execFileAsync(pm, ["install"], { cwd: targetDir })
        s.stop(`Installed dependencies via ${pm}`)
    }

    if (git) {
        await execFileAsync("git", ["init"], { cwd: targetDir })
        await execFileAsync("git", ["add", "."], { cwd: targetDir })
        await execFileAsync("git", ["commit", "-m", "init"], { cwd: targetDir })
    }

    const s = spinner()
    s.start(`Generating GIR types`)
    if (defaultDirs().length > 0) {
        await execFileAsync(pm, ["run", "types"], { cwd: targetDir })
        s.stop("GIR types generated")
    } else {
        s.error("Failed to generate types: nothing to generate")
    }

    const cmds = install
        ? [`cd ${targetDir}`, `${pm} run dev`]
        : [`cd ${targetDir}`, `${pm} install`, `${pm} run dev`]

    outro(
        [
            "Done.",
            "   You can now cd into the project and start developing.\n",
            ...cmds.map((cmd) => `   ${cmd}`),
        ].join("\n"),
    )
}

async function main() {
    console.log()
    intro(`\x1b[7;34m\x1b[1m${" Create Gnim "}\x1b[0m`)
    try {
        return await gtk4()
    } catch (err) {
        console.error(err)
        process.exit(0)
    }
}

main()
