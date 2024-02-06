#!/usr/bin/env node

import express from "express";
import fs from "fs";
import path from "path";
import * as tsImport from "ts-import";
import { Document, WebIO } from "@gltf-transform/core";
import { prune } from "@gltf-transform/functions";
import { disposeMesh, setupIO, writeMesh } from "./gltf-io";
import type { To3MF } from "./worker";
import { addMesh } from "./worker";
import { loadTSModuleOnChange } from "./moduleLoadingOnChange";

const app = express();
const port = 3000;

const workingDir = process.cwd();
const manifoldEntryPoint = process.argv[2];

// Terminate the process if the filename is not provided
if (!manifoldEntryPoint) {
  console.error("Please provide a filename for the Manifold entry point. 111");
  process.exit(1);
}

let lastUpdatedTime: Date | undefined = undefined;

const fullPath = path.join(workingDir, manifoldEntryPoint);

app.get("/", (_req, res) => {
  // res.send("Hello World!");
  res.sendFile(__dirname + "/index.html");
});

app.get("/lastUpdatedTime", (_req, res) => {
  // send the last updated time in a json object
  res.json({ lastUpdatedTime });
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
const _dynamicImportManifold3D = Function(
  'return import("manifold-3d")'
)() as Promise<typeof import("manifold-3d")>;

const _dynamicImportTsImport = Function(
  'return import("ts-import")'
)() as Promise<typeof import("ts-import")>;

async function initalizeManifold() {
  // Manifold 3D WASM Module
  const Module = await _dynamicImportManifold3D;
  const wasm = await Module.default();
  wasm.setup();

  // ts-import
  const tsImport = await _dynamicImportTsImport;

  const wasmSetupTime = performance.now() - initiationTime;

  console.log(`Manifold WASM module loaded: ${wasmSetupTime}ms\n\n\n`);

  const { Manifold } = wasm;

  let cleanup: () => void | undefined;

  const writeToBlob = async function () {
    if (cleanup) {
      cleanup();
    }

    console.log(`\n\n\nProcessing the file...${manifoldEntryPoint}`);

    // Hot reload the user's manifold code
    // Note: loadTSModuleOnChange has much shenanigans
    const freshModule = await loadTSModuleOnChange(tsImport, fullPath);
    cleanup = freshModule.cleanup;
    const userFunction = freshModule.default;

    const result = userFunction(wasm);

    // Cargo culting from: https://github.com/elalish/manifold/blob/3b8282e1d5cd3d6f801432e4140e9b40f41ecbf6/bindings/wasm/examples/model-viewer.html#L129
    const manifoldMesh = result.getMesh();

    const io = setupIO(new WebIO());
    const doc = new Document();
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
    } as To3MF;

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
      disposeMesh(oldMesh);
    }

    const mesh = writeMesh(doc, manifoldMesh, id2properties);
    node.setMesh(mesh);
    addMesh(doc, to3mf, node, result);
    wrapper.addChild(node);

    await doc.transform(prune());

    const glb = await io.writeBinary(doc);

    const blob = new Blob([glb], { type: "application/octet-stream" });

    // Turn blob into File
    const arrayBuffer = await blob.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);

    // Write to disk
    fs.writeFileSync("output.glb", buffer);

    lastUpdatedTime = new Date();
  };

  return writeToBlob;
}

initalizeManifold().then((writeToBlob) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  const respondToChange = (eventType: string, filename: string | null) => {
    if (filename && eventType === "change") {
      if (timeoutId) {
        const bounceTime = performance.now() - initiationTime;

        console.log(`bouncing...${bounceTime}ms`);
      }

      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        console.log(`Processing the file...${filename}`);
        writeToBlob();

        clearTimeout(timeoutId);
      }, 4000);
    }
  };

  // The File Watcher Part
  fs.watch(manifoldEntryPoint, respondToChange);

  if (manifoldEntryPoint) {
    writeToBlob();
  }
});
