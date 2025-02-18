import fs from "./fs";
import path from "./path";
import * as powercord from "../powercord/index";
import {JSX, SASS} from "../powercord/compilers";
import electron from "./electron";
import errorboundary from "../powercord/components/errorboundary";
import DiscordModules from "@modules/discord";
import EventEmitter from "./events";
import os from "./os";
import util from "./util";
import zlib from "./zlib";
import stream from "./stream";
import querystring from "./querystring";
import url from "./url";
import * as http from "./http";
import * as https from "./https";
import crypto from "./crypto";
import net from "./net";
import tls from "./tls";
import Buffer from "./buffer";

export const cache = {};
export const nodeGlobals = ["require", "module", "exports", "__filename", "__dirname", "global"].join(", ");
export const globalPaths = [
    path.resolve(PCCompatNative.getBasePath(), "node_modules")
];
export const extensions = {
    ".js": (module: Module, filename: string) => {
        const fileContent = fs.readFileSync(filename, "utf8");
        module._compile(fileContent);
        return module.exports;
    },
    ".json": (module: Module, filename: string) => {
        const filecontent = fs.readFileSync(filename, "utf8");
        module.exports = JSON.parse(filecontent);

        return module.exports;
    },
    ".jsx": (module: Module, filename: string) => {
        const code = JSX.compile(filename);
        module.filecontent = code;
        module._compile(code);
        return module.exports;
    },
    ".scss": (module: Module, filename: string) => {
        const content = SASS.compile(filename);
        module.exports = content;

        return content;
    },
    ".css": (module: Module, filename: string) => {
        const content = fs.readFileSync(filename, "utf8");
        module.exports = content;

        return module.exports;
    },
    // I haven't tested this - I assume it works.
    // TODO: Make this not shitty
    ".node": (module: Module, filename: string) => {
        const thing = PCCompatNative.executeJS(`require(${JSON.stringify(filename)})`);
        module.exports = thing;

        return thing;
    }
};

export class Module {
    public id: string;
    public path: string;
    public exports: any;
    public parent: Module | null;
    public filename: string;
    public loaded: boolean;
    public children: Module[];
    public require: any;
    public filecontent?: string;

    constructor(id: string, parent: Module) {
        this.id = id;
        this.path = path.dirname(id);
        this.exports = {};
        this.parent = parent;
        this.filename = id;
        this.loaded = false;
        this.children = [];

        if (parent) parent.children.push(this);
    }

    _compile(code: string) {
        const wrapped = window.eval(`(function (${nodeGlobals}) {
            ${code}
            //# sourceURL=${JSON.stringify(this.filename).slice(1, -1)}
        })`);
        wrapped(this.require, this, this.exports, this.filename, this.path, window);
    }
};

export function resolve(path: string) {
    for (const key in cache) {
        if (key.startsWith(path)) return key;
    }
};

export type Require = CallableFunction & {
    resolve(path: string): string;
    cache: object;
};

export function createRequire(_path: string, parent: Module): Require {
    const require = (mod: string) => {
        if (typeof (mod) !== "string") return;
        if (~mod.indexOf("pc-settings/components/ErrorBoundary")) return errorboundary;

        switch (mod) {
            case "powercord": return powercord;
            case "path": return path;
            case "fs": return fs;
            case "module": return NodeModule;
            case "process": return window.process;
            case "electron": return electron;
            case "https": return https;
            case "http": return http;
            case "react": return DiscordModules.React;
            case "react-dom": return DiscordModules.ReactDOM;
            case "events": return EventEmitter;
            case "os": return os;
            case "util": return util;
            case "zlib": return zlib;
            case "stream": return stream;
            case "querystring": return querystring;
            case "url": return url;
            case "net": return net;
            case "tls": return tls;
            case "crypto": return crypto;
            case "buffer": return Buffer;

            default: {
                if (mod.startsWith("powercord/")) {
                    const value = mod.split("/").slice(1).filter(Boolean).reduce((value, key) => value[key], powercord);
                    if (value) return value;
                }

                return load(_path, mod, parent);
            }
        }
    };

    Object.assign(require, {cache, resolve});

    // @ts-ignore
    return require;
};

function hasExtension(mod: string) {
    return Boolean(extensions[path.extname(mod)]);
};

export function getExtension(mod: string) {
    return path.extname(mod) || Object.keys(extensions).find(ext => fs.existsSync(mod + ext)) || "";
};

function collectPNPMStores(node_modules: string) {
    const store = path.join(node_modules, ".pnpm");
    if (!fs.existsSync(store) || !fs.statSync(store).isDirectory()) return [];

    const result = [];

    for (const file of fs.readdirSync(store, "utf8")) {
        const fullPath = path.join(store, file, "node_modules");

        if (fs.existsSync(fullPath)) result.push(fullPath);
    }

    return result;
}

function resolveGlobalPath(mod: string, globalPaths: string[]) {
    const directMatch = globalPaths.find(globalPath => fs.existsSync(path.join(globalPath, mod)));
    if (directMatch) return directMatch;

    const withExtension = globalPaths.find(globalPath => getExtension(path.join(globalPath, mod)));
    if (withExtension) return withExtension;

    return "";
}

function getGlobalPath(mod: string) {
    const fromGlobals = resolveGlobalPath(mod, globalPaths);
    if (fromGlobals) return fromGlobals;

    const allPaths = globalPaths.flatMap(globalPath => collectPNPMStores(globalPath));
    const fromPNPM = resolveGlobalPath(mod, allPaths);
    if (fromPNPM) return fromPNPM;

    return "";
}

function getParent(_path: string, mod: string) {
    const concatPath = path.resolve(_path, mod);
    if (fs.existsSync(concatPath)) return concatPath;

    const globalPath = path.join(getGlobalPath(mod), mod);
    if (fs.existsSync(globalPath)) return globalPath;

    return "";
}

export function resolveMain(_path: string, mod: string): string {
    const parent = hasExtension(_path) ? path.dirname(_path) : getParent(_path, mod);

    if (!fs.existsSync(parent)) throw new Error(`Cannot find module ${mod}\ntree:\n\r-${_path}`);
    const files = fs.readdirSync(parent, "utf8");

    for (const file of files) {
        const ext = path.extname(file);

        if (file === "package.json") {
            const pkg = JSON.parse(fs.readFileSync(path.resolve(parent, file), "utf8"));
            if (!Reflect.has(pkg, "main")) continue;

            return path.resolve(parent, hasExtension(pkg.main) ? pkg.main : pkg.main + getExtension(path.join(parent, pkg.main)));
        }

        if (file.slice(0, -ext.length) === "index" && extensions[ext]) return path.resolve(parent, file);
    }

    if (mod.startsWith("./")) return null;
    const globalMod = globalPaths.find(pth => fs.existsSync(path.join(pth, mod)));

    if (globalMod) return resolveMain(globalMod, mod);

    return globalPaths.find(pth => getExtension(path.join(pth, mod)));
};

export function getFilePath(_path: string, mod: string): string {
    const combined = path.resolve(_path, mod);
    const pth = hasExtension(combined) ? combined : combined + getExtension(combined);

    if (fs.existsSync(pth) && fs.statSync(pth).isFile()) return pth;
    if (!hasExtension(mod)) return resolveMain(_path, mod);

    return mod;
};

export function load(_path: string, mod: string, req = null) {
    const file = getFilePath(_path, mod);
    if (!fs.existsSync(file)) throw new Error(`Cannot find module ${mod}\ntree:\n\r-${_path}`);
    if (cache[file]) return cache[file].exports;
    const stats = fs.statSync(file, "utf8");
    if (stats.isDirectory()) mod = resolveMain(_path, mod);
    const ext = getExtension(file);
    const loader = extensions[ext];

    if (!loader) throw new Error(`Cannot find module ${file}`);
    const module = cache[file] = new Module(file, req);
    const require = createRequire(path.dirname(file), module);
    module.require = require;

    loader(module, file);

    return module.exports;
};

// TODO: Add globalPaths support
const NodeModule = {_extensions: extensions, cache, _load: load, globalPaths: globalPaths};

export default NodeModule;