#!/usr/bin/env node

import express from "express";
import fs from "fs";
import md5 from "md5";
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

// Clean up the working directory
if (fs.existsSync(workingDir + "/.cache")) {
  fs.rmdirSync(workingDir + "/.cache", { recursive: true });
}
if (fs.existsSync(workingDir + "/output.glb")) {
  fs.unlinkSync(workingDir + "/output.glb");
}

let lastUpdatedTime: Date | undefined = undefined;

const fullPath = path.join(workingDir, manifoldEntryPoint);

app.get("/", (_req, res) => {
  // res.send("Hello World!");
  res.sendFile(__dirname + "/index.html");
});

type MessagePusher = (
  id: number,
  type: "reload" | "error",
  message: string
) => void;

let mostRecentMessage: {
  id: number;
  type: "reload" | "error";
  message: string;
} | null = null;

const defaultPushMessage: MessagePusher = (id, type, message) => {
  mostRecentMessage = { id, type, message };
};
let pushMessage: MessagePusher = defaultPushMessage;

//stackoverflow.com/questions/34657222/how-to-use-server-sent-events-in-express-js
app.get("/reload", (req, res) => {
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders(); // flush the headers to establish SSE with client

  pushMessage = (id, type, message) => {
    console.log("pushMessage: ", { id, type, message });
    mostRecentMessage = { id, type, message };
    res.write(`event: message\ndata:${JSON.stringify({ type, message })}\n\n`);
  };

  // If client closes connection, stop sending events
  res.on("close", () => {
    pushMessage = defaultPushMessage;
    res.end();
  });
});

app.get("/status", (req, res) => {
  res.json({
    lastUpdatedTime,
    mostRecentMessage,
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
const _dynamicImportManifold3D = Function(
  'return import("manifold-3d")'
)() as Promise<typeof import("manifold-3d")>;

const _dynamicImportTsImport = Function(
  'return import("ts-import")'
)() as Promise<typeof import("ts-import")>;

let blobCleanUp: () => void | undefined;
let messageCounter = 0;

async function initalizeManifold() {
  // Manifold 3D WASM Module
  const Module = await _dynamicImportManifold3D;
  const wasm = await Module.default();
  wasm.setup();

  // ts-import
  const tsImport = await _dynamicImportTsImport;

  const { Manifold } = wasm;

  const writeToBlob = async function () {
    if (blobCleanUp) {
      console.log("Cleaning up...");
      blobCleanUp();
    }

    console.log(`\n\n\nProcessing the file...${manifoldEntryPoint}`);

    // Hot reload the user's manifold code
    // Note: loadTSModuleOnChange has much shenanigans
    const freshModule = await loadTSModuleOnChange(tsImport, fullPath);
    blobCleanUp = freshModule.cleanup;
    const userFunction = freshModule.default;

    try {
      const result = userFunction(wasm);

      if (!(result instanceof Manifold)) {
        throw new Error("The user function must return a Manifold instance.");
      }

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

      // Push the message to the client
      pushMessage(messageCounter, "reload", `File updated: ${lastUpdatedTime}`);
      messageCounter++;
    } catch (error) {
      let message;

      if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }

      console.warn("Error in user code: ", message);

      pushMessage(messageCounter, "error", message);
      messageCounter++;
      return;
    }
  };

  return writeToBlob;
}

initalizeManifold().then((writeToBlob) => {
  let timeoutId: ReturnType<typeof setTimeout> | undefined = undefined;

  let md5Previous: string | null = null;

  const respondToChange = (eventType: string, filename: string | null) => {
    if (filename && eventType === "change") {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(() => {
        const md5Current = md5(fs.readFileSync(fullPath));

        if (md5Current === md5Previous) {
          return;
        } else {
          writeToBlob();
          md5Previous = md5Current;
        }

        clearTimeout(timeoutId);
      }, 300);
    }
  };

  // The File Watcher Part
  fs.watch(manifoldEntryPoint, respondToChange);

  if (manifoldEntryPoint) {
    writeToBlob();
  }
});

const exitCleanup = () => {
  console.log("Exit. Cleaning up...");

  if (fs.existsSync(workingDir + "/.cache")) {
    fs.rmdirSync(workingDir + "/.cache", { recursive: true });
  }
  if (fs.existsSync(workingDir + "/output.glb")) {
    fs.unlinkSync(workingDir + "/output.glb");
  }
  if (blobCleanUp) {
    blobCleanUp();
  }

  process.exit(0);
};

// Clean up before process exits
process.on("exit", exitCleanup);
process.on("SIGINT", exitCleanup);
