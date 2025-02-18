import * as IPCEvents from "../common/ipcevents";
import {cloneObject} from "../common/util";
import path from "path";
import createIPC from "./ipc";

const callbacks = new Map<string, Set<Function>>();
const {IPC} = createIPC();

const Process: NodeJS.Process = cloneObject(process) as any;

const initializeCallbacks = function (event: string) {
    callbacks.set(event, new Set());

    process.on(event, (...args) => {
        IPC.emit(IPCEvents.HANDLE_CALLBACK, event, args);
    });
};

IPC.on(IPCEvents.HANDLE_CALLBACK, (event: string, ...args: any[]) => {
    if (!callbacks.has(event)) return;

    for (const callback of callbacks.get(event)) {
        try {
            callback(...args);
        } catch (error) {
            console.error(error);
        }
    }
});

// Make zlibrary happy
Object.assign(Process.env, {
    injDir: path.resolve(__dirname, "..", "..", "bd-compat")
});

// We need to override that because using electron's contextBridge to expose the process freezes the client.
Object.assign(Process, {
    on: (event: string, listener: Function) => {
        if (!callbacks.has(event)) initializeCallbacks(event);

        callbacks
            .get(event)
            .add(listener);
    },
    off: (event: string, listener: Function) => {
        if (!callbacks.has(event)) return;

        return callbacks
            .get(event)
            .delete(listener);
    }
});

export default Process;