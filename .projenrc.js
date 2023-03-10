const { awscdk, github } = require('projen');
const { NpmAccess } = require('projen/lib/javascript');

const cdkVersion = '2.58.1';

const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Jesse Grabowski',
  authorAddress: 'npm@jessegrabowski.com',
  cdkVersion,
  defaultReleaseBranch: 'main',
  name: '@npm-jessegrabowski/aws-cdk-pattern-spa-artifact-store',
  repositoryUrl: 'git@github.com:jesse-grabowski-devops/aws-cdk-pattern-spa-artifact-store.git',
  description: 'A CDK construct for deploying an artifact store for static SPA files to AWS.',
  npmAccess: NpmAccess.PUBLIC,
  gitignore: [
    '.idea',
  ],
  githubOptions: {
    projenCredentials: github.GithubCredentials.fromApp({}),
  },
  lambdaOptions: {
    runtime: awscdk.LambdaRuntime.NODEJS_18_X,
  },
  devDeps: [
    '@types/js-nacl',
  ],
  bundledDeps: [
    'aws-sdk',
    'js-nacl',
    '@octokit/core',
    '@octokit/plugin-rest-endpoint-methods',
  ],
  minNodeVersion: '18.0.0',
  workflowNodeVersion: '18.12.1',
  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});

project.synth();