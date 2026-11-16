import GLib from "gi://GLib?version=2.0"
import Gio from "gi://Gio?version=2.0"
import Soup from "gi://Soup?version=3.0"
import GObject from "gi://GObject?version=2.0"
import { Blob, File, blobChunks } from "./blob.js"
import { decoder, encoder } from "./lib.js"
import { URLSearchParams } from "./url.js"

type FormDataEntryValue = string | File

function toEntry(
    name: string,
    value: string | Blob | Gio.File,
    filename: string | null,
): [string, FormDataEntryValue] {
    if (value instanceof Gio.File) {
        return [String(name), filename === null ? new File(value) : new File(value, filename)]
    }

    if (!(value instanceof Blob)) return [String(name), String(value)]

    if (value instanceof File && filename === null) return [String(name), value]

    return [
        String(name),
        new File([value], filename ?? (value instanceof File ? value.name : "blob"), {
            type: value.type,
            ...(value instanceof File && { lastModified: value.lastModified }),
        }),
    ]
}

/**
 * Implementation of the [FormData](https://developer.mozilla.org/docs/Web/API/FormData) web API.
 */
class FormData extends GObject.Object {
    declare static readonly $gtype: GObject.GType<FormData>

    static {
        GObject.registerClass({ GTypeName: "GnimWeb_FormData" }, this)
    }

    #list: Array<[string, FormDataEntryValue]> = []

    /** Appends an entry. A `Blob` or `Gio.File` value becomes a `File`. */
    append(name: string, value: string): void
    append(name: string, value: Blob | Gio.File, filename?: string): void
    append(name: string, value: string | Blob | Gio.File, filename?: string): void {
        this.#list.push(toEntry(name, value, filename ?? null))
    }

    /** Removes all entries named `name`. */
    delete(name: string): void {
        this.#list = this.#list.filter(([n]) => n !== name)
    }

    /** Returns the first value of `name`, or `null` when there is none. */
    get(name: string): FormDataEntryValue | null {
        return this.#list.find(([n]) => n === name)?.[1] ?? null
    }

    /** Returns all values of `name`. */
    getAll(name: string): FormDataEntryValue[] {
        return this.#list.filter(([n]) => n === name).map(([, v]) => v)
    }

    /** Whether there is an entry named `name`. */
    has(name: string): boolean {
        return this.#list.some(([n]) => n === name)
    }

    /** Replaces all entries named `name` with a single entry. */
    set(name: string, value: string): void
    set(name: string, value: Blob | Gio.File, filename?: string): void
    set(...args: never[]): unknown
    set(name: string, value: string | Blob | Gio.File, filename?: string): void {
        const entry = toEntry(name, value, filename ?? null)
        const i = this.#list.findIndex(([n]) => n === name)
        if (i === -1) {
            this.#list.push(entry)
        } else {
            this.#list[i] = entry
            this.#list = this.#list.filter(([n], j) => j <= i || n !== name)
        }
    }

    forEach(
        callbackfn: (value: FormDataEntryValue, name: string, parent: FormData) => void,
        thisArg?: unknown,
    ): void {
        for (const [name, value] of this.#list) {
            callbackfn.call(thisArg, value, name, this)
        }
    }

    *entries(): IterableIterator<[string, FormDataEntryValue]> {
        for (const [name, value] of this.#list) yield [name, value]
    }

    *keys(): IterableIterator<string> {
        for (const [name] of this.#list) yield name
    }

    *values(): IterableIterator<FormDataEntryValue> {
        for (const [, value] of this.#list) yield value
    }

    [Symbol.iterator](): IterableIterator<[string, FormDataEntryValue]> {
        return this.entries()
    }

    get [Symbol.toStringTag](): string {
        return "FormData"
    }
}

function normalizeNewlines(str: string): string {
    return str.replace(/\r\n|\r|\n/g, "\r\n")
}

// names are normalized before, but filenames are not
function escapeQuoted(str: string): string {
    return str.replaceAll("\r", "%0D").replaceAll("\n", "%0A").replaceAll('"', "%22")
}

async function* encodeParts(parts: Array<Uint8Array | Blob>): AsyncGenerator<Uint8Array> {
    for (const part of parts) {
        if (part instanceof Uint8Array) yield part
        else yield* blobChunks(part)
    }
}

interface EncodedFormData {
    chunks(): AsyncGenerator<Uint8Array>
    contentType: string
    length: number
}

function encodeFormData(form: FormData): EncodedFormData {
    const boundary = `----gnim-form-${GLib.uuid_string_random()}`

    const parts = Array.from(form).flatMap(([name, value]): Array<Uint8Array | Blob> => {
        const quoted = escapeQuoted(normalizeNewlines(name))
        const disposition = `Content-Disposition: form-data; name="${quoted}"`

        if (typeof value === "string") {
            const part = `--${boundary}\r\n${disposition}\r\n\r\n${normalizeNewlines(value)}\r\n`
            return [encoder.encode(part)]
        }

        const type = value.type || "application/octet-stream"
        const filename = `filename="${escapeQuoted(value.name)}"`
        const head = `--${boundary}\r\n${disposition}; ${filename}\r\nContent-Type: ${type}\r\n\r\n`
        return [encoder.encode(head), value, encoder.encode("\r\n")]
    })

    parts.push(encoder.encode(`--${boundary}--\r\n`))

    return {
        chunks: () => encodeParts(parts),
        contentType: `multipart/form-data; boundary=${boundary}`,
        length: parts.reduce(
            (sum, part) => sum + (part instanceof Uint8Array ? part.byteLength : part.size),
            0,
        ),
    }
}

function decodeFormData(bytes: Uint8Array, contentType: string | null): FormData {
    const form = new FormData()
    const mimeType = contentType?.split(";")[0]?.trim().toLowerCase()

    if (mimeType === "application/x-www-form-urlencoded") {
        for (const [name, value] of new URLSearchParams(decoder.decode(bytes))) {
            form.append(name, value)
        }
        return form
    }

    if (mimeType === "multipart/form-data") {
        const headers = Soup.MessageHeaders.new(Soup.MessageHeadersType.MULTIPART)
        headers.replace("Content-Type", contentType!)

        const multipart = Soup.Multipart.new_from_message(headers, bytes)
        if (!multipart) throw new TypeError("FormData: could not parse multipart/form-data body")

        for (let i = 0; i < multipart.get_length(); i++) {
            const [, partHeaders, body] = multipart.get_part(i)
            const [hasDisposition, , params] = partHeaders.get_content_disposition()
            if (!hasDisposition || typeof params.name !== "string") {
                throw new TypeError("FormData: multipart part is missing its name")
            }

            if (typeof params.filename === "string") {
                const [type] = partHeaders.get_content_type()
                form.append(
                    params.name,
                    new File([body.toArray()], params.filename, { type: type ?? "text/plain" }),
                )
            } else {
                form.append(params.name, decoder.decode(body.toArray()))
            }
        }
        return form
    }

    throw new TypeError(`FormData: cannot parse "${contentType}" as form data`)
}

export { FormData, type FormDataEntryValue, encodeFormData, decodeFormData }
