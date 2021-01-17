const log = require("@ui5/logger").getLogger("builder:customtask:translationhub");
const axios = require('axios').default;
const axiosCookieJarSupport = require('axios-cookiejar-support').default;
const tough = require('tough-cookie');
const dotenv = require('dotenv');
const formData = require('form-data');
const unzipper = require('unzipper');
const resourceFactory = require("@ui5/fs").resourceFactory;

const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

dotenv.config();

const env = {
  username: process.env.UI5_TASK_TRANSLATIONHUB_USERNAME,
  password: process.env.UI5_TASK_TRANSLATIONHUB_PASSWORD
};

/**
 * translationhub
 *
 * @param {object} parameters Parameters
 * @param {module:@ui5/fs.DuplexCollection} parameters.workspace DuplexCollection to read and write files
 * @param {module:@ui5/fs.AbstractReader} parameters.dependencies Reader or Collection to read dependency files
 * @param {object} parameters.taskUtil Specification Version dependent interface to a
 *                [TaskUtil]{@link module:@ui5/builder.tasks.TaskUtil} instance
 * @param {object} parameters.options Options
 * @param {string} parameters.options.projectName Project name
 * @param {string} [parameters.options.projectNamespace] Project namespace if available
 * @param {string} [parameters.options.configuration] Task configuration if given in ui5.yaml
 * @returns {Promise<undefined>} Promise resolving with <code>undefined</code> once data has been written
 */
module.exports = async function({workspace, dependencies, taskUtil, options}) {
    const isDebug = options && options.configuration && options.configuration.debug;
    const timeout = options && options.configuration && options.configuration.timeout || 1000;
    const timeoutUpDown = options && options.configuration && options.configuration.timeoutUpDown || 30000;
    const duplicate = options && options.configuration && options.configuration.duplicate || {};

    const axiosInstance = axios.create({
        baseURL: `https://${options.configuration.hostName}.ondemand.com/translationhub/api/v2/fileProjects/${options.configuration.projectID}`,
        timeout: timeout,
        withCredentials: true,
        headers: {
            common: {'X-CSRF-Token': 'Fetch'}
        },
        //xsrfHeaderName: 'X-CSRF-Token', // does not work because translation hub sends token not in cookie but in header
        auth: {
            username: env.username,
            password: env.password
        },
    });
    axiosCookieJarSupport(axiosInstance);
    axiosInstance.defaults.jar = new tough.CookieJar();

    // get project details and X-CSRF-Token
    await axiosInstance.get().then(response => {
        isDebug && log.verbose(response.data);
        isDebug && log.info(`Token: ${response.headers['x-csrf-token']}`);
        axiosInstance.defaults.headers.common['X-CSRF-Token'] = response.headers['x-csrf-token'];
    }).catch(error => { log.error(error); });

    // find all i18n.properties file in the project
    let propertyFiles;
    try {
        propertyFiles = await workspace.byGlob(['**/i18n.properties', '!**/node_modules/**']);
    } catch (e) {
        log.error(`Couldn't read resources: ${e}`);
    }        
    log.info(`Starting translationHub Upload for project ${options.projectName} for ${propertyFiles.length} File(s)`);

    // iterate over all found files and do things in parallel

    //: PromiseLike<any>[]
    let filesP = [];
    for (let propertyFile of propertyFiles) {
        let asyncWorkForContent = async () => {
            const pathName = propertyFile.getPath().substring(0, propertyFile.getPath().lastIndexOf('/') + 1);
            log.info(`${pathName}: Found i18n.properties file, file length is ${propertyFile.getStatInfo().size} bytes.`);
            // Build multipart/form-data needed for uploading file
            const data = new formData();
            data.append('pathToGenerateTranslations', pathName);
            data.append('file', await propertyFile.getBuffer(),  { filename: `${pathName}i18n.properties`, contentType: 'application/octet-stream' }); //propertyFile.getStream()); // gives Content of Resource /i18n/i18n.properties has been drained
            try {
                // upload file
                const responseUpload = await axiosInstance.post('/files', data.getBuffer(), { timeout: timeoutUpDown, headers: data.getHeaders() });
                log.info(`${pathName}: Upload Success, Status: ${responseUpload.status} ${responseUpload.statusText}`);
                isDebug && log.verbose(responseUpload.data);
                // start translation
                const translationStart = await axiosInstance.post(`/files/${responseUpload.data.id}/executions`, {"operation":"PULL_TRANSLATE"});
                log.info(`${pathName}: Translation Start Success, Status: ${translationStart.status} ${translationStart.statusText}`);
                isDebug && log.verbose(translationStart.data);
                // wait for translation to finish
                let translationProgress;
                do {
                    await sleep(1000);
                    translationProgress = await axiosInstance.get(`/executions/${translationStart.data.id}`);
                    isDebug && log.verbose(translationProgress.data);
                } while (translationProgress && translationProgress.data.status !== 'COMPLETED');
                log.info(`${pathName}: Translation Completed Success`);
                // download zip with translated files
                const translationZip = await axiosInstance.get(`/files/${responseUpload.data.id}/content`, { timeout: timeoutUpDown, responseType: 'stream' });
                log.info(`${pathName}: Translation Get Zip Success, Status: ${translationZip.status} ${translationZip.statusText}, Zip Length ${translationZip.headers['content-length']} Bytes`);
                // write all files and requested duplicates to the workspace, do things in parallel
                for await (const entry of translationZip.data.pipe(unzipper.Parse({forceStream: true}))) {
                    // write file as received from translation hub
                    await workspace.write(resourceFactory.createResource({ path: `/${entry.path}`, stream: entry }), {drain: true});
                    log.info(`/${entry.path}: Created`);  // entry.vars.uncompressedSize and entry.vars.compressedSize always zero...
                    // write requested duplicates
                    let duplicateP = [];
                    for (let code in duplicate) {
                        const re = new RegExp(`^(.*i18n_)${code}(.properties)$`);
                        if (re.test(entry.path)) {
                            for (let targetCode of duplicate[code].split(',')) {
                                let asyncWorkForContent = async () => {
                                    let res = await ( await workspace.byPath(`/${entry.path}`) ).clone();
                                    res.setPath(res.getPath().replace(re, `\$1${targetCode}\$2`));
                                    await workspace.write(res);
                                    log.info(`${res.getPath()}: Created as a Copy`);
                                }
                                duplicateP.push(asyncWorkForContent());
                            }
                        }
                    }
                    try {
                        await Promise.all(duplicateP);
                    } catch (e) {
                        log.error(`Error: ${e}`);
                    }
                }                
            } catch (e) {
                log.error(`Error: ${e}`);
            }
        }
        filesP.push(asyncWorkForContent());
    }
    try {
        await Promise.all(filesP);
    } catch (e) {
        log.error(`Error: ${e}`);
    }
};
