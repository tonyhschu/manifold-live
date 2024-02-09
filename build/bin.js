#!/usr/bin/env node
"use strict";
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const fs_1 = __importDefault(require("fs"));
const md5_1 = __importDefault(require("md5"));
const path_1 = __importDefault(require("path"));
const core_1 = require("@gltf-transform/core");
const functions_1 = require("@gltf-transform/functions");
const gltf_io_1 = require("./gltf-io");
const worker_1 = require("./worker");
const moduleLoadingOnChange_1 = require("./moduleLoadingOnChange");
const app = (0, express_1.default)();
const port = 3000;
const workingDir = process.cwd();
const manifoldEntryPoint = process.argv[2];
// Terminate the process if the filename is not provided
if (!manifoldEntryPoint) {
    console.error("Please provide a filename for the Manifold entry point. 111");
    process.exit(1);
}
// Clean up the working directory
if (fs_1.default.existsSync(workingDir + "/.cache")) {
    fs_1.default.rmdirSync(workingDir + "/.cache", { recursive: true });
}
if (fs_1.default.existsSync(workingDir + "/output.glb")) {
    fs_1.default.unlinkSync(workingDir + "/output.glb");
}
let lastUpdatedTime = undefined;
const fullPath = path_1.default.join(workingDir, manifoldEntryPoint);
app.get("/", (_req, res) => {
    // res.send("Hello World!");
    res.sendFile(__dirname + "/index.html");
});
const defaultPushMessage = (type, message) => {
    console.log("No client to push message to...");
};
let pushMessage = defaultPushMessage;
//stackoverflow.com/questions/34657222/how-to-use-server-sent-events-in-express-js
app.get("/reload", (req, res) => {
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders(); // flush the headers to establish SSE with client
    pushMessage = (type, message) => {
        console.log("pushMessage: ", { type, message });
        res.write(`event: ${type}\ndata:${JSON.stringify({ type, message })}\n\n`);
    };
    // If client closes connection, stop sending events
    res.on("close", () => {
        pushMessage = defaultPushMessage;
        res.end();
    });
});
app.get("/file", (req, res) => {
    // res.sendFile(__dirname + "/manifold-blob.glb");
    res.sendFile(workingDir + "/output.glb");
});
app.listen(port, () => {
    console.log(`Example app listening at http://localhost:${port} for file.`);
});
const initiationTime = performance.now();
// https://github.com/microsoft/TypeScript/issues/43329#issuecomment-1669659858
const _dynamicImportManifold3D = Function('return import("manifold-3d")')();
const _dynamicImportTsImport = Function('return import("ts-import")')();
function initalizeManifold() {
    return __awaiter(this, void 0, void 0, function* () {
        // Manifold 3D WASM Module
        const Module = yield _dynamicImportManifold3D;
        const wasm = yield Module.default();
        wasm.setup();
        // ts-import
        const tsImport = yield _dynamicImportTsImport;
        const { Manifold } = wasm;
        let cleanup;
        const writeToBlob = function () {
            return __awaiter(this, void 0, void 0, function* () {
                if (cleanup) {
                    console.log("Cleaning up...");
                    cleanup();
                }
                console.log(`\n\n\nProcessing the file...${manifoldEntryPoint}`);
                // Hot reload the user's manifold code
                // Note: loadTSModuleOnChange has much shenanigans
                const freshModule = yield (0, moduleLoadingOnChange_1.loadTSModuleOnChange)(tsImport, fullPath);
                cleanup = freshModule.cleanup;
                const userFunction = freshModule.default;
                try {
                    const result = userFunction(wasm);
                    // Cargo culting from: https://github.com/elalish/manifold/blob/3b8282e1d5cd3d6f801432e4140e9b40f41ecbf6/bindings/wasm/examples/model-viewer.html#L129
                    const manifoldMesh = result.getMesh();
                    const io = (0, gltf_io_1.setupIO)(new core_1.WebIO());
                    const doc = new core_1.Document();
                    const id2properties = new Map();
                    const to3mf = {
                        meshes: [],
                        components: [],
                        items: [],
                        precision: 7,
                        header: {
                            unit: "millimeter",
                            title: "ManifoldCAD.org model",
                            description: "ManifoldCAD.org model",
                            application: "ManifoldCAD.org",
                        },
                    };
                    // Cargo Culting from: https://github.com/elalish/manifold/blob/3b8282e1d5cd3d6f801432e4140e9b40f41ecbf6/bindings/wasm/examples/worker.ts#L765
                    const halfRoot2 = Math.sqrt(2) / 2;
                    const mm2m = 1 / 1000;
                    const wrapper = doc
                        .createNode("wrapper")
                        .setRotation([-halfRoot2, 0, 0, halfRoot2])
                        .setScale([mm2m, mm2m, mm2m]);
                    doc.createScene().addChild(wrapper);
                    const node = doc.createNode();
                    doc.createScene().addChild(node);
                    const oldMesh = node.getMesh();
                    if (oldMesh) {
                        (0, gltf_io_1.disposeMesh)(oldMesh);
                    }
                    const mesh = (0, gltf_io_1.writeMesh)(doc, manifoldMesh, id2properties);
                    node.setMesh(mesh);
                    (0, worker_1.addMesh)(doc, to3mf, node, result);
                    wrapper.addChild(node);
                    yield doc.transform((0, functions_1.prune)());
                    const glb = yield io.writeBinary(doc);
                    const blob = new Blob([glb], { type: "application/octet-stream" });
                    // Turn blob into File
                    const arrayBuffer = yield blob.arrayBuffer();
                    const buffer = Buffer.from(arrayBuffer);
                    // Write to disk
                    fs_1.default.writeFileSync("output.glb", buffer);
                    lastUpdatedTime = new Date();
                    // Push the message to the client
                    pushMessage("success", `File updated: ${lastUpdatedTime}`);
                }
                catch (error) {
                    let message;
                    if (error instanceof Error) {
                        message = error.message;
                    }
                    else {
                        message = String(error);
                    }
                    console.warn("Error in user code: ", message);
                    pushMessage("error", message);
                    return;
                }
            });
        };
        return writeToBlob;
    });
}
initalizeManifold().then((writeToBlob) => {
    let timeoutId = undefined;
    let md5Previous = null;
    const respondToChange = (eventType, filename) => {
        if (filename && eventType === "change") {
            clearTimeout(timeoutId);
            timeoutId = setTimeout(() => {
                const md5Current = (0, md5_1.default)(fs_1.default.readFileSync(fullPath));
                if (md5Current === md5Previous) {
                    return;
                }
                else {
                    writeToBlob();
                    md5Previous = md5Current;
                }
                clearTimeout(timeoutId);
            }, 300);
        }
    };
    // The File Watcher Part
    fs_1.default.watch(manifoldEntryPoint, respondToChange);
    if (manifoldEntryPoint) {
        writeToBlob();
    }
});
