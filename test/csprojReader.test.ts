import * as assert from "assert";
import CsprojReader from "../src/csprojReader";

describe("CsprojReader", () => {
    it("getNamespace for valid csproj file with RootNamespace attribute in the first PropertyGroup should return Xamarin.Forms", () => {
        const csproj =
            '<Project Sdk="Microsoft.NET.Sdk">\
        <PropertyGroup>\
          <RootNamespace>Xamarin.Forms</RootNamespace>\
        </PropertyGroup>\
      </Project>';
        const detector = new CsprojReader(csproj);

        const actual = detector.getRootNamespace();

        assert.equal(actual, "Xamarin.Forms");
    });

    it("getNamespace for valid csproj file with RootNamespace attribute in the third PropertyGroup should return System.Linq", () => {
        const csproj =
            '<Project Sdk="Microsoft.NET.Sdk">\
            <PropertyGroup></PropertyGroup>\
            <PropertyGroup></PropertyGroup>\
        <PropertyGroup>\
          <RootNamespace>System.Linq</RootNamespace>\
        </PropertyGroup>\
      </Project>';
        const detector = new CsprojReader(csproj);

        const actual = detector.getRootNamespace();

        assert.equal(actual, "System.Linq");
    });

    it("getNamespace for valid csproj file without RootNamespace attribute should return undefined", () => {
        const csproj =
            '<Project Sdk="Microsoft.NET.Sdk">\
        <PropertyGroup>\
        </PropertyGroup>\
      </Project>';
        const detector = new CsprojReader(csproj);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });

    it("getNamespace for valid csproj file without PropertyGroup attribute should return undefined", () => {
        const csproj = '<Project Sdk="Microsoft.NET.Sdk"></Project>';
        const detector = new CsprojReader(csproj);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });

    it("getNamespace for invalid csproj file should return undefined", () => {
        const csproj = "lorem ipsum";
        const detector = new CsprojReader(csproj);

        const actual = detector.getRootNamespace();

        assert.equal(actual, undefined);
    });
});
