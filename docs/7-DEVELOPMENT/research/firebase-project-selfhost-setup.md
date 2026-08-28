# Research: Self-hosted Firebase project setup (env vars, service account, docs)

> **Note:** This document is a research artifact from the exploration phase. The final implementation uses **JWKS verification** instead of a service-account JSON. See the operator guide at [`docs/5-CONFIGURATION/firebase-auth.md`](../5-CONFIGURATION/firebase-auth.md) for the current deployment steps.

Wayfinder ticket: [#23](https://github.com/renatobardi/obo/issues/23), child of map issue [#14](https://github.com/renatobardi/obo/issues/14) ("Obo multitenant with Firebase Auth (Google + email)").

Scope: what a self-hosting operator must do in the Firebase/Google Cloud console to stand up
their **own** Firebase project for Auth (Google + Email/Password), and what that implies for
Obo's env-var surface and docs. Sources are primary (official Firebase / Google Cloud docs)
only; each claim below is followed by its source URL and a note on what it says.

## 1. Firebase project creation

- A Firebase project requires a Google Account. You can create the Firebase project directly,
  or create a plain Google Cloud project first and "add Firebase" to it later — both paths are
  supported.
  Source: https://firebase.google.com/docs/projects/learn-more

- Projects start on the **Spark** (free, no-cost) pricing plan. **Blaze** (pay-as-you-go) is
  only entered if you explicitly link a Cloud Billing account: "If billing is enabled on your
  Google Cloud project, then your Firebase project will be on Firebase's pay-as-you-go Blaze
  pricing plan." Project creation itself has no listed cost.
  Source: https://firebase.google.com/docs/projects/learn-more

- **Free-tier scale for Auth**: on the pricing page, Firebase Authentication lists "No-cost up
  to 50K MAUs" for standard providers (this bucket covers Google sign-in and email/password).
  Phone-number (SMS) auth is billed per SMS from the first message — no free allotment. Obo's
  Google + Email/Password combo only needs the no-cost bucket, so a self-hoster stays fully free
  at Spark-plan scale unless they cross 50K monthly active users.
  Source: https://firebase.google.com/pricing

  Caveat: the underlying meter is Google Cloud **Identity Platform** pricing once you exceed the
  free allotment (Firebase Auth is layered on Identity Platform's infra) — worth a follow-up read
  of `https://cloud.google.com/identity-platform/pricing` before writing final operator docs, since
  I only fetched the Firebase-side pricing page for this pass.

- The console UI/step sequence for project creation ("New Project" wizard, naming, disabling/enabling
  Google Analytics, etc.) is not itself documented as a numbered list on the pages fetched — Firebase's
  docs describe the *concepts* here and defer the click-by-click flow to the console's own onboarding
  wizard and to platform-specific "Add Firebase to your app" guides (e.g. the Web setup guide). Treat
  the actual wizard screens as self-explanatory/console-driven rather than something to hardcode into
  Obo's docs step-by-step (the console changes those screens over time).
  Source: https://firebase.google.com/docs/projects/learn-more

## 2. Enabling providers (Google, Email/Password)

- Both providers are enabled from the same place: **Firebase console → Authentication → Sign-in
  method tab** → enable the provider → **Save**. Equivalent via Firebase CLI:
  `firebase init auth` then `firebase deploy --only auth`.
  Sources: https://firebase.google.com/docs/auth/web/google-signin ,
  https://firebase.google.com/docs/auth/web/password-auth

- **Google sign-in has an extra OAuth layer** Email/Password doesn't: enabling it in the Firebase
  console also drives configuration of an OAuth client under the hood, and the doc references
  needing "your project's Google Client ID generated for your Firebase project," locatable on the
  Google Cloud/Developers Console Credentials page. Google's newer Identity Platform docs (which
  Firebase Auth's Google provider is built on) describe this more concretely: the console flow
  asks for a **public-facing app name** (shown on the OAuth consent screen) and a **support email
  address**, i.e. an OAuth consent screen does get configured as part of turning the provider on —
  Google Cloud manages this screen even though you reach it through the Firebase console.
  Sources: https://firebase.google.com/docs/auth/web/google-signin (Client ID / Credentials page
  reference); https://docs.cloud.google.com/identity-platform/docs/web/google (via search snippet —
  describes the public-facing name + support email step; **flag for follow-up**: I did not manage to
  WebFetch this Identity Platform page directly in this pass, only see it via search-result summary,
  so treat this specific claim as needing direct-source confirmation before finalizing the spec).

- **Authorized domains** are a separate, explicit list Firebase Auth checks against on every
  redirect-based sign-in (this applies broadly, not just Google): "Make sure your `continue_uri`
  is in the list of authorized domains." `localhost` and the project's own `*.firebaseapp.com` /
  `*.web.app` domains are authorized by default; anything else (a self-hoster's own domain or IP)
  must be added explicitly under Authentication → Settings → Authorized domains ("Add domain").
  Source: https://firebase.google.com/docs/auth/web/redirect-best-practices

## 3. Service account credentials (Admin SDK)

- **Console path to generate the key**: Project settings → **Service accounts** tab → **Generate
  New Private Key** → confirm with **Generate Key**. This downloads a JSON file.
  Source: https://firebase.google.com/docs/admin/setup

- **JSON key file shape** (per Google Cloud's IAM docs on service account keys — the file format
  is standard across all GCP service accounts, not Firebase-specific):
  ```json
  {
    "type": "service_account",
    "project_id": "PROJECT_ID",
    "private_key_id": "KEY_ID",
    "private_key": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n",
    "client_email": "SERVICE_ACCOUNT_EMAIL",
    "client_id": "CLIENT_ID",
    "auth_uri": "https://accounts.google.com/o/oauth2/auth",
    "token_uri": "https://accounts.google.com/o/oauth2/token",
    "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
    "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/SERVICE_ACCOUNT_EMAIL"
  }
  ```
  Source: https://docs.cloud.google.com/iam/docs/keys-create-delete

- **Loading it in the Python Admin SDK (`firebase-admin`)**: the SDK's default credential
  discovery honors the standard GCP `GOOGLE_APPLICATION_CREDENTIALS` env var pointing at the JSON
  file path; `firebase_admin.initialize_app(credentials.Certificate(path))` (explicit path) is the
  other supported form referenced in the docs.
  Source: https://firebase.google.com/docs/admin/setup

- **Storage/rotation guidance** (Google Cloud IAM docs, since the key is a general GCP service
  account key, not a Firebase-specific artifact):
  - "Always store your service account keys in a secure location... store your keys in a
    hardware-based or software-based key store."
  - Rotate keys regularly; "Deleting a service account key does not revoke short-lived
    credentials that were issued based on the key" (i.e. rotation isn't instantaneous revocation).
  - Google's stated preference is to avoid long-lived downloaded keys altogether via **Workload
    Identity Federation** where the workload runs outside Google Cloud, eliminating the
    "maintenance and security burden associated with service account keys." This doesn't fit
    Obo's self-hosted-anywhere model (WIF assumes an external identity provider federation setup
    per deployment), so a downloaded JSON key + secret-manager storage is the realistic path for
    Obo, but worth naming as the "less secure, but simpler" option in the docs.
  Source: https://docs.cloud.google.com/iam/docs/keys-create-delete

- **Mapping to Obo's existing secret convention**: `api/auth.py` and
  `obo/utils/encryption.py::get_secret_from_env` already implement the "check `VAR_FILE` first
  (Docker secret), fall back to `VAR`" pattern used for `OBO_ENCRYPTION_KEY` and `OBO_PASSWORD`.
  The service account JSON is a natural fit for the same pattern: a candidate env var like
  `OBO_FIREBASE_SERVICE_ACCOUNT_FILE` (holding the JSON file path, Docker-secret style) with a
  `OBO_FIREBASE_SERVICE_ACCOUNT` fallback holding the raw JSON string — mirroring the existing
  `_FILE`-suffix convention rather than introducing a new one. (This is an implementation
  recommendation, not a documented Firebase requirement — flagging it here for the spec phase.)
  Source (Obo's own code, not Firebase): `api/auth.py`, `obo/utils/encryption.py` lines ~29-49.

## 4. Frontend config (Firebase JS SDK)

- Firebase's own docs state frontend config values (`apiKey`, `authDomain`, `projectId`, etc.)
  are **safe to ship in client code**: "If your app's setup follows the above guidelines, then
  API keys restricted to Firebase services do not need to be treated as secrets, and it's safe to
  include them in your code or configuration files." The reasoning given: Firebase API keys
  identify the project, they don't authorize access by themselves.
  Source: https://firebase.google.com/docs/projects/api-keys

- What actually enforces access control, per the same doc: **Firebase Security Rules**
  (Firestore/RTDB/Storage), **Firebase App Check** (which apps can call covered APIs), and
  optional **API key restrictions** (which services/APIs a given key may call) — not secrecy of
  the config blob.
  Source: https://firebase.google.com/docs/projects/api-keys

- One explicit exception called out on that same page: **Gemini Developer API keys** must be
  kept secret and never shipped client-side — a different rule from the rest of the Firebase
  config. Not relevant to Auth, but worth knowing so it isn't conflated with the Auth config
  values.
  Source: https://firebase.google.com/docs/projects/api-keys

- Practical implication for Obo: the frontend Firebase config (`apiKey`, `authDomain`,
  `projectId`, `appId`, etc.) can be plain `NEXT_PUBLIC_*`-style env vars baked into the frontend
  build — no Docker-secret / `_FILE` treatment needed for these, unlike the Admin SDK service
  account JSON on the backend.

## 5. Self-hosted domain considerations

- Firebase Auth's redirect-based flows (`signInWithRedirect`, and the OAuth popup/redirect
  handler) depend on an **authorized domains list** under Authentication → Settings. Any domain
  serving the app — including a self-hoster's own domain or bare IP — must be added there, or the
  redirect is rejected: "Make sure your `continue_uri` is in the list of authorized domains."
  Source: https://firebase.google.com/docs/auth/web/redirect-best-practices

- **`authDomain` itself is not freely arbitrary.** By default `authDomain` is the project's
  `*.firebaseapp.com` domain, which Firebase's auth-handler page (`/__/auth/handler`) is hosted
  under. If an operator wants their *own* domain to appear in the OAuth flow (rather than
  `firebaseapp.com`), Firebase's own redirect-best-practices doc says this requires one of:
  1. **Reverse-proxying** requests for the auth handler path back to `firebaseapp.com`, or
  2. **Self-hosting Firebase's helper files** (downloaded from the project's own
     `firebaseapp.com` domain) at `/__/auth/handler` on the operator's domain, or
  3. Avoiding the redirect/iframe mechanism entirely — using **`signInWithPopup()`** instead of
     `signInWithRedirect()`, or handling the OAuth exchange independently and calling
     `signInWithCredential()`.
  The doc frames this as newly necessary because browsers increasingly block third-party storage
  access, breaking the cross-origin iframe trick the redirect flow used to rely on.
  Source: https://firebase.google.com/docs/auth/web/redirect-best-practices

- **Implication for Obo specifically**: since Obo instances run on arbitrary, operator-chosen
  domains/IPs (not a fixed hostname Obo controls), the simplest viable path is likely
  **`authDomain` left as the default `*.firebaseapp.com`** (no custom-domain proxying needed) combined
  with **`signInWithPopup()`** on the frontend, plus adding each operator's own domain to the
  Firebase project's authorized-domains list as a manual one-time console step during their setup.
  This avoids requiring every self-hoster to stand up a reverse proxy or mirror Firebase's static
  auth-handler files. This is a recommendation for the spec phase, not a documented Firebase
  mandate — flagging it as the option that best fits Obo's "arbitrary domain per install" model.

## Open items / follow-ups for the spec phase

1. Confirm the OAuth-consent-screen / public-app-name / support-email step for Google sign-in
   against `https://docs.cloud.google.com/identity-platform/docs/web/google` directly (only
   reached via a search-result summary in this pass, not a direct primary-source fetch).
2. Confirm exact free-tier interaction between Firebase Auth's "50K MAU no-cost" line and Google
   Cloud **Identity Platform** pricing (`https://cloud.google.com/identity-platform/pricing`) —
   the Firebase pricing page implies but doesn't fully spell out how the two pricing pages relate.
3. Firebase project **creation wizard** click-path wasn't available as a static numbered list from
   docs (console-driven) — a spec/PR should screenshot or step through the live console instead of
   relying on a doc citation for this part.
