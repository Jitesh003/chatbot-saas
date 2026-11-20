---
title: Account security
access: public
---

# Account security

## Passwords

- Passwords must be at least 12 characters.
- To reset your password, click **Forgot password** on the sign-in page. The reset link is valid for **30 minutes**.
- After 5 failed sign-in attempts, your account is locked for 15 minutes.

## Two-factor authentication (2FA)

Turn on 2FA in Profile → Security. You can use:

- an authenticator app (Google Authenticator, Microsoft Authenticator, 1Password, or any TOTP app), or
- a hardware security key (WebAuthn, such as a YubiKey).

SMS codes are not supported. When you turn on 2FA, you get **10 backup codes**. Each code works once. Store them somewhere safe.

On Team and Business plans, Admins can require 2FA for every member in Settings → Security.

### Lost your 2FA device?

1. Use one of your backup codes to sign in.
2. If you have no backup codes, ask your workspace Owner or an Admin to reset your 2FA from Settings → Members.
3. If you are the Owner, email security@acme-cloud.example from your account email address. We verify your identity before resetting 2FA, which takes up to **48 hours**.

## Single sign-on (SSO)

SSO is available on the **Business** plan only. Acme Cloud supports SAML 2.0 with Okta, Microsoft Entra ID and Google Workspace. Set it up in Settings → Security → SSO.

When SSO is enforced, members can sign in only through your identity provider. The Owner keeps a password sign-in as an emergency backup in case the identity provider is down.

## Sessions

- Web sessions end after 14 days without activity.
- Admins can sign everyone out at once from Settings → Security → Sign out all sessions.

## Audit log

The audit log (Business plan) records sign-ins, sharing changes, member changes and file deletions. Entries are kept for 1 year and can be exported as CSV.

## Reporting a security issue

Email security@acme-cloud.example. We reply within 2 business days.
