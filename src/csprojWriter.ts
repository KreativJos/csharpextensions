import * as path from 'path';
import * as util from 'util';
import { promises as fs } from 'fs';

const findUpGlob = require('find-up-glob');
const xml2js = require("xml2js");

export enum BuildActions {
    Folder = 'Folder',
    Compile = 'Compile',
    Content = 'Content',
    EmbeddedResource = 'EmbeddedResource',
    PRIResource = 'PRIResource',
    Page = 'Page',
    None = 'None',
}

export class CsProjWriter {
    public async getProjFilePath(filePath: string): Promise<string | undefined> {
        const projItems: string[] = await findUpGlob('*.projitems', { cwd: path.dirname(filePath) });
        const csProj: string[] = await findUpGlob('*.csproj', { cwd: path.dirname(filePath) });

        if (projItems !== null && projItems.length >= 1) return projItems[0];
        else if (csProj !== null && csProj.length >= 1) return csProj[0];

        return undefined;
    }

    public async add(projPath: string, itemPaths: string[], itemType: BuildActions) {
        var paths: Array<string> = [];

        for (let itemPath of itemPaths) {
            let path = this.fixItemPath(projPath, itemPath);
            paths.push(path);

            let buildAction = await this.get(projPath, path);
            if (buildAction !== undefined) await this.remove(projPath, path);
        }

        let parsedXml = await this.parseProjFile(projPath);
        if (parsedXml === undefined) return;

        let items: Array<Object> = Object(parsedXml).Project.ItemGroup;

        const obj = function (includePath: string) {
            return {
                [itemType]: {
                    $: {
                        'Include': includePath
                    }
                }
            };
        };

        for (let includePath of paths) {
            var item = obj(includePath);
            var itemGroup = this.getItemGroupByPath(items, includePath);

            if (itemType === BuildActions.Compile && includePath.endsWith('.xaml.cs')) {
                let pagePath = includePath.replace('.cs', '');
                let pageBuildAction = await this.get(projPath, pagePath);

                if (pageBuildAction === BuildActions.Page) Object(item[itemType]).DependentUpon = path.basename(pagePath);
            } else if (itemType === BuildActions.Page) {
                Object(item[itemType]).SubType = 'Designer';
                Object(item[itemType]).Generator = 'MSBuild:Compile';
            }

            if (itemGroup != undefined) {
                var actions: Array<Object> | undefined = Object(itemGroup)[itemType];
                if (actions == undefined) {
                    var array: Array<Object> = [];
                    array[0] = item[itemType];
                    Object(itemGroup)[itemType] = array;
                } else {
                    actions.push(Object(item[itemType]));
                }
            } else {
                var array: Array<Object> = [];
                array[0] = item[itemType];
                items.push({ [itemType]: array });
            }
        }

        await fs.writeFile(projPath, new xml2js.Builder().buildObject(parsedXml));
    }

    public async get(projPath: string, itemPath: string): Promise<BuildActions | undefined> {
        itemPath = this.fixItemPath(projPath, itemPath);

        let parsedXml = await this.parseProjFile(projPath);
        if (parsedXml === undefined) return;

        let items: Array<Object> = Object(parsedXml).Project.ItemGroup;

        for (let item of items) {
            let actions: Array<Object> = Object.keys(item).map(key => Object(item)[key])[0];
            for (let action of actions) {
                if (Object(action)["$"].Include === itemPath) return BuildActions[Object.getOwnPropertyNames(item)[0] as keyof typeof BuildActions];
            }
        }

        return undefined;
    }

    public async remove(projPath: string, itemPath: string) {
        let isDir = false;
        try {
            let fileStat = await fs.lstat(itemPath);
            isDir = fileStat.isDirectory();
        } catch { }

        itemPath = this.fixItemPath(projPath, itemPath);

        let parsedXml = await this.parseProjFile(projPath);
        if (parsedXml === undefined) return;

        let items: Array<Object> = Object(parsedXml).Project.ItemGroup;

        for (let item of items) {
            let actionsArray: Array<Array<Object>> = Object.keys(item).map(key => Object(item)[key]);
            
            for (let index = 0; index < actionsArray.length; index++) {
                let actions = actionsArray[index];
                for (let action = 0; action < actions.length; action++) {
                    let include: string = Object(actions[action])["$"].Include;
                    if (include === itemPath || (isDir && include.startsWith(itemPath))) {
                        actions.splice(action, 1);
                    }
                }

                if (actions.length === 0) actionsArray.splice(actionsArray.indexOf(actions), 1);
            }

            if (actionsArray.length === 0) items.splice(items.indexOf(item), 1);
        }

        await fs.writeFile(projPath, new xml2js.Builder().buildObject(parsedXml));
    }

    public async rename(projPath: string, oldItemPath: string, newItemPath: string) {
        let isDir = false;
        try {
            let fileStat = await fs.lstat(oldItemPath);
            isDir = fileStat.isDirectory();
        } catch { }

        oldItemPath = this.fixItemPath(projPath, oldItemPath);
        newItemPath = this.fixItemPath(projPath, newItemPath);

        let parsedXml = await this.parseProjFile(projPath);
        if (parsedXml === undefined) return;

        let items: Array<Object> = Object(parsedXml).Project.ItemGroup;

        for (let item of items) {
            let actionsArray: Array<Array<Object>> = Object.keys(item).map(key => Object(item)[key]);

            for (let index = 0; index < actionsArray.length; index++) {
                let actions = actionsArray[index];
                for (let action = 0; action < actions.length; action++) {
                    let include: string = Object(actions[action])["$"].Include;
                    if (include === oldItemPath) {
                        Object(actions[action])["$"].Include = newItemPath;
                    } else if (isDir && include.startsWith(oldItemPath)) {
                        Object(actions[action])["$"].Include = include.replace(oldItemPath, newItemPath);
                    }
                }
            }
        }

        await fs.writeFile(projPath, new xml2js.Builder().buildObject(parsedXml));
    }

    private async parseProjFile(projPath: string): Promise<Object | undefined> {
        const xml = await fs.readFile(projPath, 'utf8');
        const xmlParser = util.promisify(new xml2js.Parser().parseString);

        let parsedXml = await xmlParser(xml);
        if (parsedXml === undefined || parsedXml.Project === undefined) return undefined;

        return parsedXml;
    }

    private getItemGroupByPath(itemGroups: Array<Object>, itemPath: string): Object | undefined {
        for (let item of itemGroups) {
            let actionsArray: Array<Array<Object>> = Object.keys(item).map(key => Object(item)[key]);

            for (let index = 0; index < actionsArray.length; index++) {
                let actions = actionsArray[index];
                for (let action = 0; action < actions.length; action++) {
                    let include: string = Object(actions[action])["$"].Include;
                    if (path.dirname(include) === path.dirname(itemPath)) {
                        return Object(item);
                    }
                }
            }
        }

        return undefined;
    }

    private fixItemPath(projPath: string, itemPath: string): string {
        return itemPath.replace(path.dirname(projPath) + path.sep, path.extname(projPath) == '.projitems' ? "$(MSBuildThisFileDirectory)" : "");
    }
}