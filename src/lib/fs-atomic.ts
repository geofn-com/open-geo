import fs from "node:fs/promises";
import path from "node:path";

export class FileExistsError extends Error {
  constructor(public readonly filePath: string) {
    super(`File "${filePath}" already exists. Use -f, --force to overwrite.`);
    this.name = "FileExistsError";
  }
}

export interface SafeAtomicWriteOptions {
  /**
   * If true, allows overwriting an existing destination file.
   * If false or omitted, throws FileExistsError if destination exists.
   */
  force?: boolean;
}

/**
 * Safely and atomically writes content to the target file.
 * 
 * 1. Checks if targetPath exists. Throws FileExistsError if it exists and !options.force.
 * 2. Writes content to an ephemeral temporary file in the same directory.
 * 3. Atomically renames the temporary file to targetPath on success.
 * 4. Ensures the temporary file is deleted if any error occurs mid-flight.
 */
export async function safeAtomicWrite(
  targetPath: string,
  content: string,
  options?: SafeAtomicWriteOptions
): Promise<void> {
  const resolvedPath = path.resolve(targetPath);
  const parentDir = path.dirname(resolvedPath);

  // 1. Check if destination file already exists
  let fileExists = false;
  try {
    await fs.access(resolvedPath);
    fileExists = true;
  } catch {
    fileExists = false;
  }

  if (fileExists && !options?.force) {
    throw new FileExistsError(targetPath);
  }

  // 2. Ensure parent directory exists
  await fs.mkdir(parentDir, { recursive: true });

  // 3. Create unique temporary file path in the same directory (guarantees same filesystem for atomic rename)
  const baseName = path.basename(resolvedPath);
  const tempFileName = `.${baseName}.tmp.${Date.now()}.${Math.random().toString(36).slice(2, 8)}`;
  const tempFilePath = path.join(parentDir, tempFileName);

  try {
    // 4. Write data to temporary file
    await fs.writeFile(tempFilePath, content, "utf-8");

    // 5. Atomically replace the destination file
    await fs.rename(tempFilePath, resolvedPath);
  } catch (err) {
    // 6. Best-effort cleanup of temporary file on error
    try {
      await fs.unlink(tempFilePath);
    } catch {
      // Ignore cleanup error if file was never created
    }
    throw err;
  }
}
