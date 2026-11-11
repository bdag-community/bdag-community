# Branches and deployment

`develop` is for integration. `main` is the Community website deployed to the existing Xneelo host.

Pushes and pull requests run type and application checks. A successful push to `main` builds a checksummed package. With the repository and host deployment gates enabled, that package is promoted to https://bdag.community/api/health using the existing Xneelo runtime. The dedicated key cannot open a shell or deploy another app. A manual run with `verify_xneelo` stages and validates the package without changing the active site. Host configuration and credentials stay on Xneelo.

Source for this branch at import: `develop`, revision `1759b1abb838848ad5af505de6068ed02a6c37a1`. The previous repository and history were preserved separately.

If GitHub does not deliver a push run, dispatch the workflow on the publishing branch with **Publish this build to the approved site**. That uses the same validation and host gates.
