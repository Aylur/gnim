/** @version 49 */
declare module "resource:///org/gnome/shell/extensions/extension.js" {
    import type { GettextDomain } from "gettext"
    import { ExtensionBase } from "resource:///org/gnome/shell/extensions/sharedInternals.js"

    class Extension extends ExtensionBase {
        static defineTranslationFunctions(url: string): GettextDomain

        enable(): void
        disable(): void

        /**
         * Open the extension's preferences window
         */
        openPreferences(): void
    }

    type Fn<Args extends unknown[] = unknown[], Returns = unknown> = (...args: Args) => Returns
    type CreateOverrideFunc = (originalMethod: Fn) => Fn

    class InjectionManager {
        /**
         * Modify, replace or inject a method
         *
         * @param prototype - the object (or prototype) that is modified
         * @param methodName - the name of the overwritten method
         * @param createOverrideFunc - function to call to create the override
         */
        overrideMethod(
            prototype: object,
            methodName: string,
            createOverrideFunc: CreateOverrideFunc,
        ): void

        /**
         * Restore the original method
         *
         * @param prototype - the object (or prototype) that is modified
         * @param methodName - the name of the method to restore
         */
        restoreMethod(prototype: object, methodName: string): void

        /**
         * Restore all original methods and clear overrides
         */
        clear(): void
    }
}
