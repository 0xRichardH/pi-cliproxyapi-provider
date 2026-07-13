# Release guide

GitHub Actions publishes this package in two ways:

- A pushed `vX.Y.Z` tag triggers the normal release workflow.
- The daily models.dev workflow publishes a patch release automatically when the bundled fallback catalog changes.

In both cases, the published version must be unique on npm.

## Prerequisites

You need:

- Publish access to the `pi-cliproxyapi-provider` package on npm
- Permission to manage this repository's GitHub Actions secrets
- A clean local `master` branch

Run the tests before starting:

```bash
npm ci
npm test
npm pack --dry-run
```

## Configure npm authentication

1. Sign in to [npm](https://www.npmjs.com/).
2. Open [Access Tokens](https://www.npmjs.com/settings/~/tokens).
3. Create a granular access token with read and write package access.
4. Allow automated publishing through 2FA if npm presents that option.
5. Copy the token. npm only displays it once.
6. Open the GitHub repository's **Settings → Secrets and variables → Actions**.
7. Create a repository secret named `NPM_TOKEN` and paste the token as its value.

Never store the token in the repository, `package.json`, or a committed `.npmrc` file.

The first release creates the npm package. If a granular token cannot create it, publish the first version locally with `npm login` and `npm publish --access public`. Keep the tag-driven workflow for later releases.

## Publish the first release

The initial package version is `0.1.0`. Push the release setup before creating its tag:

```bash
git push origin master
git tag -s v0.1.0 -m "Release v0.1.0"
git push origin v0.1.0
```

If you do not sign Git tags, omit `-s`:

```bash
git tag v0.1.0
```

Watch the **Publish to npm** workflow on the repository's **Actions** page. The workflow installs dependencies, runs tests, checks the tag against `package.json`, previews the package contents, and publishes to npm with provenance.

## Automatic catalog releases

Every day at 03:17 UTC, GitHub Actions downloads and validates the latest models.dev catalog. When the bundled fallback changes, the workflow:

1. Runs the full checks.
2. Bumps the patch version in `package.json` and `package-lock.json`.
3. Commits and pushes the catalog and version change.
4. Publishes the package to npm with provenance.

No new version is created when the catalog is unchanged. If publication fails after the release commit was pushed, the next daily or manual run detects that the committed automatic-release version is absent from npm and retries it. The workflow requires `contents: write` permission and the `NPM_TOKEN` repository secret.

## Publish a later release

Choose the semantic version increment:

- `patch`: compatible bug fixes, such as `0.1.0` to `0.1.1`
- `minor`: compatible features, such as `0.1.0` to `0.2.0`
- `major`: breaking changes, such as `0.1.0` to `1.0.0`

Create the version commit and tag:

```bash
npm version patch --sign-git-tag-version
```

Replace `patch` with `minor` or `major` when appropriate. Then push the commit and tag:

```bash
git push origin master --follow-tags
```

## Verify the release

After the workflow succeeds, inspect the published package:

```bash
npm view pi-cliproxyapi-provider
```

Test installation through Pi:

```bash
pi install npm:pi-cliproxyapi-provider
```

The package should appear at <https://pi.dev/packages/pi-cliproxyapi-provider> after the gallery indexes the npm release.

## Troubleshooting

### Tag and package versions differ

The workflow stops when, for example, tag `v0.1.1` points to a commit whose `package.json` still contains `0.1.0`. Create a new matching version and tag. Do not reuse a published npm version.

### npm rejects authentication

Confirm that the GitHub secret is named exactly `NPM_TOKEN`, the token has write access, and it has not expired or been revoked.

### npm reports that the version already exists

npm versions are immutable. Increment the package version, create a new tag, and run the release again.

### The package is absent from pi.dev

Confirm that npm published the package publicly and that `package.json` contains the `pi-package` keyword. Gallery indexing may take some time.
