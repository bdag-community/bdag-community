# Branches and deployment

Open contribution PRs against `develop`. Francois and Jeremy review those PRs
and promote `develop` to `main` through a separate PR.

GitHub Actions runs type checks, lint and tests. A successful push to `main`
builds a checksummed package, sends it over the dedicated deployment connection,
and checks [production health](https://bdag.community/api/health). The
`production` GitHub environment limits the deployment credential to `main`.
The production server holds the application's runtime configuration.

An authorised maintainer can dispatch the workflow on `main` with **Verify
package on Xneelo without deploying** for a staging check. Use **Publish this
build to the approved site** to retry a missed automatic deployment.

If a promotion PR is missing its `bdag/promotion-source` check, run **Validate
production promotion source** from `develop` and enter the PR number. The
workflow checks the current PR source and reports the result for its test
merge commit. The regular review and application checks still apply.
