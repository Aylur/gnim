#!/usr/bin/env nu

def spawn-gnim-test [file: string]: nothing -> int {
    job spawn {
        (cargo run
            --quiet
            --package
            gnim
            --
            dev $file
            o+e>| complete
            | job send --tag (job id) 0
        )
    }
}

def wait-gnim-test [name: string, id: int] {
    let result = try { job recv --tag $id --timeout 30sec } catch { null }

    if $result == null {
        job kill $id
        print --stderr $"($name) did not exit"
        return 1
    }

    print $result.stdout
    $result.exit_code
}

def run-gnim-test [file: string]: nothing -> int {
    wait-gnim-test $file (spawn-gnim-test $file)
}

def run-dbus-tests []: nothing -> int {
    let bus = job spawn {
        (dbus-daemon --session --nofork --print-address
            | lines
            | each {|address| $address | job send 0 }
            | ignore
        )
    }

    let code = with-env { DBUS_SESSION_BUS_ADDRESS: (job recv --timeout 5sec) } {
        let service = spawn-gnim-test tests/dbus/service.ts
        let proxy = spawn-gnim-test tests/dbus/proxy.ts

        let codes = [
            (wait-gnim-test service $service)
            (wait-gnim-test proxy $proxy)
        ]

        if ($codes | any {|code| $code != 0 }) { 1 } else { 0 }
    }

    job kill $bus
    $code
}

def "main test" [] {
    cd ($env.CURRENT_FILE | path dirname)
    cargo build --quiet --package gnim

    let vitest = try { vitest run; true } catch { false }
    let gobject = run-gnim-test tests/gobject/index.ts
    let dbus = run-dbus-tests

    if not $vitest or $gobject != 0 or $dbus != 0 {
        exit 1
    }
}

def main [] {
    nu $env.CURRENT_FILE --help
}
