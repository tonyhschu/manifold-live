import fs from "fs";
import path from "path";

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
export const loadTSModuleOnChange = async (
  tsImport: typeof import("ts-import"),
  fullPath: string
) => {
  await tsImport.load(fullPath, {
    mode: tsImport.LoadMode.Compile,
    useCache: false,
  });

  // Where did ts-import put the file?
  const outputFilePath = path.join(
    ".cache",
    "ts-import",
    workingDir,
    "simpleCube.mjs"
  );

  // Read the file
  const outputFileContent = fs.readFileSync(outputFilePath, "utf-8");

  // Copy the file to a new location with a random name
  const randomName = Math.random().toString(36).substring(7);
  const freshFileName = `${randomName}.mjs`;
  const freshFilePath = path.join(workingDir, freshFileName);
  fs.writeFileSync(freshFilePath, outputFileContent);

  // Import the file with the random name
  const _dynamicImportUserModule = Function(
    `return import("${freshFilePath}")`
  );

  const freshModule = await _dynamicImportUserModule();

  return {
    default: freshModule.default,
    cleanup: () => {
      if (fs.existsSync(freshFilePath)) {
        // remove the file
        fs.unlinkSync(freshFilePath);
      }
    },
  };
};
