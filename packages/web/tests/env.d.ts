declare module "*?file" {
    import type Gio from "gi://Gio?version=2.0"
    const file: Gio.File
    export default file
}
