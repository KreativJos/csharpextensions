import * as vscode from 'vscode';
import * as path from 'path';
import { EOL } from 'os';
import { promises as fs } from 'fs';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector from './namespaceDetector';

export function activate(context: vscode.ExtensionContext) {
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createClass', createClass));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createInterface', createInterface));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createEnum', createEnum));

    const codeActionProvider = new CodeActionProvider();
    const disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);
}

async function createClass(args: any) {
    await promptAndSave(args, 'class');
}

async function createInterface(args: any) {
    await promptAndSave(args, 'interface');
}

async function createEnum(args: any) {
    await promptAndSave(args, 'enum');
}

async function promptAndSave(args: any, templatetype: string) {
    if (args == null) {
        args = { _fsPath: vscode.workspace.rootPath }
    }

    const incomingpath: string = args._fsPath || args.fsPath || args.path;

    try {
        const newfilename = await vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter filename', value: 'new' + templatetype + '.cs' });

        if (typeof newfilename === 'undefined' || newfilename === '') return;

        let newfilepath = incomingpath + path.sep + newfilename;

        newfilepath = correctExtension(newfilepath);

        try {
            await fs.access(newfilepath);

            vscode.window.showErrorMessage(`File already exists: ${EOL}${newfilepath}`);
            return;
        } catch { }

        const namespaceDetector = new NamespaceDetector(newfilepath);
        const namespace = await namespaceDetector.getNamespace();
        const typename = path.basename(newfilepath, '.cs');

        await openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
    } catch (errOnInput) {
        console.error('Error on input', errOnInput);

        vscode.window.showErrorMessage('Error on input. See extensions log for more info');
    };
}

function correctExtension(filename: string) {
    if (path.extname(filename) !== '.cs') {
        if (filename.endsWith('.')) filename = filename + 'cs';
        else filename = filename + '.cs';
    }

    return filename;
}

async function openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
    const templatefileName = type + '.tmpl';
    const extension = vscode.extensions.getExtension('kreativ-software.csharpextensions');

    if (!extension) {
        vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');
        return;
    }

    const templateFilePath = path.join(extension.extensionPath, 'templates', templatefileName);

    try {
        const doc = await vscode.workspace.openTextDocument(templateFilePath);

        let text = doc.getText()
            .replace('${namespace}', namespace)
            .replace('${classname}', filename);

        const cursorPosition = findCursorInTemplate(text);

        text = text.replace('${cursor}', '');

        await fs.writeFile(originalfilepath, text);

        const openedDoc = await vscode.workspace.openTextDocument(originalfilepath)
        const editor = await vscode.window.showTextDocument(openedDoc);

        if (cursorPosition != null) {
            const newselection = new vscode.Selection(cursorPosition, cursorPosition);

            editor.selection = newselection;
        }
    } catch (errTryingToCreate) {
        const errorMessage = `Error trying to create file '${originalfilepath}' from template '${templatefileName}'`;

        console.error(errorMessage, errTryingToCreate);

        vscode.window.showErrorMessage(errorMessage);
    }
}

function findCursorInTemplate(text: string): vscode.Position | null {
    const cursorPos = text.indexOf('${cursor}');
    const preCursor = text.substr(0, cursorPos);
    const matchesForPreCursor = preCursor.match(/\n/gi);

    if (matchesForPreCursor === null) return null;

    const lineNum = matchesForPreCursor.length;
    const charNum = preCursor.substr(preCursor.lastIndexOf('\n')).length;

    return new vscode.Position(lineNum, charNum);
}

export function deactivate() { }
