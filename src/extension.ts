import * as vscode from 'vscode';
import * as path from 'path';
import * as fs from 'fs';
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

    let disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(disposable);
}

function createClass(args: any) {
    promptAndSave(args, 'class');
}

function createInterface(args: any) {
    promptAndSave(args, 'interface');
}

function createEnum(args: any) {
    promptAndSave(args, 'enum');
}

function promptAndSave(args: any, templatetype: string) {
    if (args == null) {
        args = { _fsPath: vscode.workspace.rootPath }
    }
    let incomingpath: string = args._fsPath;

    vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter filename', value: 'new' + templatetype + '.cs' })
        .then(async newfilename => {
            if (typeof newfilename === 'undefined') return;

            let newfilepath = incomingpath + path.sep + newfilename;

            if (fs.existsSync(newfilepath)) {
                vscode.window.showErrorMessage("File already exists");
                return;
            }

            newfilepath = correctExtension(newfilepath);

            const namespaceDetector = new NamespaceDetector(newfilepath);
            const namespace = await namespaceDetector.getNamespace();
            const typename = path.basename(newfilepath, '.cs');

            openTemplateAndSaveNewFile(templatetype, namespace, typename, newfilepath);
        }, errOnInput => {
            console.error('Error on input', errOnInput);

            vscode.window.showErrorMessage('Error on input. See extensions log for more info');
        });
}

function correctExtension(filename: string) {
    if (path.extname(filename) !== '.cs') {
        if (filename.endsWith('.')) filename = filename + 'cs';
        else filename = filename + '.cs';
    }

    return filename;
}

function openTemplateAndSaveNewFile(type: string, namespace: string, filename: string, originalfilepath: string) {
    const templatefileName = type + '.tmpl';
    const extension = vscode.extensions.getExtension('kreativ-software.csharpextensions');

    if (!extension) {
        vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');
        return;
    }

    const templateFilePath = path.join(extension.extensionPath, 'templates', templatefileName);

    vscode.workspace.openTextDocument(templateFilePath)
        .then(doc => {
            let text = doc.getText()
                .replace('${namespace}', namespace)
                .replace('${classname}', filename);

            const cursorPosition = findCursorInTemplate(text);

            text = text.replace('${cursor}', '');

            fs.writeFileSync(originalfilepath, text);

            vscode.workspace.openTextDocument(originalfilepath).then(doc => {
                vscode.window.showTextDocument(doc).then(editor => {
                    if (cursorPosition != null) {
                        const newselection = new vscode.Selection(cursorPosition, cursorPosition);

                        editor.selection = newselection;
                    }
                });
            });
        }, errTryingToCreate => {
            const errorMessage = `Error trying to create file '${originalfilepath}' from template '${templatefileName}'`;

            console.error(errorMessage, errTryingToCreate);

            vscode.window.showErrorMessage(errorMessage);
        });
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
