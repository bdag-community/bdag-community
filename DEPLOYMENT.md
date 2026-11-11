# Branches and deployment

`develop` is for integration and `main` is the existing Community production site. The production Xneelo workflow is gated by `XNEELO_DEPLOY_ENABLED`, `DEPLOY_KNOWN_HOSTS`, and a scoped deployment credential. The original deployment remains in service until an explicit cutover.

GitHub Actions runs dependency, type and application checks on pushes and pull requests. Set `FRONTEND_BUILD_ENABLED=true` and supply the approved public build settings as `FRONTEND_PUBLIC_BUILD_JSON` for the eligible branch to produce a checksummed deployment package. Build settings may contain only browser-visible values; keep database keys, service credentials and private RPC tokens on the approved host. A build artifact does not update a running site.

Source for this branch at import: `base`, revision `1759b1abb838848ad5af505de6068ed02a6c37a1`. The previous repository and history were preserved separately.
