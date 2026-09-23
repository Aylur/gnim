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
import { statSync } from "node:fs"
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises"
import { parseArgs, promisify } from "node:util"
import { existsSync } from "node:fs"
import { dirname, join, relative } from "node:path"
import { fileURLToPath } from "node:url"
import nunjucks from "nunjucks"

const execFileAsync = promisify(execFile)

const templateOptions = [
    { value: "adwaita", label: "Adwaita Application" },
    { value: "layer-shell", label: "Gtk4 Layer Shell" },
    { value: "empty", label: "Empty" },
    {
        value: "gnome-shell",
        label: "Gnome Shell Extension",
        hint: "experimental",
    },
] as const

type Template = (typeof templateOptions)[number]["value"]

function parseCliArgs() {
    const args = parseArgs({
        options: {
            template: { type: "string", short: "t" },
            vala: { type: "boolean" },
            agents: { type: "boolean" },
        },
        strict: false,
    })

    const { template, vala = false, agents = true } = args.values

    if (typeof template !== "undefined") {
        const valid: string[] = templateOptions.map((option) => option.value)
        if (typeof template !== "string" || !valid.includes(template)) {
            console.error(
                `Invalid template "${template}". Valid templates: ${valid.join(", ")}`,
            )
            process.exit(1)
        }
    }

    return {
        template: (template ?? null) as Template | null,
        vala: typeof vala === "boolean" ? vala : false,
        agents: typeof agents === "boolean" ? agents : false,
    }
}

function detectPackageManager() {
    if (!process.env.npm_config_user_agent) return "npm"
    const specifier = process.env.npm_config_user_agent.split(" ")[0]
    return specifier.substring(0, specifier.lastIndexOf("/"))
}

function defaultGirDirs(): string[] {
    const dataDirs =
        process.env.XDG_DATA_DIRS ??
        ["/usr/share", "/usr/local/share"].join(":")

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

async function askTargetDir() {
    const targetDir = await text({
        message: "Where should the project be created?",
        placeholder: "./myapp",
        validate(path) {
            if (!path) return "Directory is required"
            try {
                const s = statSync(path)
                if (s.isFile()) return "Target is an existing file"
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

async function askDescription(placeholder: string) {
    const id = await text({
        message: "Provide a short description",
        placeholder,
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

async function askVala() {
    const vala = await confirm({
        message: "Add a Vala library?",
        initialValue: false,
    })

    if (isCancel(vala)) {
        process.exit(0)
    }

    return vala
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

async function askAgents() {
    const agents = await confirm({
        message: "Will you be using AI agents?",
        initialValue: true,
    })

    if (isCancel(agents)) {
        process.exit(0)
    }

    return agents
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
    if (defaultGirDirs().length > 0) {
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

function templateEnv(tags: nunjucks.ConfigureOptions["tags"]) {
    return new nunjucks.Environment(null, {
        autoescape: false,
        trimBlocks: true,
        lstripBlocks: true,
        tags,
    })
}

const slashEnv = templateEnv({
    blockStart: "/*%",
    blockEnd: "%*/",
    variableStart: "/*{",
    variableEnd: "}*/",
    commentStart: "/*#",
    commentEnd: "#*/",
})

// #% if vala %#
const hashEnv = templateEnv({
    blockStart: "#%",
    blockEnd: "%#",
    variableStart: "#{",
    variableEnd: "}#",
    commentStart: "#{#",
    commentEnd: "#}#",
})

async function renderTemplate(
    template: string,
    dir: string,
    variables: Record<string, string>,
    context: Record<string, unknown>,
) {
    const root = fileURLToPath(import.meta.resolve(`../templates/${template}`))

    function substitute(input: string) {
        let output = input
        for (const [variable, value] of Object.entries(variables)) {
            output = output.replaceAll(variable, () => value)
        }
        return output
    }

    const entries = await readdir(root, {
        recursive: true,
        withFileTypes: true,
    })

    for (const entry of entries) {
        if (!entry.isFile()) continue

        const src = join(entry.parentPath, entry.name)
        const path = relative(root, src)
        const env = entry.name === "meson.build" ? hashEnv : slashEnv
        const source = await readFile(src, "utf8")
        const content = substitute(env.renderString(source, context))

        const dest = join(dir, substitute(path))
        await mkdir(dirname(dest), { recursive: true })
        await writeFile(dest, content, "utf8")
    }
}

function valaNamespace(name: string) {
    const ns = name
        .split(/[^A-Za-z0-9]+/)
        .filter(Boolean)
        .map((part) => part[0].toUpperCase() + part.slice(1))
        .join("")

    return ns.length === 0 ? "App" : /^\d/.test(ns) ? `App${ns}` : ns
}

async function createGitignore(dir: string) {
    const ignore = [
        "node_modules/",
        "dist/",
        "build/",
        ".gnim/",
        "*.local",

        "# Logs",
        "logs",
        "*.log",
        "npm-debug.log*",
        "yarn-debug.log*",
        "yarn-error.log*",
        "pnpm-debug.log*",

        "# Editor files",
        ".vscode/*",
        "!.vscode/extensions.json",
        ".idea",
        "*.sw?",
    ]

    return writeFile(`${dir}/.gitignore`, ignore.join("\n"))
}

async function createAgentsMd(dir: string) {
    const content = [
        "# This is NOT the Gnim you know",
        "",
        "This version has breaking changes — APIs, conventions, and file structure may",
        "all differ from your training data. Read the full documentation in",
        "`node_modules/gnim/llms-full.txt` (resolved from this file's directory; in",
        "monorepos the `gnim` package may not be visible from the repo root) before",
        "writing any code. Heed deprecation notices.",
        "",
    ]

    return writeFile(`${dir}/AGENTS.md`, content.join("\n"))
}

async function main() {
    console.log()
    intro(`\x1b[7;34m\x1b[1m${" Gnim "}\x1b[0m`)

    const args = parseCliArgs()
    let { template, vala, agents } = args

    if (!template) {
        const answer = await select({
            message: "Pick a template",
            options: [...templateOptions],
        })

        if (isCancel(answer)) {
            process.exit(0)
        }

        template = answer
    }

    if (template === "gnome-shell") {
        vala = false
    } else if (vala === null) {
        vala = await askVala()
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
        case "layer-shell": {
            id = await askAppId("com.example.MyShell")
            name = await askAppName("my-shell")
            break
        }
        case "empty": {
            id = await askAppId("com.example.MyApp")
            name = await askAppName("my-app")
            break
        }
        case "gnome-shell": {
            id = await askGnomeUuid()
            name = await askAppName("My Extension")
            description = await askDescription("Extension that lets you do xyz")
            break
        }
    }

    const dir = await askTargetDir()
    const git = await askGit()
    if (agents === null) {
        agents = await askAgents()
    }
    const install = await askInstall()
    const extenstionId = id.split("@")[0]

    const variables = {
        "__app-id__": id,
        "__app-name__": name,
        "__vala_namespace__": valaNamespace(name),
        "__extension-uuid__": id,
        "__extension-id__": extenstionId,
        "__extension-name__": name,
        "__extension-description__": description,
        "__css_namespace__": extenstionId
            .toLowerCase()
            .replaceAll(/[._]/g, "-"),
    }

    await renderTemplate(template, dir, variables, { vala })
    if (vala) {
        await renderTemplate("vala", dir, variables, { vala })
    }

    await createGitignore(dir)
    if (agents) {
        await createAgentsMd(dir)
    }
    if (install) {
        await doInstall(dir)
    }
    if (git) {
        await doGit(dir)
    }
    if (vala && install) {
        const pm = detectPackageManager()
        const s = spinner()
        s.start("Building lib")
        await execFileAsync(pm, ["run", "build"], { cwd: dir })
        s.stop("Built lib")
    }
    if (install) {
        await doTypes(dir)
    }
    await doOutro(dir, install)
}

try {
    main()
} catch (err) {
    console.error(err)
}
