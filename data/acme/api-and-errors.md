---
title: API, rate limits and error codes
access: public
---

# API, rate limits and error codes

## API keys

Owners and Admins can create API keys in Settings → Developer → Create key. A key is shown **only once**, when you create it. If you lose it, revoke it and create a new one.

Each key has one or more scopes:

- `files:read`: list and download files
- `files:write`: upload, edit and delete files
- `members:read`: list workspace members

Send the key in the `Authorization` header: `Authorization: Bearer <your key>`. The base URL is `https://api.acme-cloud.example/v2`.

## Rate limits

| Plan | Requests per minute (per workspace) |
|---|---|
| Free | 60 |
| Team | 600 |
| Business | 3,000 |

When you go over the limit, the API returns `ACME-429` with a `Retry-After` header that says how many seconds to wait.

## Uploading large files

A single upload request can be up to 5 GB. For bigger files, use **multipart upload**: split the file into parts of 5 MB to 100 MB each, up to 10,000 parts.

## Error codes

| Code | Meaning | What to do |
|---|---|---|
| `ACME-400` | The request is invalid | Check the JSON body against the API reference |
| `ACME-401` | The API key is missing, wrong or revoked | Check the `Authorization` header; create a new key if it was revoked |
| `ACME-403` | The key doesn't have the scope this call needs | Create a key with the right scope |
| `ACME-404` | The file or folder doesn't exist, or the key can't see it | Check the ID and the folder's sharing settings |
| `ACME-413` | The file is too big for a single request | Use multipart upload |
| `ACME-429` | Rate limit reached | Wait for the number of seconds in `Retry-After`, then retry |
| `ACME-503` | Temporary outage | Retry with exponential backoff; check status.acme-cloud.example |
| `ACME-507` | The workspace is out of storage | Delete files, empty Trash, or upgrade the plan |

## Webhooks

Acme Cloud can notify your server when something happens. Available events: `file.created`, `file.deleted`, `member.joined`.

Each webhook request has an `X-Acme-Signature` header: an HMAC-SHA256 signature of the request body, using your webhook secret. Check it before trusting the request. If your server doesn't reply with a 2xx status, we retry up to 5 times over 24 hours.
