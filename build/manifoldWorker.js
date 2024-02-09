"use strict";
// Copyright 2022 The Manifold Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
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
const core_1 = require("@gltf-transform/core");
const extensions_1 = require("@gltf-transform/extensions");
const _3mf_export_1 = require("@jscadui/3mf-export");
const fflate_1 = require("fflate");
const glMatrix = __importStar(require("gl-matrix"));
const manifold_1 = __importDefault(require("./built/manifold"));
const gltf_io_1 = require("./gltf-io");
const module = (await (0, manifold_1.default)());
module.setup();
// Faster on modern browsers than Float32Array
glMatrix.glMatrix.setMatrixArrayType(Array);
const io = (0, gltf_io_1.setupIO)(new core_1.WebIO());
io.registerExtensions(extensions_1.KHRONOS_EXTENSIONS);
// manifold static methods (that return a new manifold)
const manifoldStaticFunctions = [
    "cube",
    "cylinder",
    "sphere",
    "tetrahedron",
    "extrude",
    "revolve",
    "compose",
    "union",
    "difference",
    "intersection",
    "levelSet",
    "smooth",
    "ofMesh",
    "hull",
];
// manifold member functions (that return a new manifold)
const manifoldMemberFunctions = [
    "add",
    "subtract",
    "intersect",
    "decompose",
    "warp",
    "transform",
    "translate",
    "rotate",
    "scale",
    "mirror",
    "refine",
    "setProperties",
    "asOriginal",
    "trimByPlane",
    "split",
    "splitByPlane",
    "slice",
    "project",
    "hull",
];
// CrossSection static methods (that return a new cross-section)
const crossSectionStaticFunctions = [
    "square",
    "circle",
    "union",
    "difference",
    "intersection",
    "compose",
    "ofPolygons",
    "hull",
];
// CrossSection member functions (that return a new cross-section)
const crossSectionMemberFunctions = [
    "add",
    "subtract",
    "intersect",
    "rectClip",
    "decompose",
    "transform",
    "translate",
    "rotate",
    "scale",
    "mirror",
    "simplify",
    "offset",
    "hull",
];
// top level functions that construct a new manifold/mesh
const toplevelConstructors = ["show", "only", "setMaterial"];
const toplevel = [
    "setMinCircularAngle",
    "setMinCircularEdgeLength",
    "setCircularSegments",
    "getCircularSegments",
    "Mesh",
    "GLTFNode",
    "Manifold",
    "CrossSection",
    "setMorphStart",
    "setMorphEnd",
];
const exposedFunctions = toplevelConstructors.concat(toplevel);
// Setup memory management, such that users don't have to care about
// calling `delete` manually.
// Note that this only fixes memory leak across different runs: the memory
// will only be freed when the compilation finishes.
const memoryRegistry = new Array();
function addMembers(className, methodNames, areStatic) {
    //@ts-ignore
    const cls = module[className];
    const obj = areStatic ? cls : cls.prototype;
    for (const name of methodNames) {
        const originalFn = obj[name];
        obj[name] = function (...args) {
            //@ts-ignore
            const result = originalFn(...args);
            memoryRegistry.push(result);
            return result;
        };
    }
}
addMembers("Manifold", manifoldMemberFunctions, false);
addMembers("Manifold", manifoldStaticFunctions, true);
addMembers("CrossSection", crossSectionMemberFunctions, false);
addMembers("CrossSection", crossSectionStaticFunctions, true);
for (const name of toplevelConstructors) {
    //@ts-ignore
    const originalFn = module[name];
    //@ts-ignore
    module[name] = function (...args) {
        const result = originalFn(...args);
        memoryRegistry.push(result);
        return result;
    };
}
module.cleanup = function () {
    for (const obj of memoryRegistry) {
        // decompose result is an array of manifolds
        if (obj instanceof Array)
            for (const elem of obj)
                elem.delete();
        else
            obj.delete();
    }
    memoryRegistry.length = 0;
};
// Debug setup to show source meshes
let ghost = false;
const shown = new Map();
const singles = new Map();
const FPS = 30;
const GLOBAL_DEFAULTS = {
    roughness: 0.2,
    metallic: 1,
    baseColorFactor: [1, 1, 0],
    alpha: 1,
    unlit: false,
    animationLength: 1,
    animationMode: "loop",
};
const SHOW = {
    baseColorFactor: [1, 0, 0],
    alpha: 0.25,
    roughness: 1,
    metallic: 0,
};
const GHOST = {
    baseColorFactor: [0.5, 0.5, 0.5],
    alpha: 0.25,
    roughness: 1,
    metallic: 0,
};
const nodes = new Array();
const id2material = new Map();
const materialCache = new Map();
const object2globalID = new Map();
const manifold2morph = new Map();
// lib3mf doesn't like objectid=0
let nextGlobalID = 1;
let animation;
let timesAccessor;
let weightsAccessor;
let weightsSampler;
let hasAnimation;
function cleanup() {
    ghost = false;
    shown.clear();
    singles.clear();
    nodes.length = 0;
    id2material.clear();
    materialCache.clear();
    object2globalID.clear();
    manifold2morph.clear();
    nextGlobalID = 1;
}
class GLTFNode {
    constructor(parent) {
        this._parent = parent;
        nodes.push(this);
    }
    clone(parent) {
        const copy = Object.assign({}, this);
        copy._parent = parent;
        nodes.push(copy);
        return copy;
    }
    get parent() {
        return this._parent;
    }
}
module.GLTFNode = GLTFNode;
const globalDefaults = Object.assign({}, GLOBAL_DEFAULTS);
module.setMaterial = (manifold, material) => {
    const out = manifold.asOriginal();
    id2material.set(out.originalID(), material);
    return out;
};
module.setMorphStart = (manifold, func) => {
    const morph = manifold2morph.get(manifold);
    if (morph != null) {
        morph.start = func;
    }
    else {
        manifold2morph.set(manifold, { start: func });
    }
};
module.setMorphEnd = (manifold, func) => {
    const morph = manifold2morph.get(manifold);
    if (morph != null) {
        morph.end = func;
    }
    else {
        manifold2morph.set(manifold, { end: func });
    }
};
function debug(manifold, map) {
    let result = manifold.asOriginal();
    map.set(result.originalID(), result.getMesh());
    return result;
}
module.show = (manifold) => {
    return debug(manifold, shown);
};
module.only = (manifold) => {
    ghost = true;
    return debug(manifold, singles);
};
// Setup complete
self.postMessage(null);
if (self.console) {
    const oldLog = self.console.log;
    self.console.log = function (...args) {
        let message = "";
        for (const arg of args) {
            if (arg == null) {
                message += "undefined";
            }
            else if (typeof arg == "object") {
                message += JSON.stringify(arg, null, 4);
            }
            else {
                message += arg.toString();
            }
        }
        self.postMessage({ log: message });
        oldLog(...args);
    };
}
// Swallow informational logs in testing framework
function log(...args) {
    if (self.console) {
        self.console.log(...args);
    }
}
self.onmessage = (e) => __awaiter(void 0, void 0, void 0, function* () {
    const content = "const globalDefaults = {};\n" +
        e.data +
        '\nreturn exportModels(globalDefaults, typeof result === "undefined" ? undefined : result);\n';
    try {
        const f = new Function("exportModels", "glMatrix", "module", ...exposedFunctions, content);
        yield f(exportModels, glMatrix, module, //@ts-ignore
        ...exposedFunctions.map((name) => module[name]));
    }
    catch (error) {
        console.log(error.toString());
        self.postMessage({ objectURL: null });
    }
    finally {
        module.cleanup();
        cleanup();
    }
});
function euler2quat(rotation) {
    const { quat } = glMatrix;
    const deg2rad = Math.PI / 180;
    const q = quat.create();
    quat.rotateZ(q, q, deg2rad * rotation[2]);
    quat.rotateY(q, q, deg2rad * rotation[1]);
    quat.rotateX(q, q, deg2rad * rotation[0]);
    return q;
}
function addMotion(doc, type, node, out) {
    const motion = node[type];
    if (motion == null) {
        return null;
    }
    if (typeof motion !== "function") {
        return motion;
    }
    const nFrames = timesAccessor.getCount();
    const nEl = type == "rotation" ? 4 : 3;
    const frames = new Float32Array(nEl * nFrames);
    for (let i = 0; i < nFrames; ++i) {
        const x = i / (nFrames - 1);
        const m = motion(globalDefaults.animationMode !== "ping-pong"
            ? x
            : (1 - Math.cos(x * 2 * Math.PI)) / 2);
        frames.set(nEl === 4 ? euler2quat(m) : m, nEl * i);
    }
    const framesAccessor = doc
        .createAccessor(node.name + " " + type + " frames")
        .setBuffer(doc.getRoot().listBuffers()[0])
        .setArray(frames)
        .setType(nEl === 4 ? core_1.Accessor.Type.VEC4 : core_1.Accessor.Type.VEC3);
    const sampler = doc
        .createAnimationSampler()
        .setInput(timesAccessor)
        .setOutput(framesAccessor)
        .setInterpolation("LINEAR");
    const channel = doc
        .createAnimationChannel()
        .setTargetPath(type)
        .setTargetNode(out)
        .setSampler(sampler);
    animation.addSampler(sampler);
    animation.addChannel(channel);
    hasAnimation = true;
    return motion(0);
}
function setMorph(doc, node, manifold) {
    if (manifold2morph.has(manifold)) {
        const channel = doc
            .createAnimationChannel()
            .setTargetPath("weights")
            .setTargetNode(node)
            .setSampler(weightsSampler);
        animation.addChannel(channel);
        hasAnimation = true;
    }
}
function morphStart(manifoldMesh, morph) {
    const inputPositions = [];
    if (morph == null) {
        return inputPositions;
    }
    for (let i = 0; i < manifoldMesh.numVert; ++i) {
        for (let j = 0; j < 3; ++j)
            inputPositions[i * 3 + j] =
                manifoldMesh.vertProperties[i * manifoldMesh.numProp + j];
    }
    if (morph.start) {
        for (let i = 0; i < manifoldMesh.numVert; ++i) {
            const vertProp = manifoldMesh.vertProperties;
            const offset = i * manifoldMesh.numProp;
            const pos = inputPositions.slice(offset, offset + 3);
            morph.start(pos);
            for (let j = 0; j < 3; ++j)
                vertProp[offset + j] = pos[j];
        }
    }
    return inputPositions;
}
function morphEnd(doc, manifoldMesh, mesh, inputPositions, morph) {
    if (morph == null) {
        return;
    }
    mesh.setWeights([0]);
    mesh.listPrimitives().forEach((primitive, i) => {
        if (morph.end) {
            for (let i = 0; i < manifoldMesh.numVert; ++i) {
                const pos = inputPositions.slice(3 * i, 3 * (i + 1));
                morph.end(pos);
                inputPositions.splice(3 * i, 3, ...pos);
            }
        }
        const startPosition = primitive.getAttribute("POSITION").getArray();
        const array = new Float32Array(startPosition.length);
        const offset = manifoldMesh.runIndex[i];
        for (let j = 0; j < array.length; ++j) {
            array[j] = inputPositions[offset + j] - startPosition[j];
        }
        const morphAccessor = doc
            .createAccessor(mesh.getName() + " morph target")
            .setBuffer(doc.getRoot().listBuffers()[0])
            .setArray(array)
            .setType(core_1.Accessor.Type.VEC3);
        const morphTarget = doc
            .createPrimitiveTarget()
            .setAttribute("POSITION", morphAccessor);
        primitive.addTarget(morphTarget);
    });
}
function createGLTFnode(doc, node) {
    const out = doc.createNode(node.name);
    const pos = addMotion(doc, "translation", node, out);
    if (pos != null) {
        out.setTranslation(pos);
    }
    const rot = addMotion(doc, "rotation", node, out);
    if (rot != null) {
        out.setRotation(euler2quat(rot));
    }
    const scale = addMotion(doc, "scale", node, out);
    if (scale != null) {
        out.setScale(scale);
    }
    return out;
}
function getBackupMaterial(node) {
    if (node == null) {
        return {};
    }
    if (node.material == null) {
        node.material = getBackupMaterial(node.parent);
    }
    return node.material;
}
function makeDefaultedMaterial(doc, matIn = {}) {
    var _a;
    const defaults = Object.assign({}, globalDefaults);
    Object.assign(defaults, matIn);
    const { roughness, metallic, baseColorFactor, alpha, unlit } = defaults;
    const material = doc.createMaterial((_a = matIn.name) !== null && _a !== void 0 ? _a : "");
    if (unlit) {
        const unlit = doc.createExtension(extensions_1.KHRMaterialsUnlit).createUnlit();
        material.setExtension("KHR_materials_unlit", unlit);
    }
    if (alpha < 1) {
        material.setAlphaMode(core_1.Material.AlphaMode.BLEND).setDoubleSided(true);
    }
    return material
        .setRoughnessFactor(roughness)
        .setMetallicFactor(metallic)
        .setBaseColorFactor([...baseColorFactor, alpha]);
}
function getCachedMaterial(doc, matDef) {
    if (!materialCache.has(matDef)) {
        materialCache.set(matDef, makeDefaultedMaterial(doc, matDef));
    }
    return materialCache.get(matDef);
}
function addMesh(doc, to3mf, node, manifold, backupMaterial = {}) {
    var _a;
    const numTri = manifold.numTri();
    if (numTri == 0) {
        log("Empty manifold, skipping.");
        return;
    }
    log(`Triangles: ${numTri.toLocaleString()}`);
    const box = manifold.boundingBox();
    const size = [0, 0, 0];
    for (let i = 0; i < 3; i++) {
        size[i] = Math.round((box.max[i] - box.min[i]) * 10) / 10;
    }
    log(`Bounding Box: X = ${size[0].toLocaleString()} mm, Y = ${size[1].toLocaleString()} mm, Z = ${size[2].toLocaleString()} mm`);
    const volume = Math.round(manifold.getProperties().volume / 10);
    log(`Genus: ${manifold.genus().toLocaleString()}, Volume: ${(volume / 100).toLocaleString()} cm^3`);
    // From Z-up to Y-up (glTF)
    const manifoldMesh = manifold.getMesh();
    const id2properties = new Map();
    for (const id of manifoldMesh.runOriginalID) {
        const material = id2material.get(id) || backupMaterial;
        id2properties.set(id, {
            material: getCachedMaterial(doc, ghost ? GHOST : material),
            attributes: ["POSITION", ...((_a = material.attributes) !== null && _a !== void 0 ? _a : [])],
        });
    }
    const morph = manifold2morph.get(manifold);
    const inputPositions = morphStart(manifoldMesh, morph);
    const mesh = (0, gltf_io_1.writeMesh)(doc, manifoldMesh, id2properties);
    mesh.setName(node.getName());
    node.setMesh(mesh);
    morphEnd(doc, manifoldMesh, mesh, inputPositions, morph);
    const vertices = manifoldMesh.numProp === 3
        ? manifoldMesh.vertProperties
        : new Float32Array(manifoldMesh.numVert * 3);
    if (manifoldMesh.numProp > 3) {
        for (let i = 0; i < manifoldMesh.numVert; ++i) {
            for (let j = 0; j < 3; ++j)
                vertices[i * 3 + j] =
                    manifoldMesh.vertProperties[i * manifoldMesh.numProp + j];
        }
    }
    object2globalID.set(manifold, nextGlobalID);
    to3mf.meshes.push({
        vertices,
        indices: manifoldMesh.triVerts,
        id: `${nextGlobalID++}`,
    });
    for (const [run, id] of manifoldMesh.runOriginalID.entries()) {
        const show = shown.has(id);
        const inMesh = show ? shown.get(id) : singles.get(id);
        if (inMesh == null) {
            continue;
        }
        id2properties.get(id).material = getCachedMaterial(doc, show ? SHOW : id2material.get(id) || backupMaterial);
        const debugNode = doc
            .createNode("debug")
            .setMesh((0, gltf_io_1.writeMesh)(doc, inMesh, id2properties))
            .setMatrix(manifoldMesh.transform(run));
        node.addChild(debugNode);
    }
}
function cloneNode(toNode, fromNode) {
    toNode.setMesh(fromNode.getMesh());
    fromNode.listChildren().forEach((child) => {
        const clone = child.clone();
        toNode.addChild(clone);
    });
}
function cloneNodeNewMaterial(doc, toNode, fromNode, backupMaterial, oldBackupMaterial) {
    cloneNode(toNode, fromNode);
    const mesh = doc.createMesh();
    toNode.setMesh(mesh);
    fromNode
        .getMesh()
        .listPrimitives()
        .forEach((primitive) => {
        const newPrimitive = primitive.clone();
        if (primitive.getMaterial() === oldBackupMaterial) {
            newPrimitive.setMaterial(backupMaterial);
        }
        mesh.addPrimitive(newPrimitive);
    });
}
function createNodeFromCache(doc, to3MF, nodeDef, manifold2node) {
    const node = createGLTFnode(doc, nodeDef);
    const { manifold } = nodeDef;
    if (manifold != null) {
        setMorph(doc, node, manifold);
        const backupMaterial = getBackupMaterial(nodeDef);
        const cachedNodes = manifold2node.get(manifold);
        if (cachedNodes == null) {
            addMesh(doc, to3MF, node, manifold, backupMaterial);
            const cache = new Map();
            cache.set(backupMaterial, node);
            manifold2node.set(manifold, cache);
        }
        else {
            const cachedNode = cachedNodes.get(backupMaterial);
            if (cachedNode == null) {
                const [oldBackupMaterial, oldNode] = cachedNodes.entries().next().value;
                cloneNodeNewMaterial(doc, node, oldNode, getCachedMaterial(doc, backupMaterial), getCachedMaterial(doc, oldBackupMaterial));
                cachedNodes.set(backupMaterial, node);
            }
            else {
                cloneNode(node, cachedNode);
            }
        }
    }
    object2globalID.set(nodeDef, nextGlobalID);
    to3MF.components.push({
        id: `${nextGlobalID++}`,
        name: nodeDef.name,
        children: manifold == null
            ? []
            : [{ objectID: `${object2globalID.get(manifold)}` }],
    });
    return node;
}
function exportModels(defaults, manifold) {
    return __awaiter(this, void 0, void 0, function* () {
        Object.assign(globalDefaults, GLOBAL_DEFAULTS);
        Object.assign(globalDefaults, defaults);
        const doc = new core_1.Document();
        const halfRoot2 = Math.sqrt(2) / 2;
        const mm2m = 1 / 1000;
        const wrapper = doc
            .createNode("wrapper")
            .setRotation([-halfRoot2, 0, 0, halfRoot2])
            .setScale([mm2m, mm2m, mm2m]);
        doc.createScene().addChild(wrapper);
        animation = doc.createAnimation("");
        hasAnimation = false;
        const nFrames = Math.round(globalDefaults.animationLength * FPS) + 1;
        const times = new Float32Array(nFrames);
        const weights = new Float32Array(nFrames);
        for (let i = 0; i < nFrames; ++i) {
            const x = i / (nFrames - 1);
            times[i] = x * globalDefaults.animationLength;
            weights[i] =
                globalDefaults.animationMode !== "ping-pong"
                    ? x
                    : (1 - Math.cos(x * 2 * Math.PI)) / 2;
        }
        timesAccessor = doc
            .createAccessor("animation times")
            .setBuffer(doc.createBuffer())
            .setArray(times)
            .setType(core_1.Accessor.Type.SCALAR);
        weightsAccessor = doc
            .createAccessor("animation weights")
            .setBuffer(doc.getRoot().listBuffers()[0])
            .setArray(weights)
            .setType(core_1.Accessor.Type.SCALAR);
        weightsSampler = doc
            .createAnimationSampler()
            .setInput(timesAccessor)
            .setOutput(weightsAccessor)
            .setInterpolation("LINEAR");
        animation.addSampler(weightsSampler);
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
        if (nodes.length > 0) {
            const node2gltf = new Map();
            const manifold2node = new Map();
            let leafNodes = 0;
            for (const nodeDef of nodes) {
                node2gltf.set(nodeDef, createNodeFromCache(doc, to3mf, nodeDef, manifold2node));
                if (nodeDef.manifold) {
                    ++leafNodes;
                }
            }
            for (const nodeDef of nodes) {
                const gltfNode = node2gltf.get(nodeDef);
                const child = {
                    objectID: `${object2globalID.get(nodeDef)}`,
                    transform: gltfNode.getMatrix(),
                };
                const { parent } = nodeDef;
                if (parent == null) {
                    wrapper.addChild(gltfNode);
                    to3mf.items.push(child);
                }
                else {
                    node2gltf.get(parent).addChild(gltfNode);
                    const parent3mf = to3mf.components.find((comp) => comp.id == `${object2globalID.get(parent)}`);
                    parent3mf.children.push(child);
                }
            }
            log("Total glTF nodes: ", nodes.length, ", Total mesh references: ", leafNodes);
        }
        else {
            if (manifold == null) {
                log('No output because "result" is undefined and no "GLTFNode"s were created.');
                return;
            }
            const node = doc.createNode();
            addMesh(doc, to3mf, node, manifold);
            wrapper.addChild(node);
            to3mf.items.push({ objectID: `${object2globalID.get(manifold)}` });
        }
        if (!hasAnimation) {
            timesAccessor.dispose();
            weightsAccessor.dispose();
            weightsSampler.dispose();
            animation.dispose();
        }
        const glb = yield io.writeBinary(doc);
        const blobGLB = new Blob([glb], { type: "application/octet-stream" });
        const fileForRelThumbnail = new _3mf_export_1.FileForRelThumbnail();
        fileForRelThumbnail.add3dModel("3D/3dmodel.model");
        const model = (0, _3mf_export_1.to3dmodel)(to3mf);
        const files = {};
        files["3D/3dmodel.model"] = (0, fflate_1.strToU8)(model);
        files[_3mf_export_1.fileForContentTypes.name] = (0, fflate_1.strToU8)(_3mf_export_1.fileForContentTypes.content);
        files[fileForRelThumbnail.name] = (0, fflate_1.strToU8)(fileForRelThumbnail.content);
        const zipFile = (0, fflate_1.zipSync)(files);
        const blob3MF = new Blob([zipFile], {
            type: "application/vnd.ms-package.3dmanufacturing-3dmodel+xml",
        });
        self.postMessage({
            glbURL: URL.createObjectURL(blobGLB),
            threeMFURL: URL.createObjectURL(blob3MF),
        });
    });
}
