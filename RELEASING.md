# Release guide

GitHub Actions publishes this package when the version in `package.json` changes on `master`. The release workflow validates the package, creates a matching `vX.Y.Z` tag, publishes to npm with provenance, and creates a GitHub Release with generated notes and a link to the npm package.

The daily models.dev workflow uses the same release path: when the bundled fallback catalog changes, it bumps the patch version, commits the update, and dispatches the release workflow.

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

Merge or push a commit to `master` that changes the version in `package.json` and `package-lock.json`. The **Release** workflow starts automatically. It installs dependencies, runs checks, previews the package contents, creates the version tag, publishes to npm with provenance, and creates the GitHub Release.

You can also rerun a failed or incomplete release from **Actions → Release → Run workflow**. The workflow safely skips an npm version, tag, or GitHub Release that already exists, while verifying that an existing tag points to the release commit.

## Automatic catalog releases

Every day at 03:17 UTC, GitHub Actions downloads and validates the latest models.dev catalog. When the bundled fallback changes, the workflow:

1. Bumps the patch version in `package.json` and `package-lock.json`.
2. Runs the full checks.
3. Commits and pushes the catalog and version change.
4. Dispatches the normal release workflow.

No new version is created when the catalog is unchanged. The update workflow requires `contents: write` and `actions: write`; the release workflow requires `contents: write`, `id-token: write`, and the `NPM_TOKEN` repository secret.

## Publish a later release

Choose the semantic version increment:

- `patch`: compatible bug fixes, such as `0.1.0` to `0.1.1`
- `minor`: compatible features, such as `0.1.0` to `0.2.0`
- `major`: breaking changes, such as `0.1.0` to `1.0.0`

Create the version commit without a local tag:

```bash
npm version patch --no-git-tag-version
git add package.json package-lock.json
git commit -m "chore: release v$(node -p "require('./package.json').version")"
git push origin master
```

Replace `patch` with `minor` or `major` when appropriate. The push triggers the release workflow, which creates and pushes the tag.

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

### Tag points to another commit

The workflow stops if the matching version tag already points to a different commit. Do not move or reuse release tags. Increment the package version and push a new release commit instead.

### npm rejects authentication

Confirm that the GitHub secret is named exactly `NPM_TOKEN`, the token has write access, and it has not expired or been revoked.

### npm reports that the version already exists

npm versions are immutable. Increment the package version, create a new tag, and run the release again.

### The package is absent from pi.dev

Confirm that npm published the package publicly and that `package.json` contains the `pi-package` keyword. Gallery indexing may take some time.
