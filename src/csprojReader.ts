import Nameable from "./nameable";
const xml2js = require("xml2js");

export default class CsprojReader implements Nameable {
    private readonly xml: string;
    private readonly xmlParser: any;

    /**
     * Initializes a new instance for a .csproj
     * file.
     *
     * @param fileContent - The .csproj file full content
     */
    constructor(fileContent: string) {
        this.xml = fileContent;
        this.xmlParser = new xml2js.Parser();
    }

    public getRootNamespace(): string | undefined {
        let foundNamespace = undefined;
        this.xmlParser.parseString(this.xml, (error: any, result: any) => {
            if (result === undefined
                || result.Project.PropertyGroup === undefined
                || result.Project.PropertyGroup[0].RootNamespace === undefined) {
                return undefined;
            }
            foundNamespace = result.Project.PropertyGroup[0].RootNamespace[0];
        });
        return foundNamespace;
    }
}
