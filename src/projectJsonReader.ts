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

    public getRootNamespace(): Promise<string | undefined> {
        return new Promise((resolve, reject) => {
            try {
                const jsonObject = JSON.parse(this.json);

                if (jsonObject.tooling === undefined) {
                    return resolve(undefined);
                }

                return resolve(jsonObject.tooling.defaultNamespace);
            } catch {
                return resolve(undefined);
            }
        });
    }
}
