# DEV-ONLY SAML placeholder material — NEVER use in production.

`archflux-sp.key` / `archflux-sp.crt` are a throwaway self-signed pair
(CN=archflux-dev-only-NOT-FOR-PRODUCTION) whose only job is letting Spring
Boot bind the SAML2 relying-party configuration so the server starts
without operator-provided SSO material. They authenticate against NO real
identity provider.

Real SSO (Release D) requires setting env-provided files:
SAML_PRIVATE_KEY_LOCATION, SAML_CERT_LOCATION, SAML_IDP_CERT_LOCATION
(plus SAML_ENTITY_ID / SAML_IDP_* URLs). Until then the SAML login path is
present but non-functional — see docs/deploy/DEPLOY.md (SSO section) and
PRODUCTIZATION_SPEC.md §5.3.
