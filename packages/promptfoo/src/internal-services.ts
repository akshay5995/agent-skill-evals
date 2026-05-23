import { constants } from "node:fs";
import * as PlatformFileSystem from "@effect/platform/FileSystem";
import * as NodeFileSystem from "@effect/platform-node/NodeFileSystem";
import * as Context from "effect/Context";
import * as Effect from "effect/Effect";
import * as Layer from "effect/Layer";
import { parse as parseYaml } from "yaml";

interface DirectoryEntry {
  name: string;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface FileInfo {
  mode: number;
  isDirectory(): boolean;
  isFile(): boolean;
}

interface FileSystemService {
  access(path: string, mode?: number): Effect.Effect<void, unknown>;
  copyDirectory(source: string, destination: string): Effect.Effect<void, unknown>;
  makeDirectory(path: string): Effect.Effect<void, unknown>;
  makeTempDirectory(prefix: string): Effect.Effect<string, unknown>;
  readFile(path: string): Effect.Effect<Buffer, unknown>;
  readText(path: string): Effect.Effect<string, unknown>;
  readDirectory(path: string): Effect.Effect<DirectoryEntry[], unknown>;
  stat(path: string): Effect.Effect<FileInfo, unknown>;
  writeText(path: string, contents: string): Effect.Effect<void, unknown>;
}

interface EnvironmentService {
  cwd: Effect.Effect<string>;
  env: Effect.Effect<NodeJS.ProcessEnv>;
}

interface YamlService {
  parse(input: string): Effect.Effect<unknown, unknown>;
}

export class FileSystem extends Context.Tag("agent-skill-evals/promptfoo/FileSystem")<
  FileSystem,
  FileSystemService
>() {}

export class Environment extends Context.Tag("agent-skill-evals/promptfoo/Environment")<
  Environment,
  EnvironmentService
>() {}

export class YamlParser extends Context.Tag("agent-skill-evals/promptfoo/YamlParser")<
  YamlParser,
  YamlService
>() {}

function toFileInfo(info: PlatformFileSystem.File.Info): FileInfo {
  return {
    mode: info.mode,
    isDirectory: () => info.type === "Directory",
    isFile: () => info.type === "File",
  };
}

function executableFromMode(mode: number): boolean {
  return (mode & 0o111) !== 0;
}

const PlatformBackedFileSystemLive = Layer.effect(
  FileSystem,
  Effect.gen(function* () {
    const fs = yield* PlatformFileSystem.FileSystem;

    const statFile = (path: string) => fs.stat(path).pipe(Effect.map(toFileInfo));

    return {
      access: (path: string, mode?: number) => {
        const readable = mode === undefined ? undefined : (mode & constants.R_OK) !== 0;
        const writable = mode === undefined ? undefined : (mode & constants.W_OK) !== 0;
        const executable = mode === undefined ? false : (mode & constants.X_OK) !== 0;
        const baseAccess = fs.access(path, {
          ok: true,
          readable,
          writable,
        });
        if (!executable) return baseAccess;
        return baseAccess.pipe(
          Effect.zipRight(statFile(path)),
          Effect.flatMap((info) =>
            executableFromMode(info.mode)
              ? Effect.void
              : Effect.fail(new Error(`Path is not executable: ${path}`)),
          ),
        );
      },
      copyDirectory: (source: string, destination: string) =>
        fs.copy(source, destination),
      makeDirectory: (path: string) => fs.makeDirectory(path, { recursive: true }),
      makeTempDirectory: (prefix: string) => fs.makeTempDirectory({ prefix }),
      readFile: (path: string) => fs.readFile(path).pipe(Effect.map(Buffer.from)),
      readText: (path: string) => fs.readFileString(path),
      readDirectory: (path: string) =>
        fs.readDirectory(path).pipe(
          Effect.flatMap((names) =>
            Effect.forEach(names, (name) =>
              fs.stat(`${path}/${name}`).pipe(
                Effect.map((info): DirectoryEntry => ({
                  name,
                  isDirectory: () => info.type === "Directory",
                  isFile: () => info.type === "File",
                })),
              ),
            ),
          ),
        ),
      stat: statFile,
      writeText: (path: string, contents: string) => fs.writeFileString(path, contents),
    };
  }),
);

export const NodeFileSystemLive = PlatformBackedFileSystemLive.pipe(
  Layer.provide(NodeFileSystem.layer),
);

export const NodeEnvironmentLive = Layer.succeed(Environment, {
  cwd: Effect.sync(() => process.cwd()),
  env: Effect.sync(() => ({ ...process.env })),
});

export const YamlParserLive = Layer.succeed(YamlParser, {
  parse: (input) =>
    Effect.try({
      try: () => parseYaml(input),
      catch: (error) => error,
    }),
});

export const NodeServicesLive = Layer.mergeAll(
  NodeFileSystemLive,
  NodeEnvironmentLive,
  YamlParserLive,
);

export function pathExists(path: string): Effect.Effect<boolean, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    return yield* fs.stat(path).pipe(
      Effect.as(true),
      Effect.catchAll(() => Effect.succeed(false)),
    );
  });
}

export function pathExecutable(path: string): Effect.Effect<boolean, never, FileSystem> {
  return Effect.gen(function* () {
    const fs = yield* FileSystem;
    return yield* fs.access(path, constants.X_OK).pipe(
      Effect.as(true),
      Effect.catchAll(() => Effect.succeed(false)),
    );
  });
}
