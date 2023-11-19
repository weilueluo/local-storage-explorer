import { cp, readdir, rm, watch } from 'node:fs/promises'
import path from 'node:path'
import { exit } from 'node:process'

const SRC_DIR = './src'
const OUT_DIR = './out'
const ENTRY_POINTS = ['popup.js', 'options.js', 'service-worker.js']

async function build() {
    await rm(OUT_DIR, {
        force: true,
        recursive: true
    })

    await cp(SRC_DIR, OUT_DIR, {
        force: true,
        recursive: true
    });


    async function readAllFiles(dir, allowedFilenames = []) {
        const filenameSet = new Set(allowedFilenames)
        const dirents = await readdir(dir, {
            recursive: true,
            withFileTypes: true
        })
        const files = []
        for (const item of dirents) {
            const itemDir = path.join(dir, item.name)
            if (item.isDirectory()) {
                files.push(...(await readAllFiles(itemDir, allowedFilenames)))
            } else if (item.isFile() && filenameSet.has(item.name)) {
                files.push(itemDir)
            }
        }
        return files
    }

    const jsFiles = await readAllFiles(OUT_DIR, ENTRY_POINTS)

    return await Bun.build({
        entrypoints: jsFiles,
        outdir: OUT_DIR,
        naming: '[dir]/[name].[ext]',
        minify: true, // default false
        target: "browser",
        splitting: false, // default
    })
}

async function doBulid(event = undefined) {
    const result = await build()
    console.log(`${result.success ? "# build success" : "! build failed"} ${event?.filename ?? ""}`)
    if (result.logs) {
        result.logs.forEach(console.log)
    }
}

doBulid()

// try {
//     const watcher = watch(SRC_DIR, {
//         persistent: true,
//         recursive: true
//     });
//     console.log(`# watching ${SRC_DIR} => ${OUT_DIR} ...`);
//     for await (const event of watcher) {
//         doBulid(event)
//     }

// } catch (err) {
//     if (err.name === 'AbortError')
//         exit()
//     throw err;
// }