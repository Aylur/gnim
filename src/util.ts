export function kebabify(str: string) {
    return str
        .replace(/([a-z])([A-Z])/g, "$1-$2")
        .replaceAll("_", "-")
        .toLowerCase()
}
