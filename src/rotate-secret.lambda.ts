// Based on https://github.com/aws-samples/aws-secrets-manager-rotation-lambdas/blob/master/SecretsManagerRotationTemplate/lambda_function.py
import { Octokit } from '@octokit/core';
import { restEndpointMethods } from '@octokit/plugin-rest-endpoint-methods';
import { SecretsManager } from 'aws-sdk';
import { instantiate as instantiateNacl } from 'js-nacl';
import { GithubRepository } from './index';

/*
 * Envars
 *
 * SECRET_MANAGER_ENDPOINT
 * GITHUB_REPOSITORIES
 * GITHUB_PAT_ARN
 * ACCESS_KEY_ID
 *
 * Set github secrets:
 *
 * ARTIFACT_BUCKET_ACCESS_KEY_ID
 * ARTIFACT_BUCKET_ACCESS_KEY_SECRET
 */
export async function handler(event: any) {
  const { SecretId, ClientRequestToken, Step } = event;

  const secretManager = new SecretsManager({
    endpoint: process.env.SECRET_MANAGER_ENDPOINT,
  });

  const metadata = await secretManager.describeSecret({ SecretId }).promise();
  if (!metadata.RotationEnabled) {
    throw new Error('Secret rotation is not enabled');
  }

  const versions = metadata.VersionIdsToStages;
  if (typeof versions === 'undefined') {
    throw new Error('No versions found');
  }
  if (!(ClientRequestToken in versions)) {
    throw new Error(`Secret version ${ClientRequestToken} has no stage for rotation of secret ${SecretId}.`);
  }
  if ('AWS CURRENT' in versions[ClientRequestToken]) {
    throw new Error(`Secret version ${ClientRequestToken} is already marked as AWSCURRENT for secret ${SecretId}.`);
  } else if (!('AWSPENDING' in versions[ClientRequestToken])) {
    throw new Error(`Secret version ${ClientRequestToken} is not marked as AWSPENDING for secret ${SecretId}.`);
  }

  switch (Step) {
    case 'createSecret':
      return createSecret(secretManager, SecretId, ClientRequestToken);
    case 'setSecret':
      return setSecret(secretManager, SecretId);
    case 'testSecret':
      return Promise.resolve();
    case 'finishSecret':
      return finishSecret(secretManager, SecretId, ClientRequestToken);
    default:
      throw new Error('Invalid step parameter');
  }
}

async function createSecret(secretManager: SecretsManager, SecretId: string, ClientRequestToken: string) {
  await secretManager.getSecretValue({ SecretId, VersionStage: 'AWSCURRENT' }).promise();

  try {
    await secretManager.getSecretValue({ SecretId, VersionId: ClientRequestToken, VersionStage: 'AWSPENDING' }).promise();
  } catch (e) {
    if (e.code === 'ResourceNotFoundException') {
      const ExcludeCharacters = process.env.EXCLUDE_CHARACTERS ?? '"@/\\';
      const password = await secretManager.getRandomPassword({ ExcludeCharacters }).promise();
      return secretManager.putSecretValue({ SecretId, ClientRequestToken, SecretString: password.RandomPassword, VersionStages: ['AWSPENDING'] });
    } else {
      throw e;
    }
  }
  return Promise.resolve();
}

async function setSecret(secretManager: SecretsManager, SecretId: string) {
  const accessKeyId = process.env.ACCESS_KEY_ID;
  if (typeof accessKeyId === 'undefined') {
    throw new Error('ACCESS_KEY_ID is not set');
  }
  const accessKeySecret = await secretManager.getSecretValue({ SecretId }).promise();
  if (typeof accessKeySecret === 'undefined' || typeof accessKeySecret.SecretString === 'undefined') {
    throw new Error('Secret not found');
  }
  const reposStr = process.env.GITHUB_REPOSITORIES;
  if (typeof reposStr === 'undefined') {
    throw new Error('GITHUB_REPOSITORIES is not set');
  }
  const repos = <GithubRepository[]> JSON.parse(reposStr);

  const patArn = process.env.GITHUB_PAT_ARN;
  if (typeof patArn === 'undefined') {
    throw new Error('GITHUB_PAT_ARN environment variable is not set');
  }
  const pat = await secretManager.getSecretValue({ SecretId: patArn }).promise();

  // @ts-ignore
  const nacl: Nacl = await instantiateNacl();

  const CustomizedOctokit = Octokit.plugin(restEndpointMethods);
  const octokit = new CustomizedOctokit({ auth: pat.SecretString });

  for (const repo of repos) {
    const key = await octokit.rest.actions.getRepoPublicKey({ ... repo });
    const keyBytes = Buffer.from(key.data.key, 'base64');

    const accessKeyIdBytes = Buffer.from(accessKeyId);
    const encryptedAccessKeyId = nacl.crypto_box_seal(accessKeyIdBytes, keyBytes);
    const base64EncryptedAccessKeyId = Buffer.from(encryptedAccessKeyId).toString('base64');
    await octokit.rest.actions.createOrUpdateRepoSecret({
      ...repo,
      secret_name: 'ARTIFACT_BUCKET_ACCESS_KEY_ID',
      encrypted_value: base64EncryptedAccessKeyId,
      key_id: key.data.key_id,
    });

    const accessKeySecretBytes = Buffer.from(accessKeySecret.SecretString, 'utf8');
    const encryptedAccessKeySecret = nacl.crypto_box_seal(accessKeySecretBytes, keyBytes);
    const base64EncryptedAccessKeySecret = Buffer.from(encryptedAccessKeySecret).toString('base64');
    await octokit.rest.actions.createOrUpdateRepoSecret({
      ...repo,
      secret_name: 'ARTIFACT_BUCKET_ACCESS_KEY_SECRET',
      encrypted_value: base64EncryptedAccessKeySecret,
      key_id: key.data.key_id,
    });
  }
}

async function finishSecret(secretManager: SecretsManager, SecretId: string, ClientRequestToken: string) {
  const metadata = await secretManager.describeSecret({ SecretId }).promise();
  // iterate over metadata.VersionIdsToStage for AWSCURRENT
  if (typeof metadata.VersionIdsToStages === 'undefined') {
    throw new Error('No versions found');
  }
  for (const version of Object.keys(metadata.VersionIdsToStages)) {
    const stages = metadata.VersionIdsToStages[version];
    if (typeof stages === 'undefined') {
      continue;
    }
    if (stages.includes('AWSCURRENT') && version !== ClientRequestToken) {
      return secretManager.updateSecretVersionStage({ SecretId, VersionStage: 'AWSPREVIOUS', MoveToVersionId: version, RemoveFromVersionId: ClientRequestToken }).promise();
    }
  }
  return Promise.resolve();
}

interface Nacl {
  crypto_box_seal: (message: Buffer, key: Buffer) => Buffer;
}