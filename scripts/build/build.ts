import { tsc } from "../tools/tsc";
import { getProjectRoot } from "../../src/bin/tools/getProjectRoot";
import { join as pathJoin, basename as pathBasename } from "path";
import * as fs from "fs";
import { getPatchedRawCssCodeForCompatWithRemixIcon, collectIcons } from "./icons";
import { cssToTs } from "./cssToTs";
import {
    pathOfPatchedRawCssCodeForCompatWithRemixIconRelativeToDsfrDist,
    pathOfIconsJson
} from "../../src/bin/only-include-used-icons";
import * as child_process from "child_process";
import { patchCssForMui } from "./patchCssForMui";
import yargsParser from "yargs-parser";

(async () => {
    const argv = yargsParser(process.argv.slice(2));

    const isPrePublish = argv["prePublish"] === true;

    const projectRootDirPath = getProjectRoot();

    const dsfrDirPath = pathJoin(projectRootDirPath, "dsfr");

    if (fs.existsSync(dsfrDirPath)) {
        fs.rmSync(dsfrDirPath, { "recursive": true, "force": true });
    }

    const nodeModuleDirPath = pathJoin(projectRootDirPath, "node_modules");

    fs.cpSync(pathJoin(nodeModuleDirPath, "@gouvfr", "dsfr", "dist"), dsfrDirPath, {
        "recursive": true
    });

    const rawDsfrCssCode = fs.readFileSync(pathJoin(dsfrDirPath, "dsfr.css")).toString("utf8");

    fs.writeFileSync(
        pathJoin(dsfrDirPath, pathOfPatchedRawCssCodeForCompatWithRemixIconRelativeToDsfrDist),
        Buffer.from(
            getPatchedRawCssCodeForCompatWithRemixIcon({
                "rawCssCode": rawDsfrCssCode
            }),
            "utf8"
        )
    );

    {
        const { rawDsfrCssCodePatchedForMui, rawDsfrCssCodePatchedForMuiMinified } = patchCssForMui(
            { rawDsfrCssCode }
        );

        (
            [
                [rawDsfrCssCodePatchedForMui, ".css"],
                [rawDsfrCssCodePatchedForMuiMinified, ".min.css"]
            ] as const
        ).forEach(([rawCssCode, ext]) =>
            fs.writeFileSync(pathJoin(dsfrDirPath, `dsfr${ext}`), Buffer.from(rawCssCode, "utf8"))
        );
    }

    const icons = await collectIcons({
        "remixiconDirPath": pathJoin(nodeModuleDirPath, "remixicon"),
        "iconsCssRawCode": fs
            .readFileSync(pathJoin(dsfrDirPath, "utility", "icons", "icons.css"))
            .toString("utf8")
    });

    fs.writeFileSync(
        pathJoin(dsfrDirPath, pathOfIconsJson),
        Buffer.from(JSON.stringify(icons, null, 2), "utf8")
    );

    const distDirPath = pathJoin(projectRootDirPath, "dist");

    if (fs.existsSync(distDirPath)) {
        fs.rmSync(distDirPath, { "recursive": true, "force": true });
    }

    cssToTs({
        icons,
        "generatedDirPath": pathJoin(projectRootDirPath, "src", "fr", "generatedFromCss"),
        rawDsfrCssCode
    });

    await tsc({
        "tsconfigDirPath": pathJoin(projectRootDirPath, "src", "bin"),
        "doWatch": false
    });

    Object.entries<string>(
        JSON.parse(fs.readFileSync(pathJoin(getProjectRoot(), "package.json")).toString("utf8"))[
            "bin"
        ]
    ).forEach(([, scriptPath]) =>
        child_process.execSync(`chmod +x ${scriptPath}`, {
            "cwd": getProjectRoot()
        })
    );

    await tsc({
        "tsconfigDirPath": pathJoin(projectRootDirPath, "src"),
        "doWatch": false
    });

    {
        const assertSrcDirPath = pathJoin(projectRootDirPath, "src", "assets");

        fs.cpSync(
            assertSrcDirPath,
            pathJoin(
                projectRootDirPath,
                JSON.parse(
                    fs.readFileSync(pathJoin(projectRootDirPath, "tsproject.json")).toString("utf8")
                )["compilerOptions"]["outDir"],
                pathBasename(assertSrcDirPath)
            ),
            { "recursive": true }
        );
    }

    //NOTE: From here it's only for local linking, required for storybook and running integration apps.

    local_testing: {
        if (isPrePublish) {
            break local_testing;
        }

        fs.writeFileSync(
            pathJoin(distDirPath, "package.json"),
            Buffer.from(
                JSON.stringify(
                    (() => {
                        const packageJsonParsed = JSON.parse(
                            fs
                                .readFileSync(pathJoin(projectRootDirPath, "package.json"))
                                .toString("utf8")
                        );

                        return {
                            ...packageJsonParsed,
                            "main": packageJsonParsed["main"].replace(/^dist\//, ""),
                            "types": packageJsonParsed["types"].replace(/^dist\//, ""),
                            "module": packageJsonParsed["module"].replace(/^dist\//, "")
                        };
                    })(),
                    null,
                    2
                ),
                "utf8"
            )
        );

        fs.cpSync(dsfrDirPath, pathJoin(distDirPath, "dsfr"), { "recursive": true });
        fs.rmSync(dsfrDirPath, { "recursive": true });
        fs.cpSync(pathJoin(projectRootDirPath, "src"), pathJoin(distDirPath, "src"), {
            "recursive": true
        });
    }
})();
