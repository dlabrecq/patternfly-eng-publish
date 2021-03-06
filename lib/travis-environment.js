'use strict';

const fs = require('fs-promise'),
      colors = require('colors'),
      spawnPromise = require('spawn-rx').spawnPromise;

/**
this class encapsulates the functionality required for running the deployment from travis.
**/

class TravisEnvironment {
  init() {
    return this.checkTriggerRepo()
    .then(() => this.setUserInfo())
    .then(() => this.getDeployKey())
  }

  checkTriggerRepo() {
    if (process.env.TRAVIS !== 'true') {
      return Promise.reject(`Not running in a valid travis environment`);
    }
    if ( process.env.TRAVIS_REPO_SLUG === process.env.TRIGGER_REPO_SLUG ) {
      console.log(`This action is running against ${process.env.TRIGGER_REPO_SLUG}.`);
      if ( !process.env.TRAVIS_TAG && process.env.TRAVIS_BRANCH != process.env.TRIGGER_REPO_BRANCH ) {
        return Promise.reject(`This commit was made against ${process.env.TRAVIS_BRANCH} and not the ${process.env.TRIGGER_REPO_BRANCH} branch. Aborting.`);
      }
    } else {
      return Promise.reject(`This action is not running against ${process.env.TRIGGER_REPO_SLUG}. Aborting.`);
    }
    return Promise.resolve();
  }

  setUserInfo() {
    spawnPromise('git', ['config', '--global', 'user.name', 'patternfly-build']);
    spawnPromise('git', ['config', '--global', 'user.email', 'patternfly-build@redhat.com']);
    spawnPromise('git', ['config', '--global', 'push.default', 'simple']);
  }

  getDeployKey() {
    if (process.env.TRAVIS_PULL_REQUEST === 'true') {
      return Promise.reject('The travis ecrypted key var is not available to builds triggered by pull requests.  Aborting.');
    }
    // Get the deploy key by using Travis's stored variables to decrypt deploy_key.enc
    console.log(`ENCRYPTION_LABEL: ${process.env.ENCRYPTION_LABEL}`)
    let encryptedKeyVar=`encrypted_${process.env.ENCRYPTION_LABEL}_key`;
    let encryptedIvVar=`encrypted_${process.env.ENCRYPTION_LABEL}_iv`;
    console.log(`Checking Travis ENV VAR: ${encryptedKeyVar}...`);
    let encryptedKey=process.env[encryptedKeyVar];
    console.log(`Checking Travis ENV VAR: ${encryptedIvVar}...`);
    let encryptedIv=process.env[encryptedIvVar];
    if (! encryptedKey || ! encryptedIv ) {
      return Promise.reject('Unable to retrieve the encryption key');
    }
    return spawnPromise('mktemp', ['-u', '$HOME/.ssh/XXXXX'])
    .then(output => {
      let filename = output.split('\n')[0];
      let sshConfig = `
Host github.com
  IdentityFile ${filename}
  LogLevel ERROR`
      return spawnPromise('openssl', `aes-256-cbc -K ${encryptedKey} -iv ${encryptedIv} -in deploy_key.enc -out ${filename} -d`.split(' '))
      .then(() => spawnPromise('chmod', ['600', filename]))
      .then(() => fs.writeFile('~/.ssh/config', sshConfig));
    })
  }
}

module.exports = TravisEnvironment;
