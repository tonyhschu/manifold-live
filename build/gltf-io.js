"use strict";
// Copyright 2023 The Manifold Authors.
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
var __awaiter = (this && this.__awaiter) || function (thisArg, _arguments, P, generator) {
    function adopt(value) { return value instanceof P ? value : new P(function (resolve) { resolve(value); }); }
    return new (P || (P = Promise))(function (resolve, reject) {
        function fulfilled(value) { try { step(generator.next(value)); } catch (e) { reject(e); } }
        function rejected(value) { try { step(generator["throw"](value)); } catch (e) { reject(e); } }
        function step(result) { result.done ? resolve(result.value) : adopt(result.value).then(fulfilled, rejected); }
        step((generator = generator.apply(thisArg, _arguments || [])).next());
    });
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.loadTexture = exports.disposeMesh = exports.writeMesh = exports.readMesh = exports.setupIO = exports.attributeDefs = void 0;
const core_1 = require("@gltf-transform/core");
const manifold_gltf_1 = require("./manifold-gltf");
exports.attributeDefs = {
    POSITION: { type: core_1.Accessor.Type.VEC3, components: 3 },
    NORMAL: { type: core_1.Accessor.Type.VEC3, components: 3 },
    TANGENT: { type: core_1.Accessor.Type.VEC4, components: 4 },
    TEXCOORD_0: { type: core_1.Accessor.Type.VEC2, components: 2 },
    TEXCOORD_1: { type: core_1.Accessor.Type.VEC2, components: 2 },
    COLOR_0: { type: core_1.Accessor.Type.VEC3, components: 3 },
    JOINTS_0: { type: core_1.Accessor.Type.VEC4, components: 4 },
    WEIGHTS_0: { type: core_1.Accessor.Type.VEC4, components: 4 },
    SKIP_1: { type: null, components: 1 },
    SKIP_2: { type: null, components: 2 },
    SKIP_3: { type: null, components: 3 },
    SKIP_4: { type: null, components: 4 },
};
/**
 * Call this first to register the manifold extension so that readMesh and
 * writeMesh will work.
 */
function setupIO(io) {
    return io.registerExtensions([manifold_gltf_1.EXTManifold]);
}
exports.setupIO = setupIO;
/**
 * Read an input mesh into Manifold-compatible data structures, whether it
 * contains the EXT_mesh_manifold extension or not.
 *
 * @param mesh The Mesh to read.
 * @param attributes An array of attributes representing the order of desired
 *     properties returned in the vertProperties array of the output mesh. If
 *     omitted, this will be populated with the union of all attributes defined
 *     in the primitives of the input mesh. If present, the first entry must be
 *     'POSITION', and any attributes in the primitives that are not included in
 *     this list will be ignored, while those in the list but not defined in a
 *     primitive will be populated with zeros.
 * @returns The returned mesh is suitable for initializing a Manifold or Mesh of
 *     the Manifold library if desired. See Manifold documentation if you prefer
 *     to use these GL arrays in a different library. The runProperties array
 *     gives the Material and attributes list associated with each triangle run,
 *     which in turn corresponds to a primitive of the input mesh. These
 *     attributes are the intersection of the attributes present on the
 *     primitive and those requested in the attributes input.
 */
function readMesh(mesh, attributes = []) {
    var _a, _b, _c, _d;
    const primitives = mesh.listPrimitives();
    if (primitives.length === 0) {
        return null;
    }
    if (attributes.length === 0) {
        const attributeSet = new Set();
        for (const primitive of primitives) {
            const semantics = primitive.listSemantics();
            for (const semantic of semantics) {
                attributeSet.add(semantic);
            }
        }
        let semantic;
        for (semantic in exports.attributeDefs) {
            if (attributeSet.has(semantic)) {
                attributes.push(semantic);
                attributeSet.delete(semantic);
            }
        }
        for (const semantic of attributeSet.keys()) {
            attributes.push(semantic);
        }
    }
    if (attributes.length < 1 || attributes[0] !== "POSITION")
        throw new Error('First attribute must be "POSITION".');
    let numProp = 0;
    const attributeOffsets = attributes.map(((numProp = 0),
        (def) => {
            const last = numProp;
            numProp += exports.attributeDefs[def].components;
            return last;
        }));
    const manifoldPrimitive = mesh.getExtension("EXT_mesh_manifold");
    let vertPropArray = [];
    let triVertArray = [];
    const runIndexArray = [0];
    const mergeFromVertArray = [];
    const mergeToVertArray = [];
    const runProperties = [];
    if (manifoldPrimitive != null) {
        const numVert = primitives[0].getAttribute("POSITION").getCount();
        const foundAttribute = attributes.map((a) => exports.attributeDefs[a].type == null);
        vertPropArray = new Array(numProp * numVert);
        for (const primitive of primitives) {
            const indices = primitive.getIndices();
            if (!indices) {
                console.log("Skipping non-indexed primitive ", primitive.getName());
                continue;
            }
            const attributesIn = primitive.listSemantics();
            attributes.forEach((attributeOut, idx) => {
                if (foundAttribute[idx]) {
                    return;
                }
                for (const attributeIn of attributesIn) {
                    if (attributeIn === attributeOut) {
                        foundAttribute[idx] = true;
                        const accessor = primitive.getAttribute(attributeIn);
                        writeProperties(vertPropArray, accessor, numProp, attributeOffsets[idx]);
                    }
                }
            });
            triVertArray = [...triVertArray, ...indices.getArray()];
            runIndexArray.push(triVertArray.length);
            runProperties.push({
                material: primitive.getMaterial(),
                attributes: attributesIn.filter((b) => attributes.some((a) => a == b)),
            });
        }
        const mergeTriVert = (_b = (_a = manifoldPrimitive.getMergeIndices()) === null || _a === void 0 ? void 0 : _a.getArray()) !== null && _b !== void 0 ? _b : [];
        const mergeTo = (_d = (_c = manifoldPrimitive.getMergeValues()) === null || _c === void 0 ? void 0 : _c.getArray()) !== null && _d !== void 0 ? _d : [];
        const vert2merge = new Map();
        for (const [i, idx] of mergeTriVert.entries()) {
            vert2merge.set(triVertArray[idx], mergeTo[i]);
        }
        for (const [from, to] of vert2merge.entries()) {
            mergeFromVertArray.push(from);
            mergeToVertArray.push(to);
        }
    }
    else {
        for (const primitive of primitives) {
            const indices = primitive.getIndices();
            if (!indices) {
                console.log("Skipping non-indexed primitive ", primitive.getName());
                continue;
            }
            const numVert = vertPropArray.length / numProp;
            vertPropArray = [
                ...vertPropArray,
                ...readPrimitive(primitive, numProp, attributes),
            ];
            triVertArray = [
                ...triVertArray,
                ...indices.getArray().map((i) => i + numVert),
            ];
            runIndexArray.push(triVertArray.length);
            const attributesIn = primitive.listSemantics();
            runProperties.push({
                material: primitive.getMaterial(),
                attributes: attributesIn.filter((b) => attributes.some((a) => a == b)),
            });
        }
    }
    const vertProperties = new Float32Array(vertPropArray);
    const triVerts = new Uint32Array(triVertArray);
    const runIndex = new Uint32Array(runIndexArray);
    const mergeFromVert = new Uint32Array(mergeFromVertArray);
    const mergeToVert = new Uint32Array(mergeToVertArray);
    const meshOut = {
        numProp,
        triVerts,
        vertProperties,
        runIndex,
        mergeFromVert,
        mergeToVert,
    };
    return { mesh: meshOut, runProperties };
}
exports.readMesh = readMesh;
/**
 * Write a Manifold Mesh into a glTF Mesh object, using the EXT_mesh_manifold
 * extension to allow for lossless roundtrip of the manifold mesh through the
 * glTF file.
 *
 * @param doc The glTF Document to which this Mesh will be added.
 * @param manifoldMesh The Manifold Mesh to convert to glTF.
 * @param id2properties A map from originalID to Properties that include the
 *     glTF Material and the set of attributes to output. All triangle runs with
 *     the same originalID will be combined into a single output primitive. Any
 *     originalIDs not found in the map will have the glTF default material and
 *     no attributes beyond 'POSITION'. Each attributes array must correspond to
 *     the manifoldMesh vertProperties, thus the first attribute must always be
 *     'POSITION'. Any properties that should not be output for a given
 *     primitive must use the 'SKIP_*' attributes.
 * @returns The glTF Mesh to add to the Document.
 */
function writeMesh(doc, manifoldMesh, id2properties) {
    if (doc.getRoot().listBuffers().length === 0) {
        doc.createBuffer();
    }
    const buffer = doc.getRoot().listBuffers()[0];
    const manifoldExtension = doc.createExtension(manifold_gltf_1.EXTManifold);
    const mesh = doc.createMesh();
    const runIndex = [];
    const attributeUnion = [];
    const primitive2attributes = new Map();
    const numRun = manifoldMesh.runIndex.length - 1;
    let lastID = -1;
    for (let run = 0; run < numRun; ++run) {
        const id = manifoldMesh.runOriginalID[run];
        if (id == lastID) {
            continue;
        }
        lastID = id;
        runIndex.push(manifoldMesh.runIndex[run]);
        const indices = doc
            .createAccessor("primitive indices of ID " + id)
            .setBuffer(buffer)
            .setType(core_1.Accessor.Type.SCALAR)
            .setArray(new Uint32Array(1));
        const primitive = doc.createPrimitive().setIndices(indices);
        const properties = id2properties.get(id);
        if (properties) {
            const { material, attributes } = properties;
            if (attributes.length < 1 || attributes[0] !== "POSITION")
                throw new Error('First attribute must be "POSITION".');
            primitive.setMaterial(material);
            primitive2attributes.set(primitive, attributes);
            properties.attributes.forEach((attribute, i) => {
                if (i >= attributeUnion.length) {
                    attributeUnion.push(attribute);
                }
                else {
                    const size = exports.attributeDefs[attribute].components;
                    const unionSize = exports.attributeDefs[attributeUnion[i]].components;
                    if (size != unionSize) {
                        throw new Error("Attribute sizes do not correspond: " +
                            attribute +
                            " and " +
                            attributeUnion[i]);
                    }
                    if (exports.attributeDefs[attributeUnion[i]].type == null) {
                        attributeUnion[i] = attribute;
                    }
                }
            });
        }
        else {
            primitive2attributes.set(primitive, ["POSITION"]);
        }
        mesh.addPrimitive(primitive);
    }
    runIndex.push(manifoldMesh.runIndex[numRun]);
    const numVert = manifoldMesh.numVert;
    const numProp = manifoldMesh.numProp;
    let offset = 0;
    attributeUnion.forEach((attribute, aIdx) => {
        const def = exports.attributeDefs[attribute];
        if (def == null)
            throw new Error(attribute + " is not a recognized attribute.");
        if (def.type == null) {
            ++offset;
            return;
        }
        const n = def.components;
        if (offset + n > numProp)
            throw new Error("Too many attribute channels.");
        const array = new Float32Array(n * numVert);
        for (let v = 0; v < numVert; ++v) {
            for (let i = 0; i < n; ++i) {
                let x = manifoldMesh.vertProperties[numProp * v + offset + i];
                if (attribute == "COLOR_0") {
                    x = Math.max(0, Math.min(1, x));
                }
                array[n * v + i] = x;
            }
        }
        const accessor = doc
            .createAccessor(attribute)
            .setBuffer(buffer)
            .setType(def.type)
            .setArray(array);
        for (const primitive of mesh.listPrimitives()) {
            const attributes = primitive2attributes.get(primitive);
            if (attributes.length > aIdx &&
                exports.attributeDefs[attributes[aIdx]].type != null) {
                primitive.setAttribute(attribute, accessor);
            }
        }
        offset += n;
    });
    const manifoldPrimitive = manifoldExtension.createManifoldPrimitive();
    mesh.setExtension("EXT_mesh_manifold", manifoldPrimitive);
    const indices = doc
        .createAccessor("manifold indices")
        .setBuffer(buffer)
        .setType(core_1.Accessor.Type.SCALAR)
        .setArray(manifoldMesh.triVerts);
    manifoldPrimitive.setIndices(indices);
    manifoldPrimitive.setRunIndex(runIndex);
    const vert2merge = [...Array(manifoldMesh.numVert).keys()];
    const ind = [];
    const val = [];
    if (manifoldMesh.mergeFromVert && manifoldMesh.mergeToVert) {
        for (const [i, from] of manifoldMesh.mergeFromVert.entries()) {
            vert2merge[from] = manifoldMesh.mergeToVert[i];
        }
        for (const [i, vert] of manifoldMesh.triVerts.entries()) {
            const newVert = vert2merge[vert];
            if (vert !== newVert) {
                ind.push(i);
                val.push(newVert);
            }
        }
    }
    if (ind.length > 0) {
        const indicesAccessor = doc
            .createAccessor("merge from")
            .setBuffer(buffer)
            .setType(core_1.Accessor.Type.SCALAR)
            .setArray(new Uint32Array(ind));
        const valuesAccessor = doc
            .createAccessor("merge to")
            .setBuffer(buffer)
            .setType(core_1.Accessor.Type.SCALAR)
            .setArray(new Uint32Array(val));
        manifoldPrimitive.setMerge(indicesAccessor, valuesAccessor);
    }
    return mesh;
}
exports.writeMesh = writeMesh;
/**
 * Helper function to dispose of a Mesh, useful when replacing an existing Mesh
 * with one from writeMesh.
 */
function disposeMesh(mesh) {
    var _a, _b, _c, _d;
    if (!mesh)
        return;
    const primitives = mesh.listPrimitives();
    for (const primitive of primitives) {
        (_a = primitive.getIndices()) === null || _a === void 0 ? void 0 : _a.dispose();
        for (const accessor of primitive.listAttributes()) {
            accessor.dispose();
        }
    }
    const manifoldPrimitive = mesh.getExtension("EXT_mesh_manifold");
    if (manifoldPrimitive) {
        (_b = manifoldPrimitive.getIndices()) === null || _b === void 0 ? void 0 : _b.dispose();
        (_c = manifoldPrimitive.getMergeIndices()) === null || _c === void 0 ? void 0 : _c.dispose();
        (_d = manifoldPrimitive.getMergeValues()) === null || _d === void 0 ? void 0 : _d.dispose();
    }
    mesh.dispose();
}
exports.disposeMesh = disposeMesh;
/**
 * Helper function to download an image and apply it to the given texture.
 *
 * @param texture The texture to update
 * @param uri The location of the image to download
 */
function loadTexture(texture, uri) {
    return __awaiter(this, void 0, void 0, function* () {
        const response = yield fetch(uri);
        const blob = yield response.blob();
        texture.setMimeType(blob.type);
        texture.setImage(new Uint8Array(yield blob.arrayBuffer()));
    });
}
exports.loadTexture = loadTexture;
function writeProperties(vertProperties, accessor, numProp, offset) {
    const array = accessor.getArray();
    const size = accessor.getElementSize();
    const numVert = accessor.getCount();
    for (let i = 0; i < numVert; ++i) {
        for (let j = 0; j < size; ++j) {
            vertProperties[numProp * i + offset + j] = array[i * size + j];
        }
    }
}
function readPrimitive(primitive, numProp, attributes) {
    const vertProperties = [];
    let offset = 0;
    for (const attribute of attributes) {
        const size = exports.attributeDefs[attribute].components;
        if (exports.attributeDefs[attribute].type == null) {
            offset += size;
            continue;
        }
        const accessor = primitive.getAttribute(attribute);
        if (accessor) {
            writeProperties(vertProperties, accessor, numProp, offset);
        }
        offset += size;
    }
    return vertProperties;
}
