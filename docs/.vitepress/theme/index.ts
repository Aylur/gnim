import { inject } from "@vercel/analytics"
import type { Theme } from "vitepress"
import DefaultTheme from "vitepress/theme"
import "devicon/devicon.min.css"

const theme: Theme = {
    extends: DefaultTheme,
    enhanceApp() {
        inject()
    },
}

export default theme
