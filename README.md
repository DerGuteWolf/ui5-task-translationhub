# ui5-task-translationhub
[![REUSE status](https://api.reuse.software/badge/github.com/DerGuteWolf/ui5-task-translationhub)](https://api.reuse.software/info/github.com/DerGuteWolf/ui5-task-translationhub)

## Premark

This works currently only with translation hub in a NEO Account. I will amend this in the future to also work with translation hub in BTP multi-environment (authorization works differently there)

## Description
A custom task for [ui5-builder](https://github.com/SAP/ui5-builder) of [UI5 Tooling](https://sap.github.io/ui5-tooling/) which allows automated upload, translation and download of i18n properties files to/from [SAP Translation Hub Service](https://help.sap.com/viewer/p/SAP_TRANSLATION_HUB) .

## Configuration options (in `$yourapp/ui5-deploy.yaml`)

- hostName: `string`
  The first part of the hostname of your translation hub instance, cf. [Building Base URL of SAP Translation Hub](https://help.sap.com/viewer/ed6ce7a29bdd42169f5f0d7868bce6eb/Cloud/en-US/3a011fba82644259a2cc3c919863f4b4.html).
  - For enterprise accounts use `sap<technical name of provider subaccount>-<technical name of subscription subaccount>.<region host without .ondemand.com part>`
  - For trial accounts use `saptranslation-<technical name of subaccount>.hanatrial`
- projectID: `string`
  The <translation project ID> of a file translation project for java style properties files
- duplicate: `object` (optional)
  Use this if you want files delivered from the translation hub duplicated to other locales. See below for examples. 
- debug: `boolean` (optional)
- timeout: `number` (optional)
  timeout value in milliseconds to use for normal Calls to Translation Hub API (default: 1000)
- timeoutUpDown: `number` (optional)
  timeout value in milliseconds to use for Up- and Download Calls to Translation Hub API (default: 30000)
- retryDelay: `number` (optional)
  retry delay value in milliseconds to use in case of complaint of parallel translation tasks (default: 3000)
  
  
## Usage

1. Define the dependency in `$yourapp/package.json`:

```json
"devDependencies": {
    // ...
    "ui5-task-translationhub": "DerGuteWolf/ui5-task-translationhub#semver:^1.0.4"
    // ...
},
```

2. configure it in `$yourapp/ui5-deploy.yaml` (cf. Configuration Options above):

If you do not have the `$yourapp/ui5-deploy.yaml` file already, it can be generated with `npx fiori add deploy-config` command.

```yaml
builder:
  customTasks:
    - name: ui5-task-translationhub
      beforeTask: escapeNonAsciiCharacters
      configuration:
        hostName: sap...
        projectID: 00000
        duplicate:
          de_DE: de_BE,de_CH,de_AT,de_IT,de_LI,de_LU,de_NA
          es_ES: es
          fr_FR: fr
          nl_NL: nl
          it_IT: it
          pt_BR: pt
```

3. Add username (environment variable `UI5_TASK_TRANSLATIONHUB_USERNAME`) and password (environment variable `UI5_TASK_TRANSLATIONHUB_PASSWORD`) which should be used to access the Translation Hub API in in `$yourapp/.env` file. Add .env to your .gitignore file to make sure to never commit the credentials. If you have already a SAP Universal ID, pay attention to Note [3085908](https://launchpad.support.sap.com/#/notes/3085908) and use your account password and not your Universal ID password if they differ.

## Kown Issues

Translation Hub sometimes has problems with empty i18n files (and the Fiori Elements app templates bring several empty i18n files along). If you run into these problems, just add these two lines to all empty i18n files (NOTR stands for NOt to be TRanslated):
```
#NOTR
dummy=Dummy
```

## How to obtain support
In case you need any support, please create a GitHub issue.

## License
This work is dual-licensed under Apache 2.0 and the Derived Beer-ware License. The official license will be Apache 2.0 but finally you can choose between one of them if you use this work.

When you like this stuff, buy @DerGuteWolf a beer.

## Release History
See [CHANGELOG.md](CHANGELOG.md).

## See also https://github.com/DerGuteWolf/ABAP_TRANSLATION_HUB
