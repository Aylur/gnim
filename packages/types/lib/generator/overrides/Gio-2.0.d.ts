interface ProxyWrapper<T extends Gio.DBusProxy> {
    /** @throws */
    (bus: Gio.DBusConnection, name: string, object: string): T
    (
        bus: Gio.DBusConnection,
        name: string,
        object: string,
        asyncCallback: (proxy: Gio.DBusProxy, error: unknown) => void,
        cancellable: Gio.Cancellable | null,
        flags: Gio.DBusProxyFlags,
    ): void
}

type ActionEntryObject = {
    /** The name of the action */
    name: string
    /** The type of the parameter that must match the parameter_type specified in the entry */
    parameter_type?: string | GLib.VariantType
    /** The initial state of the action */
    state?: string | boolean | GLib.Variant
    /** The callback to connect to the "activate" signal of the action */
    activate?: GObject.SignalCallback<
        Gio.SimpleAction,
        Gio.SimpleAction.SignalSignatures["activate"]
    >
    /** The callback to connect to the "change-state" signal of the action */
    change_state?: GObject.SignalCallback<
        Gio.SimpleAction,
        Gio.SimpleAction.SignalSignatures["change-state"]
    >
}

namespace Gio {
    interface Application {
        /**
         * Similar to {@link Gio.Application.run} but return a `Promise` which resolves when the main loop ends, instead of blocking while the main loop runs.
         * This helps avoid the situation where Promises never resolved if you didn't run the application inside a callback.
         */
        runAsync(argv: string[] | null): Promise<number>
    }

    /**
     * A convenient helper to create Promise wrappers for asynchronous functions in GJS.
     *
     * This utility replaces the original function on the class prototype with a Promise-based version,
     * allowing the function to be called on any instance of the class, including subclasses.
     * Simply pass the class prototype, the "async" function name, and the "finish" function name as arguments.
     *
     * The function can be used like any other Promise, without the need for a custom wrapper, by leaving out the callback argument.
     * The original function will still be available, and can be used by passing the callback.
     *
     * @param proto - The class prototype that contains the asynchronous function.
     * @param asyncFunc - The name of the asynchronous function.
     * @param finishFunc - The name of the "finish" function that is used to retrieve the result of the asynchronous function.
     *
     * @version Gjs 1.54
     * @see https://gjs.guide/guides/gjs/asynchronous-programming.html#promisify-helper
     *
     * @example
     * ```js
     * import Gio from "gi://Gio?version=2.0";
     *
     * Gio._promisify(Gio.InputStream.prototype, 'read_bytes_async', 'read_bytes_finish');
     *
     * try {
     *    const inputStream = new Gio.UnixInputStream({fd: 0});
     *    const bytes = await inputStream.read_bytes_async(4096, GLib.PRIORITY_DEFAULT, null);
     * } catch (e) {
     *    logError(e, 'Failed to read bytes');
     * }
     * ```
     *
     */
    export function _promisify(
        proto: any,
        asyncFunc: string,
        finishFunc?: string,
    ): void

    namespace DBus {
        export import get = Gio.bus_get
        export import get_finish = Gio.bus_get_finish
        export import get_sync = Gio.bus_get_sync

        export import own_name = Gio.bus_own_name
        export import own_name_on_connection = Gio.bus_own_name_on_connection
        export import unown_name = Gio.bus_unown_name

        export import watch_name = Gio.bus_watch_name
        export import watch_name_on_connection = Gio.bus_watch_name_on_connection
        export import unwatch_name = Gio.bus_unwatch_name

        /**
         * Convenience for getting the session {@link Gio.DBusConnection}.
         * This always returns the same object and is equivalent to calling:
         *
         * ```js
         * Gio.bus_get_sync(Gio.BusType.SESSION, null)
         * ```
         */
        const session: Gio.DBusConnection
        /**
         * Convenience for getting the system {@link Gio.DBusConnection}.
         * This always returns the same object and is equivalent to calling:
         *
         * ```js
         * Gio.bus_get_sync(Gio.BusType.SYSTEM, null)
         * ```
         */
        const system: Gio.DBusConnection
    }

    interface DBusConnection {
        /** @alias Gio.bus_watch_name_on_connection */
        watch_name(
            name: string,
            flags: BusNameWatcherFlags,
            name_appeared_handler: BusNameAppearedCallback | null,
            name_vanished_handler: BusNameVanishedCallback | null,
        ): number
        /** @alias Gio.bus_unwatch_name */
        unwatch_name(watcher_id: number): void
        /** @alias Gio.bus_own_name_on_connection */
        own_name(
            name: string,
            flags: BusNameOwnerFlags,
            name_acquired_handler: BusNameAcquiredCallback | null,
            name_lost_handler: BusNameLostCallback | null,
        ): number
        /** @alias Gio.bus_unown_name */
        unown_name(owner_id: number): void
    }

    interface DBusProxyClass {
        makeProxyWrapper<T extends DBusProxy>(
            interfaceXml: string,
        ): ProxyWrapper<T>
    }

    namespace DBusExportedObject {
        interface SignalSignatures
            extends DBusInterfaceSkeleton.SignalSignatures {
            "handle-method-call"(
                methodName: string,
                parameters: GLib.Variant,
                invocation: DBusMethodInvocation,
            ): void
            "handle-property-get"(propertyName: string): GLib.Variant | null
            "handle-property-set"(
                propertyName: string,
                value: GLib.Variant,
            ): void
        }

        interface ReadableProperties
            extends DBusInterfaceSkeleton.ReadableProperties {}

        interface WritableProperties
            extends DBusInterfaceSkeleton.WritableProperties {}

        interface ConstructOnlyProperties
            extends DBusInterfaceSkeleton.ConstructOnlyProperties {
            "g-interface-info": DBusInterfaceInfo
        }
    }

    interface DBusExportedObjectClass extends DBusInterfaceSkeletonClass {
        new (
            props?: Partial<GObject.ConstructorProps<DBusExportedObject>>,
        ): DBusExportedObject
        prototype: DBusExportedObject

        /**
         * Takes a JavaScript object instance implementing the interface described
         * by Gio.DBusInterfaceInfo, and returns an instance of Gio.DBusInterfaceSkeleton.
         *
         * @param interfaceInfo Valid D-Bus introspection XML or `DBusInterfaceInfo` structure
         * @param jsObj A class instance implementing interfaceInfo
         */
        wrapJSObject(
            interfaceInfo: string | DBusInterfaceInfo,
            jsObj: object,
        ): DBusExportedObject
    }

    /**
     * [GjsPrivate.DBusImplementation](https://gitlab.gnome.org/GNOME/gjs/-/blob/master/libgjs-private/gjs-gdbus-wrapper.c)
     */
    interface DBusExportedObject extends DBusInterfaceSkeleton {
        readonly $signals: DBusExportedObject.SignalSignatures
        readonly $readableProperties: DBusExportedObject.ReadableProperties
        readonly $writableProperties: DBusExportedObject.WritableProperties
        readonly $constructOnlyProperties: DBusExportedObject.ConstructOnlyProperties

        emit_property_changed(
            propertyName: string,
            propertyValue: GLib.Variant,
        ): void

        emit_signal(signalName: string, signalParameters: GLib.Variant): void
    }

    const DBusExportedObject: DBusExportedObjectClass

    namespace DBusInterfaceInfo {
        /**
         * Parses `xmlData` and returns a {@link Gio.DBusInterfaceInfo} representing the first `<interface>` element of the data.
         * This is a convenience wrapper around {@link Gio.DBusNodeInfo.new_for_xml} for the common case of a {@link Gio.DBusNodeInfo} with a single interface.
         *
         * @param xmlData Valid D-Bus introspection XML
         * @returns A {@link Gio.DBusInterfaceInfo} structure
         */
        function new_for_xml(xmlData: string): Gio.DBusInterfaceInfo
    }

    interface ListStore {
        [Symbol.iterator]: () => IterableIterator<GObject.Object>
    }

    interface FileEnumerator {
        /**
         * Gio.FileEnumerator are sync iterators.
         * Each iteration returns a Gio.FileInfo:
         *
         * ```js
         * const dir = Gio.File.new_for_path("/");
         * const enumerator = dir.enumerate_children(
         *   "standard::name",
         *   Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
         *   null
         * );
         *
         * for (const file_info of enumerator) {
         *   console.log(file_info.get_name());
         * }
         * ```
         *
         */
        [Symbol.iterator]: () => IterableIterator<FileInfo>
        /**
         * Gio.FileEnumerator are async iterators.
         * Each iteration returns a Gio.FileInfo:
         *
         * ```js
         * const dir = Gio.File.new_for_path("/");
         * const enumerator = dir.enumerate_children(
         *   "standard::name",
         *   Gio.FileQueryInfoFlags.NOFOLLOW_SYMLINKS,
         *   null
         * );
         *
         * for await (const file_info of enumerator) {
         *   console.log(file_info.get_name());
         * }
         * ```
         *
         */
        [Symbol.asyncIterator]: () => AsyncIterableIterator<FileInfo>
    }

    interface ActionMap {
        /**
         * A convenience function for creating multiple simple actions.
         * @param entries Array of action entries to add
         */
        add_action_entries(entries: ActionEntryObject[]): void
    }
}
