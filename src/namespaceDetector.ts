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

        return this.fromFilepath();
    }

    private async fromCsproj(): Promise<string | undefined> {
        const csprojs: string[] = await findupglob('*.csproj', { cwd: path.dirname(this.filePath) });
        if (csprojs === null || csprojs.length < 1) {
            return undefined;
        }

        const csprojFile = csprojs[0];
        const fileContent = await this.read(Uri.file(csprojFile));
        const rootNamespace = new CsprojReader(fileContent).getRootNamespace();
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
        const rootNamespace = new ProjectJsonReader(fileContent).getRootNamespace();
        if (rootNamespace === undefined) {
            return undefined;
        }

        return this.calculateFullNamespace(rootNamespace, projectJsonDir);
    }

    private fromFilepath(): string {
        const rootPath = workspace.workspaceFolders && workspace.workspaceFolders.length ? workspace.workspaceFolders[0].uri.fsPath : '';
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
