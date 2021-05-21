import * as vscode from 'vscode';
import * as os from 'os';

//TODO: Extract regexps

export default class CodeActionProvider implements vscode.CodeActionProvider {
    private _commandIds = {
        ctorFromProperties: 'csharpextensions.ctorFromProperties',
        initializeMemberFromCtor: 'csharpextensions.initializeMemberFromCtor',
    };

    private readonly _readonlyRegex = new RegExp(/(public|private|protected)\s(\w+)\s(\w+)\s?{\s?(get;)\s?(private\s)?(set;)?\s?}/g);
    private readonly _classRegex = new RegExp(/(private|internal|public|protected)\s?(static)?\sclass\s(\w*)/g);
    private readonly _generalRegex = new RegExp(/(public|private|protected)\s(.*?)\(([\s\S]*?)\)/gi);

    constructor() {
        vscode.commands.registerCommand(this._commandIds.initializeMemberFromCtor, this.initializeMemberFromCtor, this);
        vscode.commands.registerCommand(this._commandIds.ctorFromProperties, this.executeCtorFromProperties, this);
    }

    public provideCodeActions(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command[] {
        let commands = new Array<vscode.Command>();

        const addInitalizeFromCtor = (type: MemberGenerationType) => {
            const cmd = this.getInitializeFromCtorCommand(document, range, context, token, type);

            if (cmd) commands.push(cmd)
        };

        addInitalizeFromCtor(MemberGenerationType.PrivateField);
        addInitalizeFromCtor(MemberGenerationType.ReadonlyProperty);
        addInitalizeFromCtor(MemberGenerationType.Property);

        const ctorPCommand = this.getCtorpCommand(document, range, context, token);

        if (ctorPCommand) commands.push(ctorPCommand);

        return commands;
    }

    private camelize(str: string) {
        return str.replace(/(?:^\w|[A-Z]|\b\w|\s+)/g, function (match, index) {
            if (+match === 0) return ""; // or if (/\s+/.test(match)) for white spaces
            return index == 0 ? match.toLowerCase() : match.toUpperCase();
        });
    }

    private executeCtorFromProperties(args: ConstructorFromPropertiesArgument) {
        const tabSize = vscode.workspace.getConfiguration().get('editor.tabSize', 4);
        let ctorParams = new Array<string>();

        if (!args.properties)
            return;

        args.properties.forEach((p) => {
            ctorParams.push(`${p.type} ${this.camelize(p.name)}`)
        });

        let assignments = args.properties
            .map(prop => `${Array(tabSize * 1).join(' ')} this.${prop.name} = ${this.camelize(prop.name)};${os.EOL}`);

        let firstPropertyLine = args.properties.sort((a, b) => a.lineNumber - b.lineNumber)[0].lineNumber;

        const ctorStatement = `${Array(tabSize * 2).join(' ')} ${args.classDefinition.modifier} ${args.classDefinition.className}(${ctorParams.join(', ')}) 
        {
        ${assignments.join('')}   
        }
        `;

        let edit = new vscode.WorkspaceEdit();
        let edits = new Array<vscode.TextEdit>();

        const pos = new vscode.Position(firstPropertyLine, 0);
        const range = new vscode.Range(pos, pos);
        const ctorEdit = new vscode.TextEdit(range, ctorStatement);

        edits.push(ctorEdit)
        edit.set(args.document.uri, edits);

        let reFormatAfterChange = vscode.workspace.getConfiguration().get('csharpextensions.reFormatAfterChange', true);
        let applyPromise = vscode.workspace.applyEdit(edit)

        if (reFormatAfterChange) {
            applyPromise.then(() => {
                vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', args.document.uri)
                    .then(formattingEdits => {
                        if (formattingEdits !== undefined) {
                            let formatEdit = new vscode.WorkspaceEdit();

                            formatEdit.set(args.document.uri, formattingEdits);

                            vscode.workspace.applyEdit(formatEdit);
                        }
                    });
            })
        }
    }

    private getCtorpCommand(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken): vscode.Command | null {
        const editor = vscode.window.activeTextEditor;

        if (editor == null) return null;

        const position = editor.selection.active;
        const withinClass = this.findClassFromLine(document, position.line);

        if (withinClass == null || !withinClass) return null;

        let properties = new Array<CSharpPropertyDefinition>();
        let lineNo = 0;

        while (lineNo < document.lineCount) {
            const textLine = document.lineAt(lineNo);
            const match = this._readonlyRegex.exec(textLine.text);

            if (match) {
                const foundClass = this.findClassFromLine(document, lineNo);

                if (foundClass != null && foundClass.className === withinClass.className) {
                    const prop: CSharpPropertyDefinition = {
                        lineNumber: lineNo,
                        class: foundClass,
                        modifier: match[1],
                        type: match[2],
                        name: match[3],
                        statement: match[0]
                    }

                    properties.push(prop);
                }
            }

            lineNo++;
        }

        if (!properties.length) return null;

        const classDefinition = this.findClassFromLine(document, position.line);

        if (!classDefinition) return null;

        const parameter: ConstructorFromPropertiesArgument = {
            properties: properties,
            classDefinition: classDefinition,
            document: document
        };

        const cmd: vscode.Command = {
            title: "Initialize ctor from properties...",
            command: this._commandIds.ctorFromProperties,
            arguments: [parameter]
        };

        return cmd;
    }

    private findClassFromLine(document: vscode.TextDocument, lineNo: number): CSharpClassDefinition | null {
        while (lineNo > 0) {
            const line = document.lineAt(lineNo);
            const match = this._classRegex.exec(line.text);

            if (match != null && match) {
                return {
                    startLine: lineNo,
                    endLine: -1,
                    className: match[3],
                    modifier: match[1],
                    statement: match[0]
                };
            }

            lineNo--;
        }

        return null;
    }

    private initializeMemberFromCtor(args: InitializeFieldFromConstructor) {
        let edit = new vscode.WorkspaceEdit();

        const bodyStartRange = new vscode.Range(args.constructorBodyStart, args.constructorBodyStart)
        const declarationRange = new vscode.Range(args.constructorStart, args.constructorStart);

        let declarationEdit = new vscode.TextEdit(declarationRange, args.memberGeneration.declaration);
        let memberInitEdit = new vscode.TextEdit(bodyStartRange, args.memberGeneration.assignment);

        let edits = new Array<vscode.TextEdit>();

        if (args.document.getText().indexOf(args.memberGeneration.declaration.trim()) == -1)
            edits.push(declarationEdit);

        if (args.document.getText().indexOf(args.memberGeneration.assignment.trim()) == -1)
            edits.push(memberInitEdit);

        edit.set(args.document.uri, edits);

        const reFormatAfterChange = vscode.workspace.getConfiguration().get('csharpextensions.reFormatAfterChange', true);
        const applyPromise = vscode.workspace.applyEdit(edit);

        if (reFormatAfterChange) {
            applyPromise.then(() => {
                vscode.commands.executeCommand<vscode.TextEdit[]>('vscode.executeFormatDocumentProvider', args.document.uri)
                    .then(formattingEdits => {
                        if (formattingEdits !== undefined) {
                            let formatEdit = new vscode.WorkspaceEdit();

                            formatEdit.set(args.document.uri, formattingEdits);

                            vscode.workspace.applyEdit(formatEdit);
                        }
                    });
            })
        }
    }

    private getInitializeFromCtorCommand(document: vscode.TextDocument, range: vscode.Range, context: vscode.CodeActionContext, token: vscode.CancellationToken, memberGenerationType: MemberGenerationType): vscode.Command | null {
        const editor = vscode.window.activeTextEditor;

        if (editor == null) return null;

        const position = editor.selection.active;
        const surrounding = document.getText(new vscode.Range(new vscode.Position(position.line - 2, 0), new vscode.Position(position.line + 2, 0)));
        const wordRange = editor.document.getWordRangeAtPosition(position);

        if (!wordRange) return null;

        const matches = this._generalRegex.exec(surrounding);

        if (!matches) return null;

        const ctorParamStr = matches[3];
        const lineText = editor.document.getText(new vscode.Range(position.line, 0, position.line, wordRange.end.character));
        const selectedName = lineText.substr(wordRange.start.character, wordRange.end.character - wordRange.start.character);
        let parameterType: string | null = null;

        ctorParamStr.split(',').forEach(strPart => {
            const separated = strPart.trim().split(' ');

            if (separated[1].trim() == selectedName)
                parameterType = separated[0].trim();
        });

        if (!parameterType) return null;

        const tabSize = vscode.workspace.getConfiguration().get('editor.tabSize', 4);
        const privateMemberPrefix = vscode.workspace.getConfiguration().get('csharpextensions.privateMemberPrefix', '');
        const prefixWithThis = vscode.workspace.getConfiguration().get('csharpextensions.useThisForCtorAssignments', true);

        let memberGeneration: MemberGenerationProperties;
        let title: string;
        let name: string;

        switch (memberGenerationType) {
            case MemberGenerationType.PrivateField:
                title = 'Initialize field from parameter...';

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} private readonly ${parameterType} ${privateMemberPrefix}${selectedName};\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${privateMemberPrefix}${selectedName} = ${selectedName};\r\n`
                };
                break;
            case MemberGenerationType.ReadonlyProperty:
                title = 'Initialize readonly property from parameter...';

                name = selectedName[0].toUpperCase() + selectedName.substr(1);

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} public ${parameterType} ${name} { get; }\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${name} = ${selectedName};\r\n`
                };
                break;
            case MemberGenerationType.Property:
                title = 'Initialize property from parameter...';

                name = selectedName[0].toUpperCase() + selectedName.substr(1);

                memberGeneration = {
                    type: memberGenerationType,
                    declaration: `${Array(tabSize * 2).join(' ')} public ${parameterType} ${name} { get; set; }\r\n`,
                    assignment: `${Array(tabSize * 3).join(' ')} ${(prefixWithThis ? 'this.' : '')}${name} = ${selectedName};\r\n`
                };
                break;
            default:
                //TODO: Show error?
                return null;
        }

        const constructorBodyStart = this.findConstructorBodyStart(document, position);

        if (constructorBodyStart == null) return null;

        const parameter: InitializeFieldFromConstructor = {
            document: document,
            type: parameterType,
            name: selectedName,
            memberGeneration: memberGeneration,
            constructorBodyStart: constructorBodyStart,
            constructorStart: this.findConstructorStart(document, position)
        };

        const cmd: vscode.Command = {
            title: title,
            command: this._commandIds.initializeMemberFromCtor,
            arguments: [parameter]
        };

        return cmd;
    }

    private findConstructorBodyStart(document: vscode.TextDocument, position: vscode.Position): vscode.Position | null {
        for (let lineNo = position.line; lineNo < position.line + 5; lineNo++) {
            const line = document.lineAt(lineNo);

            if (line.text.indexOf('{') != -1)
                return new vscode.Position(lineNo + 1, 0);
        }

        return null;
    }

    private findConstructorStart(document: vscode.TextDocument, position: vscode.Position): vscode.Position {
        const foundClass = this.findClassFromLine(document, position.line);

        if (foundClass) {
            for (let lineNo = position.line; lineNo > position.line - 5; lineNo--) {
                const line = document.lineAt(lineNo);

                if (line.isEmptyOrWhitespace && !(line.lineNumber < foundClass.startLine))
                    return new vscode.Position(lineNo, 0);
            }
        }

        return new vscode.Position(position.line, 0);
    }
}

enum MemberGenerationType {
    Property,
    ReadonlyProperty,
    PrivateField
}

interface MemberGenerationProperties {
    type: MemberGenerationType,
    assignment: string,
    declaration: string
}

interface CSharpClassDefinition {
    startLine: number,
    endLine: number,
    className: string,
    modifier: string,
    statement: string
}

interface CSharpPropertyDefinition {
    class: CSharpClassDefinition,
    modifier: string,
    type: string,
    name: string,
    statement: string,
    lineNumber: number
}

interface ConstructorFromPropertiesArgument {
    document: vscode.TextDocument,
    classDefinition: CSharpClassDefinition,
    properties: CSharpPropertyDefinition[]
}

interface InitializeFieldFromConstructor {
    document: vscode.TextDocument,
    type: string,
    name: string,
    memberGeneration: MemberGenerationProperties,
    constructorBodyStart: vscode.Position,
    constructorStart: vscode.Position,
}