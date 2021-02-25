#!/bin/bash

test_output="$(npm run test)"

if [[ $test_output == *"failing"* ]]; then
    echo "Failing test found, cannot publish. Test output:"
    echo "$test_output"
else
    vsce package
    sed -e 's/"publisher": "tdallau-csharpextensions"/"publisher": "jsw"/g' ./package.json >./package.json.temp
    mv package.json package.json.2.temp
    mv package.json.temp package.json
    ovsx publish -p $(cat ovsx.key)
    rm package.json
    mv package.json.2.temp package.json
fi
