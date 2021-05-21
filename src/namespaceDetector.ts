import { Uri, workspace } from 'vscode';
import * as path from 'path';
import CsprojReader from './csprojReader';
import ProjectJsonReader from './projectJsonReader';
const findupglob = require('find-up-glob');

export default class NamespaceDetector {
    private readonly filePath: string;

    constructor(filePath: string) {
        this.filePath = filePath;
    }

    public async getNamespace(): Promise<string> {
        let fullNamespace = await this.fromCsproj();
        if (fullNamespace !== undefined) {
            return fullNamespace;
        }

        fullNamespace = await this.fromProjectJson();
        if (fullNamespace !== undefined) {
            return fullNamespace;
        }

        return await this.fromFilepath();
    }

    private async fromCsproj(): Promise<string | undefined> {
        const csprojs: string[] = await findupglob('*.csproj', { cwd: path.dirname(this.filePath) });

        if (csprojs === null || csprojs.length < 1) {
            return undefined;
        }

        const csprojFile = csprojs[0];
        const fileContent = await this.read(Uri.file(csprojFile));
        const projectReader = new CsprojReader(fileContent);
        const rootNamespace = await projectReader.getRootNamespace();

        if (rootNamespace === undefined) {
            return undefined;
        }

        return this.calculateFullNamespace(rootNamespace, path.dirname(csprojFile));
    }

    private async fromProjectJson(): Promise<string | undefined> {
        const jsonFiles: string[] = await findupglob('project.json', { cwd: path.dirname(this.filePath) });
        
        if (jsonFiles === null || jsonFiles.length < 1) {
            return undefined;
        }

        const projectJsonFile = jsonFiles[0];
        const projectJsonDir = path.dirname(projectJsonFile);
        const fileContent = await this.read(Uri.file(projectJsonFile));
        const projectReader = new ProjectJsonReader(fileContent);
        const rootNamespace = await projectReader.getRootNamespace();

        if (rootNamespace === undefined) {
            return undefined;
        }

        return this.calculateFullNamespace(rootNamespace, projectJsonDir);
    }

    private async getRootPath(): Promise<string> {
        const csprojs: string[] = await findupglob('*.csproj', { cwd: path.dirname(this.filePath) });

        if (csprojs !== null && csprojs.length >= 1) {
            const csprojSplit = csprojs[0].split(path.sep);

            return csprojSplit.slice(0, csprojSplit.length - 2).join(path.sep);
        }

        const jsonFiles: string[] = await findupglob('project.json', { cwd: path.dirname(this.filePath) });

        if (jsonFiles !== null && jsonFiles.length >= 1) {
            const jsonSplit = jsonFiles[0].split(path.sep);

            return jsonSplit.slice(0, jsonSplit.length - 2).join(path.sep);
        }

        return workspace.workspaceFolders && workspace.workspaceFolders.length ? workspace.workspaceFolders[0].uri.fsPath : '';
    }

    private async fromFilepath(): Promise<string> {
        const rootPath = await this.getRootPath();
        const namespaceWithLeadingDot = this.calculateFullNamespace('', rootPath)

        return namespaceWithLeadingDot.slice(1);
    }

    private async read(file: Uri): Promise<string> {
        const document = await workspace.openTextDocument(file);
        return document.getText();
    }

    private calculateFullNamespace(rootNamespace: string, rootDirectory: string): string {
        const filePathSegments: string[] = path.dirname(this.filePath).split(path.sep);
        const rootDirSegments: string[] = rootDirectory.split(path.sep);
        let fullNamespace = rootNamespace;
        for (let index = rootDirSegments.length; index < filePathSegments.length; index++) {
            fullNamespace += "." + filePathSegments[index];
        }
        return fullNamespace
    }
}
