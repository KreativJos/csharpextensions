import * as assert from "assert";
import ProjectJsonReader from "../src/projectJsonReader";

describe("ProjectJsonReader", () => {
    it("getNamespace for valid project.json with defaultNamespace attribute should return Xamarin.Forms", () => {
        const json = '{"tooling": {"defaultNamespace":"Xamarin.Forms"}}';
        const detector = new ProjectJsonReader(json);

        const actual = detector.getRootNamespace();

        assert.equal(actual, "Xamarin.Forms");
    });

    it("getNamespace for valid project.json without defaultNamespace attribute should return undefined", () => {
        const json = '{"tooling": {}}';
        const detector = new ProjectJsonReader(json);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });

    it("getNamespace for valid project.json without tooling attribute should return undefined", () => {
        const json = "{}";
        const detector = new ProjectJsonReader(json);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });

    it("getNamespace for invalid project.json should return undefined", () => {
        const json = "lorem ipsum";
        const detector = new ProjectJsonReader(json);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });
});
