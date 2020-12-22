import * as vscode from 'vscode';
import * as path from 'path';
import { promises as fs } from 'fs';
import { CsProjWriter, BuildActions } from './csprojWriter';
import CodeActionProvider from './codeActionProvider';
import NamespaceDetector from './namespaceDetector';

export function activate(context: vscode.ExtensionContext) {
    const codeActionProvider = new CodeActionProvider();
    const documentSelector: vscode.DocumentSelector = {
        language: 'csharp',
        scheme: 'file'
    };

    let disposable = vscode.languages.registerCodeActionsProvider(documentSelector, codeActionProvider);

    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.createFile', createFile));
    context.subscriptions.push(vscode.commands.registerCommand('csharpextensions.changeBuildAction', change));
    context.subscriptions.push(disposable);

    var stackedFiles: vscode.Uri[] = [];
    var timeLeft: number;
    var timer: NodeJS.Timeout;

    function fileStack(file: vscode.Uri) {
        stackedFiles.push(file);
        timeLeft = 100;
        clearInterval(timer);
        timer = setInterval(async () => {
            if (timeLeft <= 0) {
                clearInterval(timer);
                await onCreateFiles({ files: stackedFiles });
                stackedFiles = [];
            }
            timeLeft -= 1;
        }, 10);
    }

    var watcher = vscode.workspace.createFileSystemWatcher("**");
    watcher.onDidCreate(event => {
        fileStack(event);
    });
    //vscode.workspace.onDidCreateFiles(onCreateFiles);
    vscode.workspace.onDidDeleteFiles(onDeleteFiles);
    vscode.workspace.onDidRenameFiles(onRenameFiles);
}

async function onCreateFiles(event: vscode.FileCreateEvent) {
    const csproj = new CsProjWriter();
    let files: string[] = [];
    let projs: string[] = [];

    for (var i = 0; i < event.files.length; i++) {
        const file = event.files[i];
        const proj = await csproj.getProjFilePath(file.fsPath);
        let fileStat = await fs.lstat(file.fsPath)

        if (proj !== undefined && !fileStat.isDirectory()) {
            let alreadyInProj = await csproj.get(proj, file.fsPath) != undefined;
            if (!alreadyInProj) {
                files.push(file.fsPath);
                projs.push(proj);
            }
        }
    }

    if (files.length < 1) return;
    var message = files.length > 1 ?
        "You can choose build actions on the newly added files" :
        "You can choose a build action on the newly added file";
    var button = files.length > 1 ?
        "Choose build actions" :
        "Choose a build action";
    await vscode.window.showInformationMessage(message, button).then(async event => {
        if (event == undefined) return;
        let isPerFileAction: boolean | undefined = false;
        if (files.length > 1) {
            isPerFileAction = await yesNoPickAsync('Would you like to select the build action for each file individually?');
            if (isPerFileAction === undefined) return;
        }

        if (isPerFileAction) {
            for (var i = 0; i < files.length; i++) {
                const file = files[i];
                const proj = projs[i];

                var buildAction = await selectBuildActionAsync(proj, false, path.basename(file));
                if (buildAction != undefined) await csproj.add(proj, [file], buildAction);
            }
        } else {
            let uniqueProjs = projs.filter((item, pos, self) => self.indexOf(item) == pos);

            for (var i = 0; i < uniqueProjs.length; i++) {
                const proj = uniqueProjs[i];

                var buildAction = await selectBuildActionAsync(proj, true, '');
                if (buildAction != undefined) await csproj.add(proj, files, buildAction);
            }
        }
    });
}

async function createFile(args: any) {
    // 'rootPath' is deprecated
    //if (args == null) args = { _fsPath: vscode.workspace.rootPath };
    var workspaceFolders = vscode.workspace.workspaceFolders;
    if (workspaceFolders == undefined) return;
    if (args == null) args = { _fsPath: workspaceFolders[0] };

    let
        template = await vscode.window.showQuickPick([
            { label: "Class", kind: "Class" },
            { label: "Enum", kind: "Enum" },
            { label: "Interface", kind: "Interface" },
            { label: "Page", kind: "Page" },
            { label: "User Control", kind: "UserControl" },
            { label: "Resource file (.resw)", kind: "Resource" }],
            { ignoreFocusOut: true, placeHolder: 'Please select template' }),
        incomingPath: string = args._fsPath || args.fsPath || args.path,
        fileStat = await fs.lstat(incomingPath);

    if (!fileStat.isDirectory()) incomingPath = path.dirname(incomingPath);
    if (template === undefined) return;

    await promptAndAddAsync(incomingPath, template.kind);
}

async function onDeleteFiles(event: vscode.FileDeleteEvent) {
    const csproj = new CsProjWriter();
    let files = event.files;

    for (var i = 0; i < files.length; i++) {
        const file = files[i];

        const proj = await csproj.getProjFilePath(file.fsPath);
        if (proj !== undefined) await csproj.remove(proj, file.fsPath);
    }
}

async function onRenameFiles(event: vscode.FileRenameEvent) {
    const csproj = new CsProjWriter();
    let files = event.files;

    for (var i = 0; i < files.length; i++) {
        const file = files[i];

        const proj = await csproj.getProjFilePath(file.oldUri.fsPath);
        if (proj !== undefined) await csproj.rename(proj, file.oldUri.fsPath, file.newUri.fsPath);
    }
}

async function change(args: any) {
    if (args == null) return;
    const csproj = new CsProjWriter();

    let
        incomingPath: string = args.fsPath || args.path,
        fileStat = await fs.lstat(incomingPath),
        isDir = fileStat.isDirectory();

    //TODO: Add support to change multiple files --> https://github.com/microsoft/vscode/issues/3553 

    if (isDir) {
        vscode.window.showErrorMessage("The folder's build action cannot be changed");
        return;
    } else if (incomingPath.endsWith('.sln') ||
        incomingPath.endsWith('.shproj') ||
        incomingPath.endsWith('.projitems') ||
        incomingPath.endsWith('.csproj') ||
        incomingPath.endsWith('.user') ||
        incomingPath === 'project.json') {
        vscode.window.showErrorMessage("The build action of this file cannot be changed");
        return;
    }

    const proj = await csproj.getProjFilePath(incomingPath);
    if (proj != undefined) {
        var buildAction = await selectBuildActionAsync(proj, false, path.basename(incomingPath));
        if (buildAction != undefined) await csproj.add(proj, [incomingPath], buildAction);
    }
}

async function selectBuildActionAsync(proj: string, multiple: boolean, name: string): Promise<BuildActions | undefined> {
    if (proj === undefined) return;

    let items: Array<string> = [];

    Object.keys(BuildActions).map(key => {
        if (key === 'Folder') return;
        items.push(key);
    });

    let buildAction = await vscode.window.showQuickPick(items, { ignoreFocusOut: true, placeHolder: 'Please select build action for ' + (multiple ? 'files' : "'" + name + "'") });
    if (buildAction === undefined) return;

    return BuildActions[buildAction as keyof typeof BuildActions];
}

async function promptAndAddAsync(incomingPath: string, templateType: string, fileName: string | undefined = undefined) {
    const csproj = new CsProjWriter();
    const proj = await csproj.getProjFilePath(incomingPath);

    if (templateType === 'folder') {
        let folderName = await vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter foldername', value: 'new' + templateType });
        if (folderName === undefined) return;

        let folderPath = incomingPath + path.sep + folderName;

        try {
            await fs.access(folderPath);
            vscode.window.showErrorMessage("Folder already exists");
        } catch {
            await fs.mkdir(folderPath);
            if (proj !== undefined) await csproj.add(proj, [folderPath], BuildActions.Folder);
        }
    } else {
        let extName = '';
        let buildAction: BuildActions | undefined;
        let addCsFile = false;
        let openBeside = false;

        if (templateType === 'Resource') {
            extName = '.resw';
            buildAction = BuildActions.PRIResource;
        } else if (templateType === 'Class' || templateType === 'Enum' || templateType === 'Interface' || templateType.endsWith('.cs')) {
            extName = '.cs';
            buildAction = BuildActions.Compile;
        } else if (templateType === 'Page' || templateType === 'UserControl') {
            extName = '.xaml';
            buildAction = BuildActions.Page;
            addCsFile = true;
        }

        if (fileName === undefined) fileName = await vscode.window.showInputBox({ ignoreFocusOut: true, prompt: 'Please enter filename', value: 'new' + templateType + extName });
        else openBeside = true;
        if (fileName === undefined) return;

        let filePath = correctExtension(incomingPath + path.sep + fileName, extName);

        if (path.extname(filePath) === '') {
            let removeAction = await yesNoPickAsync("Are you sure you want to create a file without extension?");
            if (removeAction === undefined || !removeAction) return;
        }

        try {
            await fs.access(filePath);
            vscode.window.showErrorMessage("File already exists");
        } catch {
            const
                namespaceDetector = new NamespaceDetector(filePath),
                namespace = await namespaceDetector.getNamespace(),
                typename = path.basename(fileName, path.extname(fileName));

            await writeFromTemplateAsync(templateType, namespace, typename, filePath, openBeside);

            if (proj !== undefined) {
                if (buildAction === undefined) {
                    buildAction = await selectBuildActionAsync(proj, false, path.basename(filePath));
                    if (buildAction === undefined) return;
                }

                await csproj.add(proj, [filePath], buildAction);
            }

            if (addCsFile) await promptAndAddAsync(incomingPath, templateType + '.cs', fileName);
        }
    }
}

async function writeFromTemplateAsync(type: string, namespace: string, filename: string, filePath: string, openBeside: boolean = false) {
    const extension = vscode.extensions.getExtension('kreativ-software.csharpextensions');

    if (!extension) {
        vscode.window.showErrorMessage('Weird, but the extension you are currently using could not be found');
        return;
    }

    const templateFileName = type + '.tmpl';
    const templateFilePath = path.join(extension.extensionPath, 'templates', templateFileName);

    let template = await vscode.workspace.openTextDocument(templateFilePath);
    let text = template.getText()
        .split('${namespace}').join(namespace)
        .split('${classname}').join(filename);

    const cursorPosition = findCursorInTemplate(text);

    text = text.replace('${cursor}', '');
    await fs.writeFile(filePath, text);

    const file = await vscode.workspace.openTextDocument(filePath);
    const editor = await vscode.window.showTextDocument(file, openBeside ? {
        viewColumn: vscode.ViewColumn.Beside
    } : {});

    if (cursorPosition != null) editor.selection = new vscode.Selection(cursorPosition, cursorPosition);
}

async function yesNoPickAsync(message: string): Promise<boolean | undefined> {
    let input = await vscode.window.showQuickPick(["No", "Yes"], { ignoreFocusOut: true, placeHolder: message });

    if (input === undefined) return undefined;
    else if (input === 'Yes') return true;
    else return false;
}

function correctExtension(fileName: string, extName: string) {
    if (path.extname(fileName) !== extName) {
        if (fileName.endsWith('.')) fileName = fileName + extName.replace('.', '');
        else fileName = fileName + extName;
    }

    return fileName;
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
