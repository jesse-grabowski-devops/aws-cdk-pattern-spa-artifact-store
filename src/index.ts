import * as cdk from 'aws-cdk-lib';
import { aws_iam, aws_s3, aws_secretsmanager } from 'aws-cdk-lib';
import { IBucket } from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import { RotateSecretFunction } from './rotate-secret-function';

export interface GithubRepository {
  readonly owner: string;
  readonly repo: string;
}

export interface SinglePageApplicationArtifactStoreProperties {
  readonly ciRepositories: GithubRepository[];
  readonly removalPolicy?: cdk.RemovalPolicy;
}

export interface SinglePageApplicationArtifactStoreOutputs {
  readonly artifactBucket: IBucket;
}

export class SinglePageApplicationArtifactStore extends Construct {
  public readonly output: SinglePageApplicationArtifactStoreOutputs;
  public readonly props: SinglePageApplicationArtifactStoreProperties;

  constructor(scope: Construct, id: string, props: SinglePageApplicationArtifactStoreProperties) {
    super(scope, id);
    this.props = props;

    const artifactWriterGroup = new aws_iam.Group(this, 'artifactStoreWriters');

    const artifactBucket = new aws_s3.Bucket(this, 'artifactStore', {
      encryption: cdk.aws_s3.BucketEncryption.S3_MANAGED,
      removalPolicy: props.removalPolicy,
      autoDeleteObjects: true,
      blockPublicAccess: cdk.aws_s3.BlockPublicAccess.BLOCK_ALL,
    });
    artifactBucket.addToResourcePolicy(new aws_iam.PolicyStatement({
      actions: ['s3:PutObject'],
      resources: [artifactBucket.arnForObjects('*')],
      principals: [artifactWriterGroup.grantPrincipal],
    }));

    const githubPatSecret = new aws_secretsmanager.Secret(this, 'githubPAT');

    const artifactWriterUser = new aws_iam.User(this, 'artifactStoreWriter');
    const artifactWriterAccessKey = new aws_iam.AccessKey(this, 'artifactStoreAccessKey', { user: artifactWriterUser });
    const artifactWriterAccessKeySecret = new aws_secretsmanager.Secret(this, 'artifactStoreSecret', {
      secretStringValue: artifactWriterAccessKey.secretAccessKey,
    });

    /*
    SECRET_MANAGER_ENDPOINT
 * GITHUB_REPOSITORIES
 * GITHUB_PAT_ARN
 * ACCESS_KEY_ID
     */
    const rotationFunction = new RotateSecretFunction(this, 'rotationFunction');
    rotationFunction.addEnvironment('GITHUB_REPOSITORIES', JSON.stringify([{
      owner: 'jesse-grabowski-devops',
      name: 'angular-testbed',
    }]));
    rotationFunction.addEnvironment('GITHUB_PAT_ARN', githubPatSecret.secretArn);
    rotationFunction.addEnvironment('ACCESS_KEY_ID', artifactWriterAccessKey.accessKeyId);

    githubPatSecret.grantRead(rotationFunction);

    artifactWriterAccessKeySecret.addRotationSchedule('artifactStoreSecretRotation', {
      automaticallyAfter: cdk.Duration.days(1),
      rotationLambda: rotationFunction,
    });

    this.output = {
      artifactBucket,
    };
  }
}