export class GettextDomain {
    constructor(_: string) {}

    gettext(msgid: string): string {
        return msgid
    }

    ngettext(msgid1: string, msgid2: string, n: number): string {
        return n === 1 ? msgid1 : msgid2
    }

    pgettext(_: string, msgid: string): string {
        return msgid
    }
}

export function domain(domainName: string) {
    return new GettextDomain(domainName)
}

const Gettext = { domain, GettextDomain }

export default Gettext
