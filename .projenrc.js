const { awscdk } = require('projen');
const project = new awscdk.AwsCdkConstructLibrary({
  author: 'Jesse Grabowski',
  authorAddress: 'github@jessegrabowski.com',
  cdkVersion: '2.1.0',
  defaultReleaseBranch: 'main',
  name: 'aws-cdk-pattern-spa-artifact-store',
  repositoryUrl: 'git@github.com:jesse-grabowski-devops/aws-cdk-pattern-spa-artifact-store.git',

  // deps: [],                /* Runtime dependencies of this module. */
  // description: undefined,  /* The description is just a string that helps people understand the purpose of the package. */
  // devDeps: [],             /* Build dependencies for this module. */
  // packageName: undefined,  /* The "name" in package.json. */
});
project.synth();