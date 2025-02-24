// @ts-check
import { resolve } from "path"
import { exec } from "child_process"

/** @type {import("esbuild").Plugin} */
export default {
    name: "bpl",
    setup(build) {
        build.onResolve({ filter: /.*\.blp/ }, args => ({
            path: resolve(args.resolveDir, args.path),
            namespace: "blueprint",
        }))

        build.onLoad({ filter: /.*\.blp/ }, args => new Promise((resolve, reject) => {
            exec(`blueprint-compiler compile ${args.path}`, (error, out, err) => {
                if (error) {
                    return reject(err)
                }

                resolve({
                    contents: out,
                    loader: "text",
                    watchFiles: [args.path],
                })
            })
        }))
    },
}
