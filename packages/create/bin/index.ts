#!/usr/bin/env node

import {
    confirm,
    intro,
    isCancel,
    outro,
    select,
    spinner,
    text,
} from "@clack/prompts"
import { execFile } from "node:child_process"
import { readdirSync, statSync } from "node:fs"
import { cp, mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { promisify } from "node:util"
import { existsSync } from "node:fs"
import { join } from "node:path"

const execFileAsync = promisify(execFile)

type TemplateProps = {
    dir: string
    name: string
    id: string
    description: string
}

function detectPackageManager() {
    if (!process.env.npm_config_user_agent) return "npm"
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

async function replaceInFile(
    path: string,
    search: string,
    replacement: string,
) {
    const input = await readFile(path, "utf8")
    const output = input.replaceAll(search, replacement)
    return writeFile(path, output, "utf8")
}

async function askTargetDir() {
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

    return targetDir
}

async function askAppId(placeholder: string) {
    const id = await text({
        message: "Pick an application ID",
        placeholder,
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

    return id
}

async function askGnomeUuid() {
    const id = await text({
        message: "Pick an extension UUID.",
        placeholder: "my-extension@me.dev",
        validate(id) {
            if (!id) {
                return "ID is required"
            }

            if (!/^[A-Za-z0-9._-]+@[A-Za-z0-9._-]+$/.test(id)) {
                return "ID must be in the format of an email address"
            }
        },
    })

    if (isCancel(id)) {
        process.exit(0)
    }

    return id
}

async function askDescription() {
    const id = await text({
        message: "Provide a short description",
        placeholder: "An awesome app that lets you do things",
    })

    if (isCancel(id)) {
        process.exit(0)
    }

    return id
}

async function askAppName(placeholder: string) {
    const name = await text({
        message: "Pick an application name",
        placeholder,
        validate(name) {
            if (!name) return "A name is required"
        },
    })

    if (isCancel(name)) {
        process.exit(0)
    }

    return name
}

async function askGit() {
    const git = await confirm({
        message: "Initialize git?",
    })

    if (isCancel(git)) {
        process.exit(0)
    }

    return git
}

async function askInstall() {
    const install = await confirm({
        message: `Install dependencies via ${detectPackageManager()}?`,
    })

    if (isCancel(install)) {
        process.exit(0)
    }

    return install
}

async function doInstall(cwd: string) {
    const pm = detectPackageManager()
    const s = spinner()
    s.start(`Installing via ${pm}`)
    await execFileAsync(pm, ["install"], { cwd })
    s.stop(`Installed dependencies via ${pm}`)
}

async function doGit(cwd: string) {
    await execFileAsync("git", ["init"], { cwd })
    await execFileAsync("git", ["add", "."], { cwd })
    await execFileAsync("git", ["commit", "-m", "init"], { cwd })
}

async function doTypes(cwd: string) {
    const pm = detectPackageManager()
    const s = spinner()
    s.start(`Generating GIR types`)
    if (defaultDirs().length > 0) {
        await execFileAsync(pm, ["run", "types"], { cwd })
        s.stop("GIR types generated")
    } else {
        s.error("Failed to generate types: nothing to generate")
    }
}

async function doOutro(dir: string, install?: boolean) {
    const pm = detectPackageManager()

    const cmds = install
        ? [`cd ${dir}`, `${pm} run dev`]
        : [`cd ${dir}`, `${pm} install`, `${pm} run dev`]

    outro(
        [
            "Done.",
            "   You can now cd into the project and start developing.\n",
            ...cmds.map((cmd) => `   ${cmd}`),
        ].join("\n"),
    )
}

async function copyAdwaita({ dir, id, name }: TemplateProps) {
    const template = import.meta
        .resolve("../templates/adwaita")
        .replace("file://", "")

    await mkdir(dir, { recursive: true })
    await cp(template, dir, { recursive: true })

    // rename icons
    await rename(
        `${dir}/data/icons/__app-id__.svg`,
        `${dir}/data/icons/${id}.svg`,
    )
    await rename(
        `${dir}/data/icons/__app-id__-symbolic.svg`,
        `${dir}/data/icons/${id}-symbolic.svg`,
    )

    // gschema
    await rename(
        `${dir}/src/__app-id__.gschema.ts`,
        `${dir}/src/${id}.gschema.ts`,
    )
    await replaceInFile(`${dir}/src/${id}.gschema.ts`, "__app-id__", id)

    // main
    await replaceInFile(`${dir}/src/main.ts`, "__app-id__", id)
    await replaceInFile(`${dir}/src/main.ts`, "__app-name__", name)

    // meson
    await replaceInFile(`${dir}/meson.build`, "__app-id__", id)
    await replaceInFile(`${dir}/meson.build`, "__app-name__", name)

    // package.json
    await replaceInFile(`${dir}/package.json`, "__app-name__", name)
}

async function copyAstal({ dir, id, name }: TemplateProps) {
    const template = import.meta
        .resolve("../templates/astal")
        .replace("file://", "")

    await mkdir(dir, { recursive: true })
    await cp(template, dir, { recursive: true })

    // main
    await replaceInFile(`${dir}/src/main.tsx`, "__app-id__", id)
    await replaceInFile(`${dir}/src/main.tsx`, "__app-name__", name)

    // meson
    await replaceInFile(`${dir}/meson.build`, "__app-id__", id)
    await replaceInFile(`${dir}/meson.build`, "__app-name__", name)

    // package.json
    await replaceInFile(`${dir}/package.json`, "__app-name__", name)
}

async function copyGnomeShell({
    dir,
    id: uuid,
    name,
    description,
}: TemplateProps) {
    const id = uuid.split("@")[0]

    const template = import.meta
        .resolve("../templates/gnome-shell")
        .replace("file://", "")

    await mkdir(dir, { recursive: true })
    await cp(template, dir, { recursive: true })

    // metadata
    await replaceInFile(`${dir}/metadata.json`, "__extension-uuid__", uuid)
    await replaceInFile(`${dir}/metadata.json`, "__extension-id__", id)
    await replaceInFile(`${dir}/metadata.json`, "__extension-name__", name)
    await replaceInFile(
        `${dir}/metadata.json`,
        "__extension-description__",
        description,
    )

    // prefs
    await replaceInFile(`${dir}/src/prefs/index.tsx`, "__extension-id__", id)

    // extension
    await replaceInFile(
        `${dir}/src/extension/index.tsx`,
        "__extension-id__",
        id,
    )

    // gschema
    await rename(
        `${dir}/src/org.gnome.shell.extensions.__extension-id__.gschema.ts`,
        `${dir}/src/org.gnome.shell.extensions.${id}.gschema.ts`,
    )
    await replaceInFile(
        `${dir}/src/org.gnome.shell.extensions.${id}.gschema.ts`,
        "__extension-id__",
        id,
    )
}

async function main() {
    console.log()
    intro(`\x1b[7;34m\x1b[1m${" Gnim "}\x1b[0m`)

    const template = await select({
        message: "Pick a template",
        options: [
            { value: "adwaita", label: "Adwaita Application" },
            { value: "astal", label: "Astal Shell" },
            {
                value: "gnome-shell",
                label: "Gnome Shell Extension",
                hint: "experimental",
            },
        ],
    })

    if (isCancel(template)) {
        process.exit(0)
    }

    let id: string
    let name: string = ""
    let description: string = ""

    switch (template) {
        case "adwaita": {
            id = await askAppId("com.example.MyApp")
            name = await askAppName("my-app")
            break
        }
        case "astal": {
            id = await askAppId("com.example.MyShell")
            name = await askAppName("my-shell")
            break
        }
        case "gnome-shell": {
            id = await askGnomeUuid()
            name = await askAppName("My Extension")
            description = await askDescription()
            break
        }
    }

    const dir = await askTargetDir()
    const git = await askGit()
    const install = await askInstall()

    switch (template) {
        case "adwaita": {
            await copyAdwaita({ dir, id, name, description })
            break
        }
        case "astal": {
            await copyAstal({ dir, id, name, description })
            break
        }
        case "gnome-shell": {
            await copyGnomeShell({ dir, id, name, description })
            break
        }
    }

    if (install) await doInstall(dir)
    if (git) await doGit(dir)
    await doTypes(dir)
    await doOutro(dir, install)
}

main()
