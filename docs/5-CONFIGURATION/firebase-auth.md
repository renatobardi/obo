# Firebase Authentication

Obo supports Firebase Authentication for multitenant deployments. In this mode the backend verifies Firebase ID tokens using Google's public JWKS endpoint instead of a service-account private key, and the Next.js frontend is built with the public Firebase JS SDK config.

## Overview

- No `firebase-admin` SDK or service-account JSON is required.
- The backend validates Firebase ID tokens via JWKS from `https://www.googleapis.com/robot/v1/metadata/x509/securetoken@system.gserviceaccount.com`.
- The first user to complete signup becomes the tenant owner. Subsequent users join by invite.
- One instance runs exactly one auth mode: `password` or `firebase`.

## Firebase console setup

### 1. Create or select a project

You can create the project in the [Firebase console](https://console.firebase.google.com/) or use an existing Google Cloud project. The project can stay on the Spark (no-cost) plan while you are under the free Firebase Auth tier.

### 2. Enable sign-in providers

Go to **Authentication → Sign-in method** and enable at least one of:

- **Google**
- **Email/Password**

### 3. Add your domain to Authorized domains

Obo usually runs on a custom domain (for example `https://obo.example.com`). Firebase rejects sign-ins from unknown domains.

1. Go to **Authentication → Settings → Authorized domains**.
2. Click **Add domain**.
3. Enter the domain where Obo is served, for example `obo.example.com`.

`localhost` and `*.firebaseapp.com` are allowed by default.

### 4. Register a web app and get the appId (optional)

`appId` is optional in the Firebase JS SDK, but recommended to avoid console warnings and to enable analytics later.

1. Go to **Project settings → General → Your apps**.
2. Add a Web app.
3. Copy the `appId` shown in the configuration snippet.

If you do not set `appId`, the app still works; `firebase.ts` leaves it `undefined`.

## Build-time environment variables

These values are public and are baked into the Next.js build. Pass them as Docker build arguments when you build the image.

| Build arg | Example | Required |
|-----------|---------|----------|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `AIzaSy...` | Yes |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `your-project.firebaseapp.com` | Yes |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `your-project` | Yes |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `1:...:web:...` | No |

```bash
docker build --target runtime \
  -t obo-firebase \
  --build-arg NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSy... \
  --build-arg NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project.firebaseapp.com \
  --build-arg NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project \
  --build-arg NEXT_PUBLIC_FIREBASE_APP_ID=1:...:web:... \
  .
```

## Runtime environment variables

| Variable | Example | Purpose |
|----------|---------|---------|
| `OBO_AUTH_MODE` | `firebase` | Activates Firebase auth middleware. |
| `OBO_FIREBASE_PROJECT_ID` | `your-project` | Project used for JWKS verification (`aud` and `iss` claims). |
| `API_URL` | `https://obo.example.com` | Public URL; used by the frontend proxy to reach the API. |
| `CORS_ORIGINS` | `https://obo.example.com` | Restricts cross-origin requests in production. |
| `OBO_ENCRYPTION_KEY` | hex string | Required to encrypt credentials stored in the UI. |

Example `docker-compose.override.yml`:

```yaml
services:
  obo:
    image: obo-firebase
    pull_policy: never
    environment:
      OBO_ENCRYPTION_KEY: ${OBO_ENCRYPTION_KEY}
      API_URL: https://obo.example.com
      OBO_AUTH_MODE: firebase
      OBO_FIREBASE_PROJECT_ID: your-project
      CORS_ORIGINS: https://obo.example.com
```

## Verification

1. Start the container.
2. Call the status endpoint:

```bash
curl https://obo.example.com/api/auth/status
```

Expected response:

```json
{"auth_enabled":true,"mode":"firebase","message":"Firebase authentication is required"}
```

3. Open the app in a browser, sign in with the enabled provider, and confirm the first user becomes owner.
4. As owner, go to **Settings → Members** and send an invite. The invitee opens `/join?token=<TOKEN>` and signs in to join the tenant.

## Troubleshooting

| Symptom | Cause | Fix |
|---------|-------|-----|
| `auth/unauthorized-domain` in the browser | The domain is not in Firebase's authorized domains list. | Add the Obo domain under **Authentication → Settings → Authorized domains**. |
| `AuthenticationError: Invalid token` in API logs | Token expired, wrong project, or JWKS fetch failed. | Check `OBO_FIREBASE_PROJECT_ID` matches the project that issued the token. Check outbound network. |
| CORS errors in browser | `CORS_ORIGINS` is unset or missing the frontend origin. | Set `CORS_ORIGINS=https://your-domain.com`. |
| Frontend shows `appId` warning | No `NEXT_PUBLIC_FIREBASE_APP_ID` was baked. | Optional; add it if you want the warning gone. |

## Migration from password mode

1. Ensure all notebooks are backed up.
2. Switch `OBO_AUTH_MODE` from `password` to `firebase`.
3. Build a new image with the `NEXT_PUBLIC_FIREBASE_*` build args.
4. Add the Obo domain to Firebase authorized domains.
5. Restart the container.

The database schema already supports `tenant_id`/`owner_id`; no separate migration is required.
