import fs      from 'fs';
import minify  from 'html-minifier';
import {Types} from '../defaults';
import requireFromString from 'require-from-string';
import pug     from 'pug';

const htmlMinifier = minify.minify;
const htmlRegex    = /(<template.*?>)([\s\S]*?)(<\/template>)/gm;
const scriptRegex  = /(<script.*?>)([\s\S]*?)(<\/script>)/gm;
const types        = new Types();

function htmlParser(body, minify) {
    let bodyString = body.match(htmlRegex)[0];
    const templateLang = bodyString.replace(htmlRegex, '$1');
    if (bodyString) {
        bodyString = bodyString.replace(htmlRegex, '$2');
        if(templateLang.includes('lang="pug"') || templateLang.includes('lang="jade"')) {
            bodyString = pug.compile(bodyString,{})({});
        }
    }

    if (minify) {
        bodyString = htmlMinifier(bodyString, {
            collapseWhitespace: true
        });
    }

    return bodyString;
}

class DataObject {
    constructor(componentData, defaultData, type) {
        switch (type) {
        case types.COMPONENT:
            this.data = Object.assign({}, componentData, defaultData);
            break;
        case types.SUBCOMPONENT:
            this.data = componentData;
            break;
        }
    }
}

function dataParser(script, defaults, type) {
    let finalScript = {};
    for (var element in script) {
        if (script.hasOwnProperty(element)) {
            if (element === 'data') {
                let data = new DataObject(script.data(), defaults.options.data, type).data;
                finalScript[element] = () => data;
            } else {
                finalScript[element] = script[element];
            }
        }
    }
    return finalScript;
}

function scriptParser(script, defaults, type) {
    const options = {
        'presets': ['es2015']
    };
    let scriptString = script.match(scriptRegex)[0].replace(scriptRegex, '$2');
    let babelScript  = require('babel-core').transform(scriptString, options);
    let evalScript   = requireFromString(babelScript.code);
    let finalScript  = dataParser(evalScript.default, defaults, type);
    return finalScript;
}

function layoutParser(layoutPath, defaults, type) {
    return new Promise(function(resolve) {
        fs.readFile(layoutPath, 'utf-8', function (err, content) {
            if (err) {
                content = defaults.backupLayout;
                // let error = `Could not find the layout, I was expecting it to live here
                // ${layoutPath}
                // But I couldn't find it there ¯\_(ツ)_/¯
                // So I'm using the default layout`;
                // console.warn(error)
            }

            const body = htmlParser(content);
            content = content.replace(htmlRegex, '');
            const script = scriptParser(content, defaults, type);

            resolve({
                type: type,
                template: body,
                script: script
            });
        });
    });
}

function componentParser(templatePath, defaults, type) {
    return new Promise(function(resolve, reject) {
        fs.readFile(templatePath, 'utf-8', function (err, content) {
            if (err) {
                let error = `Could Not Find Component, I was expecting it to live here \n${templatePath} \nBut I couldn't find it there, ¯\\_(ツ)_/¯\n\n`;
                console.error(error);
                reject(error);
            } else {
                const body = htmlParser(content, true);
                content = content.replace(htmlRegex, '');
                const script = scriptParser(content, defaults, type);

                let componentScript = script;
                componentScript.template = body;

                resolve({
                    type: type,
                    name: templatePath.match(/\w*\.vue/g)[0].replace('\.vue', ''),
                    script: componentScript
                });
            }
        });
    });
}

export {
    componentParser,
    layoutParser
};
