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
exports.loadTSModuleOnChange = void 0;
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const workingDir = process.cwd();
/**
 * Load the module and return the default export
 * plus a cleanup function.
 *
 * Why do we need all this shenanigans?
 * 1. We need ts-import to compile the module which we expect to be in Typescript
 * 2. We need to do the name mangling to avoid caching issues. See: https://stackoverflow.com/questions/76327099/how-to-clear-module-cache-and-import-a-module-for-hot-reloading-in-typescript-in
 *
 * TODO: find a better way to deal with hot reloading
 */
const loadTSModuleOnChange = (tsImport, fullPath) => __awaiter(void 0, void 0, void 0, function* () {
    yield tsImport.load(fullPath, {
        mode: tsImport.LoadMode.Compile,
        useCache: false,
    });
    const basename = path_1.default.basename(fullPath);
    const basenameMJS = basename.replace(".ts", ".mjs");
    // Where did ts-import put the file?
    const outputFilePath = path_1.default.join(".cache", "ts-import", workingDir, basenameMJS);
    // Read the file
    const outputFileContent = fs_1.default.readFileSync(outputFilePath, "utf-8");
    // Copy the file to a new location with a random name
    const randomName = Math.random().toString(36).substring(7);
    const freshFileName = `${randomName}.mjs`;
    const freshFilePath = path_1.default.join(workingDir, freshFileName);
    fs_1.default.writeFileSync(freshFilePath, outputFileContent);
    // Import the file with the random name
    const _dynamicImportUserModule = Function(`return import("${freshFilePath}")`);
    const freshModule = yield _dynamicImportUserModule();
    return {
        default: freshModule.default,
        cleanup: () => {
            if (fs_1.default.existsSync(freshFilePath)) {
                // remove the file
                fs_1.default.unlinkSync(freshFilePath);
            }
        },
    };
});
exports.loadTSModuleOnChange = loadTSModuleOnChange;
