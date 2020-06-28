import Nameable from "./nameable";

export default class ProjectJsonReader implements Nameable {
    private readonly json: string;

    /**
     * Initializes a new instance for a project.json file.
     *
     * @param fileContent - The project.json file full content
     */
    constructor(fileContent: string) {
        this.json = fileContent;
    }

    public getRootNamespace(): string | undefined {
        try {
            const jsonObject = JSON.parse(this.json);

            if (jsonObject.tooling === undefined) {
                return undefined;
            }

            return jsonObject.tooling.defaultNamespace;
        } catch {
            return undefined;
        }
    }
}
