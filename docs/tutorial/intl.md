# Internationalization

It is very important to make your applications as accessible as possible. Even
if the only language you speak as a developer is English the rest of the world
might not speak it, but there might be others who will be eager enough to
contribute translations for your application. To make their work easy, all you
have to do is mark text in code as translatable.

It requires zero setup to start using gettext functions.

```tsx
import { createDomain, fmt } from "gnim/intl"

const { gettext: t } = createDomain("com.example.MyApp")

function App() {
  const [count, setCount] = createState(0)

  return (
    <Gtk.Button onClicked={() => setCount((c) => c + 1)}>
      <Gtk.Label label={t("Click Me!")} />
    </Gtk.Button>
  )
}
```

## Gettext

[GNU gettext](https://www.gnu.org/software/gettext/) is the standard
internationalization framework used by most Linux desktop applications. It works
by extracting translatable strings from source code into `.pot` template files,
which translators then use to create `.po` files for each language. At runtime,
compiled `.mo` files are loaded based on the user's locale settings.

```ts
interface GettextDomain {
  /**
   * @param msgid A string to translate.
   */
  <const S extends string>(msgid: S): Text<S>
  /**
   * @param msgid A string to translate.
   */
  gettext<const S extends string>(msgid: S): Text<S>
  /**
   * @param msgid1 The singular form of the string to be translated.
   * @param msgid2 The plural form of the string to be translated.
   * @param n The number determining the translation form to use.
   */
  ngettext<const S1 extends string, const S2 extends string>(
    msgid1: S1,
    msgid2: S2,
    n: number,
  ): Text<S1 | S2>
  /**
   * @param msgctxt A context to disambiguate `msgid`.
   * @param msgid A string to translate.
   */
  pgettext<const S extends string>(msgctxt: string, msgid: S): Text<S>
}

function createDomain(domainName: string): GettextDomain
```

The domain object is the `gettext` function itself, so
`createDomain("com.example.MyApp")` can be used directly as a shorthand for its
`gettext` method. The returned `Text` is a string that additionally carries the
message's [formatting arguments](#formatting) at the type level.

### gettext

The most common function. It marks a string for translation and returns the
translated version based on the current locale.

```tsx
const { gettext: t } = createDomain("com.example.MyApp")

// Simple translation
return <Gtk.Label label={t("Hello, World!")} />
```

### ngettext

Handles plural forms. Different languages have different pluralization rules
(some have 2 forms, others have 3 or more). The `n` parameter determines which
form to use.

```tsx
const { ngettext: n } = createDomain("com.example.MyApp")

// Plural translation
const message = n("1 item selected", "{count} items selected", count)

return <Gtk.Label label={fmt(message, { count })} />
```

> [!NOTE]
>
> `ngettext` is very limited. You can instead use `gettext` and
> [formatted messages](#formatting).

### pgettext

Provides context for ambiguous strings. The same word might need different
translations depending on context (e.g., "Open" as a verb vs. adjective).

```tsx
const { pgettext: p } = createDomain("com.example.MyApp")

// "Open" as a verb (action)
<Gtk.Button label={p("action", "Open")} />

// "Open" as an adjective (status)
<Gtk.Label label={p("status", "Open")} />
```

## Formatting

Translatable strings often need values inserted into them. Simple string
concatenation breaks translations, because word order differs between languages.
Instead, mark the position of the value with an argument in curly braces and
fill it in with `fmt`.

```tsx
const [name, setName] = createState("World")

return (
  <Gtk.Label label={name.as((n) => fmt(t("Hello {name}!"), { name: n }))} />
)
```

Messages use the
[ICU Message Format](https://unicode-org.github.io/icu/userguide/format_parse/messages/).
On top of plain substitution it can pick between alternative phrasings and
format numbers and dates for the current locale.

The strings returned by `gettext`, `ngettext` and `pgettext` carry their
arguments at the type level, so `fmt` is fully type checked: forgetting an
argument, misspelling its name, or passing the wrong will result in an error at
compile-time.

> [!NOTE]
>
> Translators have to preserve the argument syntax. An argument that is missing
> at runtime, for example because a translation renamed it, will throw.

### Argument types

The format after the argument name decides how the value is rendered and which
type `fmt` demands for it. Without a format, the value can be a string, a number
or a boolean.

```tsx
fmt(t("{count, number} files"), { count: 42 })
fmt(t("Modified {date, date, medium}"), { date: file.modifiedAt })
fmt(t("Starts at {time, time, short}"), { time: event.start })
```

Numbers and dates are formatted for the user's locale, so the same message reads
`1,024` in `en` and `1.024` in `de`. Number and date formats also accept
[skeletons](https://unicode-org.github.io/icu/userguide/format_parse/numbers/skeletons.html)
after a `::` prefix.

```tsx
// "15K downloaded"
fmt(t("{size, number, ::compact-short} downloaded"), { size: 15_300 })

// "42% complete"
fmt(t("{ratio, number, ::percent} complete"), { ratio: 0.42 })
```

### Plurals

Different languages have different pluralization rules, some with two forms,
others with three or more. A `plural` argument lets the translation choose the
right one, and `#` is replaced with the number itself.

```tsx
fmt(t("{count, plural, one {# item selected} other {# items selected}}"), {
  count,
})
```

The `one`, `two`, `few`, `many` and `other` categories are the ones the locale
defines, and translators are free to use whichever their language needs, as long
as `other` is present. Exact matches take precedence over categories, which is
useful for phrasing a case differently instead of just changing a word.

```tsx
fmt(
  t(`{count, plural,
      =0 {Nothing selected}
      one {# item selected}
      other {# items selected}
    }`),
  { count },
)
```

A `selectordinal` argument works the same way, but picks the category for the
ordinal form of the number instead of the cardinal one.

```tsx
fmt(
  t(`You finished {place, selectordinal,
      one {#st}
      two {#nd}
      few {#rd}
      other {#th}
    }`),
  { place },
)
```

### Selects

A `select` argument branches on a string value, which is how you keep messages
that vary by category in one translatable string. The `other` branch is required
and acts as the fallback.

```tsx
fmt(t("{type, select, file {File} dir {Folder} other {Item}} deleted"), {
  type: entry.type,
})
```

The branch names are part of the type, so `"file"` and `"dir"` are suggested for
`type` while any other string still type checks and falls through to `other`.

### Inline markup

Messages can also contain markup tags, which lets you translate a whole sentence
in one piece while rendering parts of it with different components. Tags are
provided as functions that receive the tag's content and return what to render,
in which case `fmt` returns a JSX element instead of a string.

```tsx
<Gtk.Box spacing={4}>
  {fmt(t("Click <link>here</link> to learn more"), {
    link: (content) => (
      <Gtk.LinkButton uri="https://gnimjs.dev">{content}</Gtk.LinkButton>
    ),
  })}
</Gtk.Box>
```

Arguments and tags can be combined in the same message.

```tsx
fmt(t("Downloading <b>{file}</b>"), {
  file: fileName,
  b: (content) => <Gtk.Label css="font-weight: bold;">{content}</Gtk.Label>,
})
```

> [!NOTE]
>
> Every tag in the message needs a matching function, otherwise formatting
> throws. Tag names are case-sensitive and have to be closed.

### Pango markup

Sometimes markup should stay in the string instead of being rendered as
components, for example when a label uses
[Pango markup](https://docs.gtk.org/Pango/pango_markup.html) to style parts of
its text. For these cases use `sfmt`: it substitutes arguments exactly like
`fmt`, but always returns a plain string and leaves tags as-is.

```tsx
<Gtk.Label
  useMarkup
  label={sfmt(t("Downloading <b>{file}</b>"), { file: fileName })}
/>
```

Like `fmt`, `sfmt` type checks its arguments, but tags in the message require no
values: they are passed through to the output verbatim for Pango to interpret.

### Escaping

Because curly braces delimit arguments, a message that should contain a literal
brace has to quote it with single quotes. A doubled `''` produces a single
quote.

```tsx
// "Use {} to interpolate"
fmt(t("Use '{}' to interpolate"), {})

// "It's here"
fmt(t("It''s here"), {})
```

### Locale

Values that are not part of a message can be formatted with the
[Intl](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl)
namespace, and every one of its constructors takes a locale. POSIX does not
define a locale as a single setting, but as a set of categories, each with its
own environment variable.

| Variable      | Controls                                    |
| ------------- | ------------------------------------------- |
| `LANGUAGE`    | Priority list of languages for translations |
| `LC_ALL`      | Overrides every category below              |
| `LC_MESSAGES` | The language translations are looked up in  |
| `LC_TIME`     | Date and time formats                       |
| `LC_NUMERIC`  | Decimal and grouping separators             |
| `LC_MONETARY` | Currency symbol and its placement           |
| `LC_COLLATE`  | Sorting and string comparison               |
| `LANG`        | Fallback for every category that is not set |

```ts
import { getLocale } from "gnim/intl"

getLocale() // LANG
getLocale("LC_TIME") // Intl.DateTimeFormat, Intl.RelativeTimeFormat
getLocale("LC_NUMERIC") // Intl.NumberFormat
getLocale("LC_MONETARY") // Intl.NumberFormat with style: "currency"
getLocale("LC_COLLATE") // Intl.Collator
```

Anything that reads as part of a sentence should follow the language the
sentence itself is in for which you can use `getPreferredLocale`.

```ts
import { getPreferredLocale } from "gnim/intl"

new Intl.ListFormat(getPreferredLocale(), { type: "conjunction" })
```

> [!NOTE]
>
> Constructing a formatter is expensive, formatting with it is not. Prefer
> reusing formatters as much as possible.

### Numbers

When you're formatting plain numbers that are not part of a message, you can use
[Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat):

```tsx
const percent = new Intl.NumberFormat(getLocale("LC_NUMERIC"), {
  style: "percent",
  maximumFractionDigits: 1,
})

// "42.3%" in en-US, "42,3 %" in de-DE
return <Gtk.Label label={progress.as((p) => percent.format(p))} />
```

Besides grouping and decimal separators,
[Intl.NumberFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/NumberFormat)
also knows currencies, units and compact notation.

```ts
new Intl.NumberFormat(getLocale("LC_MONETARY"), {
  style: "currency",
  currency: "EUR",
}).format(499.9)
```

### Dates and times

You can format plain dates that are not part of a message by using
[Intl.DateTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DateTimeFormat).

```tsx
const dateTime = new Intl.DateTimeFormat(getLocale("LC_TIME"), {
  dateStyle: "long",
  timeStyle: "short",
})

// "January 1, 1970 at 1:00 AM" with LC_TIME=en_US.UTF-8
// "1970. január 1. 1:00" with LC_TIME=hu_HU.UTF-8
return <Gtk.Label label={dateTime.format(file.modifiedAt)} />
```

Durations relative to now are formatted with
[Intl.RelativeTimeFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/RelativeTimeFormat),
which takes the value and its unit. With `numeric: "auto"` it prefers wording
like `yesterday` over `1 day ago` where the language has it.

```ts
const relative = new Intl.RelativeTimeFormat(getLocale("LC_TIME"), {
  numeric: "auto",
})

relative.format(-1, "day") // "yesterday"
relative.format(-2, "hour") // "2 hours ago"
relative.format(3, "hour") // "in 3 hours"
```

### Lists

Joining with `", "` is wrong in most languages, which is what
[Intl.ListFormat](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat)
is for. A `conjunction` is an "and" list, a `disjunction` an "or" list.

```ts
const items = ["GTK", "CSS", "JavaScript"]

// "GTK, CSS, and JavaScript"
new Intl.ListFormat(getPreferredLocale(), { type: "conjunction" }).format(items)

// "GTK, CSS, or JavaScript"
new Intl.ListFormat(getPreferredLocale(), { type: "disjunction" }).format(items)
```

To render the items as widgets instead of text, use
[`formatToParts`](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/ListFormat/formatToParts),
which returns the separators and the items as separate entries so you can
replace the latter.

```tsx
const list = new Intl.ListFormat(getPreferredLocale())

<Gtk.Box>
  {list.formatToParts(users.map((u) => u.name)).map((part) =>
    part.type === "element" ? (
      <Gtk.LinkButton label={part.value} />
    ) : (
      <Gtk.Label label={part.value} />
    ),
  )}
</Gtk.Box>
```

### Display names

Names of languages, regions, currencies and scripts are translated by the
platform, so they never belong in a `.pot` file. Ask
[Intl.DisplayNames](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/DisplayNames)
for them instead.

```ts
const languages = new Intl.DisplayNames(getPreferredLocale(), {
  type: "language",
})

languages.of("hu") // "Hungarian" in en-US, "magyar" in hu-HU
languages.of("de-AT") // "Austrian German" in en-US, "osztrák német" in hu-HU
```

The other types are `region`, `currency`, `script` and `calendar`, which is what
you want for a language picker or a locale label in preferences.

```ts
new Intl.DisplayNames(locale, { type: "region" }).of("GB") // "United Kingdom"
new Intl.DisplayNames(locale, { type: "currency" }).of("EUR") // "Euro"
```

## Extract translatable strings

Usually `gettext` is aliased to `_`, `ngettext` is aliased to `_N` and
`pgettext` is aliased to `_P`. However, in JavaScript the underscore prefix is
usually a marker for unused symbols, so it's recommended to use aliases that
you'd find in other JavaScript internationalization libraries, such as `t`.
These aliases can be configured with the `--keyword` flag when extracting
translatable strings.

```sh
xgettext **/*.ts **/*.tsx \
  --output=po/messages.pot \
  --keyword=t \
  --keyword=n:1,2 \
  --keyword=p:1c,2
```

This produces a `.pot` template file which can be used to write translations.

> [!IMPORTANT]
>
> These keywords behave like C macros. Aliasing at runtime will cause text to be
> ignored.
>
> ```ts
> const t = createDomain()
> const wrapper = t
> wrapper("This will be ignored by xgettext")
>
> const text = "This is also ignored"
> t(text)
> ```

## Init locale translation

```sh
LOCALE="locale" # example: `de`, `es`, `it`, `fr`
msginit \
  --locale=$LOCALE \
  -i po/messages.pot \
  -o po/$LOCALE.po \
  --no-translator
```

After filling the translations restart the dev server with the chosen
application ID and chosen locale.

```sh
LOCALE="locale" # example: `de`, `es`, `it`, `fr`
COUNTRY="country" # example: `DE`, `ES`, `IT`, `FR`
LANG="${LOCALE}_${COUNTRY}.UTF8" gnim dev src/main.tsx --id com.example.MyApp
```
