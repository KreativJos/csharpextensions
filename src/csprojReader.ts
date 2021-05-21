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

    public async getRootNamespace(): Promise<string | undefined> {
        try {
            const result = await this.xmlParser.parseStringPromise(this.xml);

            if (result === undefined
                || result.Project.PropertyGroup === undefined
                || !result.Project.PropertyGroup.length) {
                return undefined;
            }

            let foundNamespace = undefined;

            for (const propertyGroup of result.Project.PropertyGroup) {
                if (propertyGroup.RootNamespace) {
                    foundNamespace = propertyGroup.RootNamespace[0];
                    break;
                }
            };

            return foundNamespace;
        } catch (errParsingXml) {
            console.error(`Error parsing project xml`, errParsingXml);
        }

        return undefined;
    }
}
