/// <reference lib="es2015" />

/**
 * GJS implements the [WHATWG Encoding][https://encoding.spec.whatwg.org/] specification.
 *
 * The `TextDecoder` interface represents a decoder for a specific text encoding,
 * such as `UTF-8`, `ISO-8859-2`, `KOI8-R`, `GBK`, etc. A decoder takes a list of
 * bytes as input and emits a list of code points.
 *
 * @version GJS 1.70
 */
declare class TextDecoder {
    /**
     * The `TextDecoder()` constructor returns a newly created `TextDecoder` object for
     * the encoding specified in parameter.
     *
     * If the value for `utfLabel` is unknown, or is one of the two values leading to a
     * 'replacement' decoding algorithm ("iso-2022-cn" or "iso-2022-cn-ext"), a
     * `RangeError` is thrown.
     *
     * @param utfLabel Optional string, defaulting to `"utf-8"`, containing the label of the encoder.
     * @param options Optional dictionary with the `Boolean` property `fatal`, corresponding to the {@link TextDecoder.fatal} property.
     * @returns A newly created `TextDecoder` object.
     */
    constructor(
        utfLabel?: TextDecoderEncoding,
        options?: {
            fatal?: boolean
        },
    )

    /**
     * The `TextDecoder.encoding` read-only property returns a string containing the
     * name of the decoding algorithm used by the specific decoder.
     */
    readonly encoding: string

    /**
     * The fatal property of the `TextDecoder` interface is a `Boolean` indicating
     * whether the error mode is fatal.
     *
     * If this value is `true`, the processed text cannot be decoded because of malformed
     * data. If this value is `false` malformed data is replaced with placeholder characters.
     */
    readonly fatal: boolean

    /**
     * The `ignoreBOM` property of the `TextDecoder` interface is a `Boolean` indicating
     * whether the byte order mark is ignored.
     */
    readonly ignoreBOM: boolean

    /**
     * The `TextDecoder.decode()` method returns a string containing the text, given in
     * parameters, decoded with the specific method for that `TextDecoder` object.
     *
     * @param buffer Optional `ArrayBuffer`, a `TypedArray` or a `DataView` object containing the text to decode.
     * @param options Optional dictionary indicating that additional data will follow in subsequent calls to
     * `decode()`. Set to `true` if processing the data in chunks, and `false` for the final chunk or if the
     * data is not chunked. It defaults to `false`.
     * @returns A string result.
     */
    decode(
        buffer?: ArrayBuffer | ArrayBufferView | DataView | null,
        options?: {
            stream?: boolean
        },
    ): string
}

/**
 * The `TextEncoder` interface takes a list of code points as input and emits a
 * list of UTF-8 bytes.
 *
 * @version GJS 1.70
 */
declare class TextEncoder {
    /**
     * The `TextEncoder()` constructor returns a newly created `TextEncoder` object
     * that will generate a byte stream with UTF-8 encoding.
     *
     * @returns A newly created `TextEncoder` object.
     */
    constructor()

    /**
     * The `TextEncoder.encoding` read-only property returns a string containing the
     * name of the encoding algorithm used by the specific encoder.
     *
     * It can only have the following value `utf-8`.
     */
    readonly encoding: "utf-8"

    /**
     * The `TextEncoder.encode()` method takes a string as input, and returns a
     * `Uint8Array` containing the text given in parameters encoded with the specific
     * method for that `TextEncoder` object.
     *
     * @param string A string containing the text to encode.
     * @returns A `Uint8Array` object containing UTF-8 encoded text.
     */
    encode(string: string): Uint8Array

    /**
     * The `TextEncoder.encodeInto()` method takes a string as input, and writes UTF-8
     * encoded text into `output`.
     *
     * The returned object contains two members:
     * - `read`: The number of UTF-16 units of code from the source that has been converted over to UTF-8.
     *   This may be less than `input.length` if `output` did not have enough space.
     * - `written`: The number of bytes modified in the destination `Uint8Array`. The bytes written are
     *   guaranteed to form complete UTF-8 byte sequences.
     *
     * @param input A string containing the text to encode.
     * @param output A `Uint8Array` object instance to place the resulting UTF-8 encoded text into.
     * @returns An object containing the number of UTF-16 units read and bytes written.
     */
    encodeInto(
        input: string,
        output: Uint8Array,
    ): { read: number; written: number }
}

// https://gitlab.gnome.org/GNOME/gjs/-/blob/1.73.2/modules/esm/_encoding/encodingMap.js#L7-232
type TextDecoderEncoding =
    | "unicode-1-1-utf-8"
    | "unicode11utf8"
    | "unicode20utf8"
    | "utf-8"
    | "utf8"
    | "x-unicode20utf8"
    | "866"
    | "cp866"
    | "csibm866"
    | "ibm866"
    | "csisolatin2"
    | "iso-8859-2"
    | "iso-ir-101"
    | "iso8859-2"
    | "iso88592"
    | "iso_8859-2"
    | "iso_8859-2:1987"
    | "l2"
    | "latin2"
    | "csisolatin3"
    | "iso-8859-3"
    | "iso-ir-109"
    | "iso8859-3"
    | "iso88593"
    | "iso_8859-3"
    | "iso_8859-3:1988"
    | "l3"
    | "latin3"
    | "csisolatin4"
    | "iso-8859-4"
    | "iso-ir-110"
    | "iso8859-4"
    | "iso88594"
    | "iso_8859-4"
    | "iso_8859-4:1988"
    | "l4"
    | "latin4"
    | "csisolatincyrillic"
    | "cyrillic"
    | "iso-8859-5"
    | "iso-ir-144"
    | "iso8859-5"
    | "iso88595"
    | "iso_8859-5"
    | "iso_8859-5:1988"
    | "arabic"
    | "asmo-708"
    | "csiso88596e"
    | "csiso88596i"
    | "csisolatinarabic"
    | "ecma-114"
    | "iso-8859-6"
    | "iso-8859-6-e"
    | "iso-8859-6-i"
    | "iso-ir-127"
    | "iso8859-6"
    | "iso88596"
    | "iso_8859-6"
    | "iso_8859-6:1987"
    | "csisolatingreek"
    | "ecma-118"
    | "elot_928"
    | "greek"
    | "greek8"
    | "iso-8859-7"
    | "iso-ir-126"
    | "iso8859-7"
    | "iso88597"
    | "iso_8859-7"
    | "iso_8859-7:1987"
    | "sun_eu_greek"
    | "csiso88598e"
    | "csisolatinhebrew"
    | "hebrew"
    | "iso-8859-8"
    | "iso-8859-8-e"
    | "iso-ir-138"
    | "iso8859-8"
    | "iso88598"
    | "iso_8859-8"
    | "iso_8859-8:1988"
    | "visual"
    | "csiso88598i"
    | "iso-8859-8-i"
    | "logical"
    | "csisolatin6"
    | "iso-8859-10"
    | "iso-ir-157"
    | "iso8859-10"
    | "iso885910"
    | "l6"
    | "latin6"
    | "iso-8859-13"
    | "iso8859-13"
    | "iso885913"
    | "iso-8859-14"
    | "iso8859-14"
    | "iso885914"
    | "csisolatin9"
    | "iso-8859-15"
    | "iso8859-15"
    | "iso885915"
    | "iso_8859-15"
    | "l9"
    | "iso-8859-16"
    | "cskoi8r"
    | "koi"
    | "koi8"
    | "koi8-r"
    | "koi8_r"
    | "koi8-ru"
    | "koi8-u"
    | "csmacintosh"
    | "mac"
    | "macintosh"
    | "x-mac-roman"
    | "dos-874"
    | "iso-8859-11"
    | "iso8859-11"
    | "iso885911"
    | "tis-620"
    | "windows-874"
    | "cp1250"
    | "windows-1250"
    | "x-cp1250"
    | "cp1251"
    | "windows-1251"
    | "x-cp1251"
    | "ansi_x3.4-1968"
    | "ascii"
    | "cp1252"
    | "cp819"
    | "csisolatin1"
    | "ibm819"
    | "iso-8859-1"
    | "iso-ir-100"
    | "iso8859-1"
    | "iso88591"
    | "iso_8859-1"
    | "iso_8859-1:1987"
    | "l1"
    | "latin1"
    | "us-ascii"
    | "windows-1252"
    | "x-cp1252"
    | "cp1253"
    | "windows-1253"
    | "x-cp1253"
    | "cp1254"
    | "csisolatin5"
    | "iso-8859-9"
    | "iso-ir-148"
    | "iso8859-9"
    | "iso88599"
    | "iso_8859-9"
    | "iso_8859-9:1989"
    | "l5"
    | "latin5"
    | "windows-1254"
    | "x-cp1254"
    | "cp1255"
    | "windows-1255"
    | "x-cp1255"
    | "cp1256"
    | "windows-1256"
    | "x-cp1256"
    | "cp1257"
    | "windows-1257"
    | "x-cp1257"
    | "cp1258"
    | "windows-1258"
    | "x-cp1258"
    | "x-mac-cyrillic"
    | "x-mac-ukrainian"
    | "chinese"
    | "csgb2312"
    | "csiso58gb231280"
    | "gb2312"
    | "gb_2312"
    | "gb_2312-80"
    | "gbk"
    | "iso-ir-58"
    | "x-gbk"
    | "gb18030"
    | "big5"
    | "cn-big5"
    | "csbig5"
    | "x-x-big5"
    | "cseucpkdfmtjapanese"
    | "euc-jp"
    | "x-euc-jp"
    | "csiso2022jp"
    | "iso-2022-jp"
    | "csshiftjis"
    | "ms932"
    | "ms_kanji"
    | "shift-jis"
    | "shift_jis"
    | "sjis"
    | "windows-31j"
    | "x-sjis"
    | "cseuckr"
    | "csksc56011987"
    | "euc-kr"
    | "iso-ir-149"
    | "korean"
    | "ks_c_5601-1987"
    | "ks_c_5601-1989"
    | "ksc5601"
    | "ksc_5601"
    | "windows-949"
    | "unicodefffe"
    | "utf-16be"
    | "csunicode"
    | "iso-10646-ucs-2"
    | "ucs-2"
    | "unicode"
    | "unicodefeff"
    | "utf-16"
    | "utf-16le"
